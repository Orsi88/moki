// Agents: a role + instructions + the skills it uses + the access it asks for,
// organized by category. An agent may also declare what it needs and delivers
// (inputs, output files), the results it can end with (outcomes: an operation
// follows the arrow of the result), the MCP servers it uses (to read or to
// execute) and its default AI tool: multi-agent operations chain agents through them. Built-in agents live in agents/<category>/<name>.md
// (versioned framework); the user's own agents live in
// workspace/library/agents/<category>/<name>.md (never versioned here).

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SLUG, readJson, workspaceDir } from './repo.mjs';
import { parseFrontmatter } from './frontmatter.mjs';

export const ACCESS_LEVELS = ['read-only', 'project-write', 'repository-write'] as const;
export const AGENT_SECTIONS = ['Role', 'When to use', 'How to work', 'Boundaries'];
const AGENT_KEYS = ['name', 'description', 'category', 'skills', 'access', 'inputs', 'outputs', 'outcomes', 'mcps', 'ai', 'model', 'metadata'];
// AI tools that can run an agent on their own, in a terminal (core.ts TOOLS); '' = the project's or the user's choice.
export const AGENT_AIS = ['claude', 'codex', 'cursor-agent', 'gemini', 'antigravity'] as const;
// Claude Code subagent model aliases; left out = the session's model.
export const AGENT_MODELS = ['haiku', 'sonnet', 'opus', 'fable', 'inherit'] as const;
export const MCP_MODES =['read', 'execute'] as const; // read: queries data; execute: changes something outside Moki
const MCP_NAME = /^[A-Za-z0-9][\w.-]{0,63}$/;
const OUTCOME = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,39}$/u;
const OUTPUT_FILE = /^[^/\\:"<>|?]{1,120}\.[A-Za-z0-9*]{1,10}$/; // a file name in the run's outputs folder; * matches any text
const STATUS_PREFIX: Record<string, string> = { stable: '', draft: '', 'pending-migration': '[PENDING MIGRATION]', planned: '[PLANNED]' };

export interface Agent {
  name: string;
  description: string;
  category: string;
  skills: string[];
  access: string;
  inputs: string[]; // what it needs to start, in words (e.g. "User stories")
  outputs: string[]; // files it delivers in the run's outputs folder (e.g. "test-cases.json", "*.xlsx")
  outcomes: string[]; // the results it ends with (e.g. "approved", "rejected"); an operation can branch on them
  mcps: AgentMcp[];
  ai: string; // default AI tool (AGENT_AIS), or ''
  model: string; // Claude Code subagent model (AGENT_MODELS), or ''
  version: string;
  status: string;
  basedOn: string;
  source: 'builtin' | 'custom';
  path: string; // relative to the framework root, "/" separators
  body: string;
}

export interface AgentMcp { name: string; mode: string }
export interface AgentContract { inputs: string[]; outputs: string[]; outcomes?: string[]; mcps: AgentMcp[]; ai: string }

export interface Category { id: string; label: string; description: string; source: 'builtin' | 'custom' }

export const builtinDir = (root = ROOT): string => join(root, 'agents');
export const libraryDir = (root = ROOT): string => join(workspaceDir(root), 'library', 'agents');

const list = (v: unknown): string[] => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const mcpList = (v: unknown): AgentMcp[] => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>) : [])
  .map(([name, mode]) => ({ name, mode: String(mode ?? '') }));
const titleCase = (slug: string): string => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export function parseAgent(text: string, source: Agent['source'], path: string): { agent: Agent | null; errors: string[] } {
  const { data, body, errors } = parseFrontmatter(text) as { data: Record<string, unknown> | null; body: string; errors: string[] };
  if (!data) return { agent: null, errors };
  const meta = (typeof data.metadata === 'object' && data.metadata ? data.metadata : {}) as Record<string, string>;
  const agent: Agent = {
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    category: String(data.category ?? ''),
    skills: list(data.skills),
    access: String(data.access ?? ''),
    inputs: list(data.inputs),
    outputs: list(data.outputs),
    outcomes: list(data.outcomes),
    mcps: mcpList(data.mcps),
    ai: String(data.ai ?? ''),
    model: String(data.model ?? ''),
    version: String(meta.version ?? ''),
    status: String(meta.status ?? ''),
    basedOn: String(meta.basedOn ?? ''),
    source,
    path,
    body,
  };
  for (const key of Object.keys(data)) if (!AGENT_KEYS.includes(key)) errors.push(`unknown key "${key}"`);
  return { agent, errors };
}

