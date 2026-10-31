// Moki's MCP server (stdio): the AI of an IDE reads one project's context, agents
// and skills through read-only tools. The project is fixed when the server starts
// (--project, or the folder linked to it: --folder or the current folder) and no
// tool can change it. The IDE starts the server when its AI needs it and stops it
// with the session; the Moki desktop app does not have to be open.
// Usage: node ide/mcp/server.ts [--project <id>] [--folder <path>]
// (QA_ROOT and QA_WORKSPACE choose the framework and the workspace, as for the qa command.)

import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { ROOT, parseArgs, readJson, setWorkspaceDir } from '../../scripts/lib/repo.mjs';
import { listProjects } from '../../scripts/lib/core.ts';
import { activeWorkspace } from '../../desktop/workspaces.ts';
import { CompanionError, openCompanion, projectsForFolder, type Companion, type ResourceKind } from '../../desktop/companion.ts';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const KINDS: ResourceKind[] = ['context', 'note', 'shared', 'agent', 'skill'];

interface Tool { name: string; description: string; inputSchema: Record<string, unknown>; run: (c: Companion, args: Record<string, unknown>) => unknown }

const object = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

const TOOLS: Tool[] = [
  {
    name: 'moki_get_project',
    description: 'The Moki project this folder belongs to: name, description, deliverable language, tags, and the agents and skills it offers. Call it first.',
    inputSchema: object(),
    run: (c) => c.summary(),
  },
  {
    name: 'moki_list_resources',
    description: 'References (id, title, short description, mode) to the project\'s context files, notes, context shared by tags, agents and skills. Content is not included: read it with moki_get_resource. Mode "ask" means the person must select it in the Moki panel first.',
    inputSchema: object({ kind: { type: 'string', enum: KINDS, description: 'Only this kind of resource.' } }),
    run: (c, a) => c.resources(a.kind),
  },
  {
    name: 'moki_search_knowledge',
    description: 'Plain-text search (case-insensitive) in the project\'s readable context files, notes, shared context, agents and skills. Returns lines with the resource id.',
    inputSchema: object({ query: { type: 'string', description: 'Words or a phrase to find.' } }, ['query']),
    run: (c, a) => c.search(a.query),
  },
  {
    name: 'moki_get_resource',
    description: 'The full text of one resource, by the id from moki_list_resources, moki_search_knowledge or moki_get_context.',
    inputSchema: object({ id: { type: 'string' } }, ['id']),
    run: (c, a) => c.getResource(a.id),
  },
  {
    name: 'moki_get_context',
    description: 'The context pack for a task: the resources the person selected, with their text (within the budget), then references to the most related resources. Use it before working on a task of this project.',
    inputSchema: object({
      task: { type: 'string', description: 'What you are about to do, in a sentence.' },
      budget: { type: 'number', description: 'Maximum characters of selected text (default 24000, at most 100000).' },
    }, ['task']),
    run: (c, a) => c.contextPack(a.task, a.budget),
  },
  {
    name: 'moki_get_agent',
    description: 'A Moki agent\'s instructions (role, how to work, boundaries, skills). Reading them does not run the agent: follow them yourself, or ask the person to run it in Moki.',
    inputSchema: object({ name: { type: 'string' } }, ['name']),
    run: (c, a) => c.getResource(`agent:${String(a.name ?? '')}`),
  },
];

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

// One JSON-RPC message in, its reply out (null for notifications).
export function createHandler(companion: Companion | null, unbound: string) {
  return (msg: Message): Record<string, unknown> | null => {
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
    const error = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
    if (msg.id === undefined || msg.id === null) return null; // notifications (initialized, cancelled)
    switch (msg.method) {
      case 'initialize': {
        const asked = String(msg.params?.protocolVersion ?? '');
        return reply({
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'moki', version: (() => { try { return String((readJson(join(ROOT, 'package.json')) as { version: string }).version); } catch { return '0'; } })() },
          instructions: companion
            ? `Moki project "${companion.project}". Call moki_get_context with the task before working, and read only the resources you need.`
            : unbound,
        });
      }
      case 'ping': return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } })) });
      case 'tools/call': {
        const name = String(msg.params?.name ?? '');
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) return error(-32602, `Unknown tool: ${name}`);
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        const text = (t: string, isError = false) => reply({ content: [{ type: 'text', text: t }], isError });
        if (!companion) return text(unbound, true);
        try {
          const value = tool.run(companion, args);
          companion.log(name, { args });
          return text(JSON.stringify(value, null, 2));
        } catch (e) {
          companion.log(name, { args, error: e instanceof Error ? e.message : String(e) });
          if (e instanceof CompanionError) return text(e.message, true);
          return text('Moki could not read this.', true);
        }
      }
      default: return error(-32601, `Method not found: ${msg.method}`);
    }
  };
}

// The project for this session, or why there is none.
export function bindProject(root: string, args: { project?: unknown; folder?: unknown }, cwd: string): { project: string | null; reason: string } {
  if (typeof args.project === 'string') {
    return listProjects(root).includes(args.project) ? { project: args.project, reason: '' } : { project: null, reason: `Moki has no project "${args.project}" in the active workspace.` };
  }
  const folder = typeof args.folder === 'string' ? args.folder : cwd;
  const found = projectsForFolder(root, folder);
  if (found.length === 1) return { project: found[0], reason: '' };
  return {
    project: null,
    reason: found.length
      ? `This folder is linked to more than one Moki project (${found.join(', ')}). Choose one in the Moki panel of the IDE.`
      : 'This folder is not linked to a Moki project. Link it in the Moki desktop app (project → Choose my folder) or choose a project in the Moki panel of the IDE.',
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2)) as { project?: unknown; folder?: unknown };
  if (!process.env.QA_WORKSPACE) setWorkspaceDir(ROOT, activeWorkspace(ROOT).path);
  const { project, reason } = bindProject(ROOT, args, process.cwd());
  const handle = createHandler(project ? openCompanion(ROOT, project) : null, reason);
  // stdout carries only protocol messages: one JSON object per line.
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: Message;
    try { msg = JSON.parse(line) as Message; } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    const out = handle(msg);
    if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
  });
  rl.on('close', () => process.exit(0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
