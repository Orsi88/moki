// What the Moki panel inside the IDE (app/src/companion, a webview) may ask for.
// A closed list of calls over the desktop service and the Companion, always for
// the project the IDE is connected to: a project id sent by the page is never
// used. Starting the AI goes through the same service.launch as the desktop app,
// so the request, the context exclusions and the MCP servers are the same.

import { listProjects, projectSummary, type ProjectSummary } from '../scripts/lib/core.ts';
import { enabledServers, generatedEntries, syncToolFolder, toolFile, type McpServer } from '../scripts/lib/mcp.ts';
import type { Companion, Resource } from './companion.ts';
import type { Service } from './service.ts';

// What the extension host gives: the active project, the clipboard, the chat, a confirmation dialog, the open folder.
export interface CompanionHost {
  companion: () => Companion | null;
  choose: (project: string) => void;
  copy: (text: string) => Promise<void> | void;
  focusChat: (prompt: string) => Promise<string>; // which chat was focused, for the message
  confirm: (message: string, detail: string) => Promise<boolean>;
  folder: () => string | null; // the folder open in the IDE (its .mcp.json for Claude Code)
  tracked: (folder: string, file: string) => boolean; // the file is versioned in the folder's Git repository
  mokiServer: (project: string) => McpServer;
}

export interface ContextFile { id: string; path: string; title: string; description: string; kind: string; source: string; included: boolean; priority: boolean }
export interface CompanionState { project: ProjectSummary | null; projects: { id: string; name: string }[]; folder: string | null; mcp: { id: string; name: string; access: string; transport: string }[] }
export interface LaunchInput { activity?: unknown; files?: unknown; note?: unknown; language?: unknown; run?: unknown; agent?: unknown }

const CONTEXT_KINDS = new Set(['context', 'note', 'shared']);
const included = (r: Resource): boolean => r.mode === 'auto' || r.selected;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function createCompanionApi(root: string, service: Service, host: CompanionHost) {
  const active = (): Companion => {
    const c = host.companion();
    if (!c) throw new Error('Choose the Moki project of this folder first.');
    return c;
  };
  const contextFiles = (c: Companion): ContextFile[] => c.allResources().filter((r) => CONTEXT_KINDS.has(r.kind)).map((r) => ({
    id: r.id, path: r.id.replace(/^.*?\/projects\/[^/]+\//, ''), title: r.title, description: r.description, kind: r.kind, source: r.source,
    included: included(r), priority: r.selected,
  }));
  const context = (id: unknown): Resource => {
    const r = active().allResources().find((x) => x.id === id && CONTEXT_KINDS.has(x.kind));
    if (!r) throw new Error('This file is not in the project\'s context.');
    return r;
  };

  // The request as the desktop app builds it; files left out of the context go as exclusions.
  const request = (input: LaunchInput, tool: 'claude' | 'print') => {
    const c = active();
    const choice = service.contextChoice(c.project);
    const offered = new Set([...choice.own, ...choice.shared.flatMap((g) => g.sources.flatMap((s) => s.paths))]);
    const exclude = contextFiles(c).filter((f) => !f.included && offered.has(f.id)).map((f) => f.id);
    return service.launch({
      project: c.project, activity: String(input.activity ?? 'open'), tool, files: strings(input.files), note: String(input.note ?? ''),
      language: String(input.language ?? 'English'), run: input.run ? String(input.run) : undefined, agent: input.agent ? String(input.agent) : undefined,
      exclude: input.activity === 'resume' ? [] : exclude,
    });
  };

  const calls: Record<string, (...a: unknown[]) => unknown> = {
    state: (): CompanionState => {
      const c = host.companion();
      return {
        project: c ? projectSummary(c.project, root) : null,
        projects: listProjects(root).map((id) => ({ id, name: projectSummary(id, root).name })),
        folder: host.folder(),
        mcp: c ? enabledServers(c.project, root).map(({ id, name, access, transport }) => ({ id, name, access, transport })) : [],
      };
    },
    chooseProject: (id) => {
      if (typeof id !== 'string' || !listProjects(root).includes(id)) throw new Error('Unknown project.');
      host.choose(id);
      return true;
    },
    activities: () => service.activities(),
    // Only the agents this project uses, ready to run.
    agents: () => {
      const on = new Set(service.projectAgents(active().project));
      return service.agents().filter((a) => a.usable && on.has(a.name));
    },
    inbox: () => service.inbox(active().project),
    openRuns: () => service.openRuns(active().project),
    operationRuns: () => service.operationRuns(active().project),
    context: () => contextFiles(active()),
    // "Goes to the AI": on = the AI may read it and requests include it; off = left out of both.
    setIncluded: (id, on) => {
      const r = context(id);
      const c = active();
      if (on === true) c.setMode(r.id, 'auto');
      else { c.select(r.id, false); c.setMode(r.id, 'manual'); }
      return contextFiles(c);
    },
    // "Priority": moki_get_context gives it first (and it counts as included).
    setPriority: (id, on) => {
      const r = context(id);
      active().select(r.id, on === true);
      return contextFiles(active());
    },
    // The AI tool in a terminal of the IDE, with the request and the project's MCP servers (--mcp-config).
    launch: (input) => request((input ?? {}) as LaunchInput, 'claude'),
    // The request copied for the IDE's chat, which Moki cannot fill by itself.
    copyRequest: async (input) => {
      const { prompt } = request((input ?? {}) as LaunchInput, 'print');
      await host.copy(prompt);
      const chat = await host.focusChat(prompt);
      return { prompt, chat };
    },
    // Claude Code in the IDE reads MCP servers from the folder's .mcp.json: Moki's entries go there after the person confirms.
    connectClaude: async () => {
      const c = active();
      const folder = host.folder();
      if (!folder) throw new Error('Open a folder in the IDE first.');
      const file = toolFile(folder, 'claude');
      const versioned = host.tracked(folder, '.mcp.json');
      const ok = await host.confirm(
        `Write Moki's MCP servers to ${file}?`,
        `Claude Code in the IDE reads its MCP servers from this file. Only Moki's entries (moki, moki-*) change; yours stay, and the current file is backed up to .moki-backup/ first.${versioned ? ' This file is versioned in Git: the change will show in your commits.' : ''}`,
      );
      if (!ok) return { changed: false, cancelled: true, file };
      const r = syncToolFolder(folder, generatedEntries(host.mokiServer(c.project), enabledServers(c.project, root)), 'claude');
      c.log('connect-claude', { changed: r.changed });
      return { ...r, cancelled: false };
    },
  };

  // One message from the page: only names in the list, never the whole service.
  return async (method: unknown, args: unknown): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> => {
    if (typeof method !== 'string' || !Object.hasOwn(calls, method)) return { ok: false, error: 'Unknown action.' };
    try {
      return { ok: true, value: await calls[method](...(Array.isArray(args) ? args : [])) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };
}