// Validation shared by the framework validator and the app's editor.
export function validateAgent(agent: Agent, ctx: { skills: string[]; categories: string[]; fileName: string; folder: string }): string[] {
  const errors: string[] = [];
  if (!SLUG.test(agent.name) || agent.name.length > 64) errors.push(`invalid name "${agent.name}" (lowercase letters, digits, single hyphens)`);
  if (agent.name !== ctx.fileName) errors.push(`name "${agent.name}" must match the file name "${ctx.fileName}"`);
  if (!agent.description || agent.description.length > 1024) errors.push('description is required (max 1024 characters)');
  if (!SLUG.test(agent.category)) errors.push(`invalid category "${agent.category}"`);
  else if (agent.category !== ctx.folder) errors.push(`category "${agent.category}" must match its folder "${ctx.folder}"`);
  if (agent.source === 'builtin' && !ctx.categories.includes(agent.category)) errors.push(`category "${agent.category}" is not defined in agents/categories.json`);
  if (!agent.skills.length) errors.push('list at least one skill');
  for (const s of agent.skills) if (!ctx.skills.includes(s)) errors.push(`unknown skill "${s}"`);
  if (!(ACCESS_LEVELS as readonly string[]).includes(agent.access)) errors.push(`access must be one of ${ACCESS_LEVELS.join(', ')}`);
  if (agent.model && !(AGENT_MODELS as readonly string[]).includes(agent.model)) errors.push(`model must be one of ${AGENT_MODELS.join(', ')} (or left out)`);
  if (!/^\d+\.\d+\.\d+$/.test(agent.version)) errors.push('metadata.version must be semver (e.g. "1.0.0")');
  if (!(agent.status in STATUS_PREFIX)) errors.push(`metadata.status must be one of ${Object.keys(STATUS_PREFIX).join(', ')}`);
  else if (STATUS_PREFIX[agent.status] && !agent.description.startsWith(STATUS_PREFIX[agent.status])) {
    errors.push(`description of a "${agent.status}" agent must start with ${STATUS_PREFIX[agent.status]}`);
  }
  errors.push(...validateContract(agent));
  const headings = [...agent.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  for (const s of AGENT_SECTIONS) if (!headings.includes(s)) errors.push(`missing section "## ${s}"`);
  return errors;
}

// Inputs, outputs, MCP servers and AI tool: shared by library agents and agents created for a project or every project.
export function validateContract(c: AgentContract & { access?: string }): string[] {
  const errors: string[] = [];
  const dupes = (items: string[]) => items.filter((x, i) => items.findIndex((y) => y.toLowerCase() === x.toLowerCase()) !== i);
  for (const i of c.inputs) if (i.length > 80) errors.push(`input "${i.slice(0, 20)}…" is too long (max 80 characters)`);
  const outcomes = c.outcomes ?? [];
  if (outcomes.length > 8) errors.push('list at most 8 outcomes');
  for (const o of outcomes) if (!OUTCOME.test(o)) errors.push(`outcome "${o}" must be a short word or two (letters, digits, spaces, hyphens; max 40)`);
  for (const d of dupes(outcomes)) errors.push(`"${d}" is listed twice`);
  for (const o of c.outputs) if (!OUTPUT_FILE.test(o)) errors.push(`output "${o}" must be a file name with an extension, without folders (e.g. "test-cases.json" or "*.xlsx")`);
  for (const d of [...dupes(c.inputs), ...dupes(c.outputs)]) errors.push(`"${d}" is listed twice`);
  for (const m of c.mcps) {
    if (!MCP_NAME.test(m.name)) errors.push(`invalid MCP server name "${m.name}"`);
    if (!(MCP_MODES as readonly string[]).includes(m.mode)) errors.push(`MCP "${m.name}": mode must be ${MCP_MODES.join(' or ')}`);
  }
  for (const d of dupes(c.mcps.map((m) => m.name))) errors.push(`MCP "${d}" is listed twice`);
  if (c.ai && !(AGENT_AIS as readonly string[]).includes(c.ai)) errors.push(`ai must be one of ${AGENT_AIS.join(', ')} (or left out)`);
  // Reading only means writing nothing: no files delivered, nothing changed through an MCP.
  if (c.access === 'read-only' && c.outputs.length) errors.push('a read-only agent writes nothing, so it cannot list outputs');
  if (c.access === 'read-only' && c.mcps.some((m) => m.mode === 'execute')) errors.push('a read-only agent cannot execute through an MCP (use read)');
  return errors;
}

// The frontmatter lines of a contract (none for an empty one), in the order the files use.
export function contractLines(c: AgentContract): string[] {
  return [
    ...(c.inputs.length ? [`inputs: ${c.inputs.join(', ')}`] : []),
    ...(c.outputs.length ? [`outputs: ${c.outputs.join(', ')}`] : []),
    ...(c.outcomes?.length ? [`outcomes: ${c.outcomes.join(', ')}`] : []),
    ...(c.mcps.length ? ['mcps:', ...c.mcps.map((m) => `  ${m.name}: ${m.mode}`)] : []),
    ...(c.ai ? [`ai: ${c.ai}`] : []),
  ];
}

// Cleans a contract sent by the app: trimmed, empty items dropped. Commas separate items in the file, so they are refused inside one.
export function cleanContract(raw: unknown): AgentContract {
  const r = (raw ?? {}) as { inputs?: unknown; outputs?: unknown; outcomes?: unknown; mcps?: unknown; ai?: unknown };
  const items = (v: unknown, what: string): string[] => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map((x) => { if (x.includes(',')) throw new Error(`Use no commas in the ${what} "${x}".`); return x; });
  const mcps = (Array.isArray(r.mcps) ? r.mcps : []).map((m) => ({ name: String((m as AgentMcp)?.name ?? '').trim(), mode: String((m as AgentMcp)?.mode ?? '') }))
    .filter((m) => m.name);
  return { inputs: items(r.inputs, 'input'), outputs: items(r.outputs, 'output'), outcomes: items(r.outcomes, 'outcome'), mcps, ai: String(r.ai ?? '').trim() };
}

// Puts a contract in an agent file, in place of the one there (before metadata, or at the end of the frontmatter).
export function withContract(text: string, c: AgentContract): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const end = normalized.indexOf('\n---', 4);
  if (!normalized.startsWith('---\n') || end === -1) throw new Error('The file has no frontmatter.');
  const lines = normalized.slice(4, end).split('\n');
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^(inputs|outputs|outcomes|ai):/.test(line)) { skipping = false; continue; }
    if (/^mcps:/.test(line)) { skipping = true; continue; }
    if (skipping && /^ {2}\S/.test(line)) continue;
    skipping = false;
    kept.push(line);
  }
  const at = kept.findIndex((l) => /^metadata:/.test(l));
  const added = contractLines(c);
  const front = at === -1 ? [...kept, ...added] : [...kept.slice(0, at), ...added, ...kept.slice(at)];
  return `---\n${front.join('\n')}${normalized.slice(end)}`;
}

// Puts the skills an agent uses in its file, in place of the ones there.
export function withSkills(text: string, skills: string[]): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const end = normalized.indexOf('\n---', 4);
  if (!normalized.startsWith('---\n') || end === -1) throw new Error('The file has no frontmatter.');
  const lines = normalized.slice(4, end).split('\n');
  const line = `skills: ${skills.join(', ')}`;
  const at = lines.findIndex((l) => /^skills:/.test(l));
  if (at >= 0) lines[at] = line;
  else lines.splice(Math.max(0, lines.findIndex((l) => /^access:/.test(l))), 0, line);
  return `---\n${lines.join('\n')}${normalized.slice(end)}`;
}

// The description (one line in the frontmatter) and the instructions (the body) of an agent's file.
export function withProfile(text: string, profile: { description: string; body: string }): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const end = normalized.indexOf('\n---', 4);
  if (!normalized.startsWith('---\n') || end === -1) throw new Error('The file has no frontmatter.');
  const one = profile.description.replace(/\s+/g, ' ').trim();
  const value = /^["'>|]/.test(one) || /["']$/.test(one) ? `"${one}"` : one;
  const lines = normalized.slice(4, end).split('\n');
  const at = lines.findIndex((l) => /^description:/.test(l));
  if (at >= 0) lines[at] = `description: ${value}`;
  else lines.splice(1, 0, `description: ${value}`);
  const body = profile.body.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s*$/, '\n');
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

function readAgents(dir: string, source: Agent['source'], root: string): Agent[] {
  if (!existsSync(dir)) return [];
  const agents: Agent[] = [];
  for (const cat of readdirSync(dir).sort()) {
    const catDir = join(dir, cat);
    if (!statSync(catDir).isDirectory()) continue;
    for (const file of readdirSync(catDir).filter((f) => f.endsWith('.md')).sort()) {
      const rel = `${source === 'builtin' ? 'agents' : 'workspace/library/agents'}/${cat}/${file}`;
      const { agent } = parseAgent(readFileSync(join(catDir, file), 'utf8'), source, rel);
      if (agent) agents.push(agent);
    }
  }
  return agents;
}

export function listAgents(root = ROOT): Agent[] {
  const builtin = readAgents(builtinDir(root), 'builtin', root);
  const names = new Set(builtin.map((a) => a.name));
  // A custom agent can never shadow a built-in one.
  const custom = readAgents(libraryDir(root), 'custom', root).filter((a) => !names.has(a.name));
  return [...builtin, ...custom];
}

export function listCategories(root = ROOT): Category[] {
  const builtinFile = join(builtinDir(root), 'categories.json');
  const builtin = existsSync(builtinFile) ? readJson(builtinFile) as Record<string, { label: string; description?: string }> : {};
  const cats: Category[] = Object.entries(builtin).map(([id, c]) => ({ id, label: c.label, description: c.description ?? '', source: 'builtin' }));
  const known = new Set(cats.map((c) => c.id));
  for (const a of listAgents(root)) {
    if (!known.has(a.category)) { known.add(a.category); cats.push({ id: a.category, label: titleCase(a.category), description: '', source: 'custom' }); }
  }
  return cats;
}

// Built-in agents of this category maintain Moki itself: they are never linked to, offered to or run for a project.
export const DEVELOPMENT_CATEGORY = 'framework';
export const isDevelopmentAgent = (a: Agent): boolean => a.source === 'builtin' && a.category === DEVELOPMENT_CATEGORY;
// Status only: the agent's procedure is complete (what the Claude Code subagent mirror needs).
export const hasUsableStatus = (a: Agent): boolean => ['stable', 'draft'].includes(a.status);
// Usable by a project: usable status and not a development agent.
export const isUsableAgent = (a: Agent): boolean => hasUsableStatus(a) && !isDevelopmentAgent(a);

// Copies an agent into the user's library for customization; the original never changes.
export function duplicateAgent(name: string, root = ROOT): Agent {
  const source = listAgents(root).find((a) => a.name === name);
  if (!source) throw new Error(`Unknown agent "${name}".`);
  const taken = new Set(listAgents(root).map((a) => a.name));
  let newName = `${source.name}-custom`;
  for (let i = 2; taken.has(newName); i++) newName = `${source.name}-custom-${i}`;
  const text = readFileSync(join(root, source.path), 'utf8').replace(/\r\n/g, '\n');
  const end = text.indexOf('\n---', 4);
  let front = text.slice(0, end).replace(/^name: .*$/m, `name: ${newName}`);
  front = /^ {2}basedOn: .*$/m.test(front) ? front.replace(/^ {2}basedOn: .*$/m, `  basedOn: ${source.name}`)
    : front.replace(/^metadata:$/m, `metadata:\n  basedOn: ${source.name}`);
  const body = text.slice(end).replace(/^# (.+)$/m, '# $1 (custom)');
  const dir = join(libraryDir(root), source.category);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${newName}.md`), front + body);
  return listAgents(root).find((a) => a.name === newName) as Agent;
}

// Claude Code subagent generated from an agent (portable: no app needed).
// Read-only agents lose the editing tools, like Claude Code's own Explore agent;
// the shell stays for read-only commands and their Boundaries forbid writing with it.
export function claudeSubagent(agent: Agent): string {
  const description = agent.description.replace(/^\[[A-Z ]+\]\s*/, '').replace(/\n/g, ' ');
  const skills = agent.skills.map((s) => `- \`${s}\`: read and follow \`.claude/skills/${s}/SKILL.md\``).join('\n');
  const tools = agent.access === 'read-only' ? 'disallowedTools: Edit, Write, NotebookEdit\n' : '';
  const model = agent.model ? `model: ${agent.model}\n` : '';
  return `---\nname: ${agent.name}\ndescription: ${JSON.stringify(description)}\n${tools}${model}---\n${agent.body.trimEnd()}\n\n## Skills\n\n${skills}\n`;
}
