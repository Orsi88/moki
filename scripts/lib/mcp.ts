// MCP Manager: the MCP servers Moki knows, in one catalog per workspace
// (<workspace>/mcp-servers.json). Each server says where it applies: every project
// of the workspace (projects: [], "Global") or only the projects listed. A server
// can be switched off without deleting it. Ids are stable (a rename keeps them) and
// unique in the catalog, so an agent's contract (mcps: {<id>: read|execute}) never
// points at two servers. Credentials are never stored: environment and header values
// are ${VARIABLE} references, read from the environment only when a server starts or
// is tested.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readJson, workspaceDir } from './repo.mjs';
import { PATTERNS } from './secret-patterns.mjs';
import { listProjects, slugify } from './core.ts';

export type McpTransport = 'stdio' | 'http';
export type McpAccess = 'read' | 'execute'; // read: queries data; execute: changes something outside Moki

export interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: McpTransport;
  command: string; // stdio: a program name or an absolute path, started without a shell
  args: string[];
  url: string; // http: the server's endpoint
  env: Record<string, string>; // stdio
  headers: Record<string, string>; // http
  access: McpAccess;
  enabled: boolean; // off: kept in the catalog, given to no project
  projects: string[]; // where it applies: [] = every project of the workspace (global)
}

export class McpError extends Error {}

export const MCP_FILE = 'mcp-servers.json';
export const MCP_ACCESS: McpAccess[] = ['read', 'execute'];
export const MOKI_SERVER = 'moki'; // Moki's own server (ide/mcp/server.ts) in generated configs; the others are moki-<id>
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VAR = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const SECRET_KEY = /(token|secret|password|passwd|pwd|api[-_]?key|private[-_]?key|auth|credential|cookie)/i;
const LIMIT = { name: 60, description: 300, command: 500, arg: 2000, args: 50, url: 2000, pairs: 50, value: 2000, projects: 500 };

const catalogFile = (root: string) => join(workspaceDir(root), MCP_FILE);
const writeJson = (file: string, data: unknown) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); };

export function listServers(root: string): McpServer[] {
  let data: { servers?: unknown } = {};
  try { data = readJson(catalogFile(root)) as { servers?: unknown }; } catch { /* none yet */ }
  const list = Array.isArray(data.servers) ? data.servers : [];
  return list.flatMap((raw) => { try { return [clean(raw)]; } catch { return []; } }); // a broken entry is skipped, never half-used
}

const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')).slice(0, max) : []);
const pairs = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v).slice(0, LIMIT.pairs)) out[k.trim()] = String(val ?? '');
  return out;
};

// A value that holds a credential, written as is: refused (it would sit in a file).
export function literalSecret(key: string, value: string): string | null {
  const bare = value.replace(REF, '').trim();
  if (!bare) return null;
  const pattern = (PATTERNS as [string, RegExp][]).find(([, re]) => re.test(value) || re.test(`${key}="${value}"`));
  if (pattern) return pattern[0];
  if (SECRET_KEY.test(key) && !/^(bearer|basic|token)\s*$/i.test(bare)) return 'credential';
  return null;
}

// Checks and normalizes a server; the id is kept as given (saveServer chooses new ones).
export function clean(raw: unknown): McpServer {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? '').trim().slice(0, LIMIT.name);
  if (!name) throw new McpError('Give the server a name.');
  const transport: McpTransport = r.transport === 'http' ? 'http' : 'stdio';
  const command = String(r.command ?? '').trim().slice(0, LIMIT.command);
  const url = String(r.url ?? '').trim().slice(0, LIMIT.url);
  if (transport === 'stdio') {
    if (!command) throw new McpError(`${name}: give the command that starts the server (e.g. npx).`);
    if (/[\n\r\0]/.test(command) || /[|&;<>`]/.test(command)) throw new McpError(`${name}: the command is a program, not a shell line; put its options in Arguments.`);
  } else if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new McpError(`${name}: the URL must start with http:// or https://.`);
  const args = transport === 'stdio' ? strings(r.args, LIMIT.args).map((a) => a.slice(0, LIMIT.arg)) : [];
  const env = transport === 'stdio' ? pairs(r.env) : {};
  const headers = transport === 'http' ? pairs(r.headers) : {};
  for (const [kind, map] of [['environment variable', env], ['header', headers]] as const) {
    for (const [k, v] of Object.entries(map)) {
      if (kind === 'environment variable' ? !VAR.test(k) : !/^[A-Za-z0-9-]{1,100}$/.test(k)) throw new McpError(`${name}: "${k}" is not a valid ${kind} name.`);
      if (v.length > LIMIT.value) throw new McpError(`${name}: the value of ${k} is too long.`);
      const secret = literalSecret(k, v);
      if (secret) throw new McpError(`${name}: ${k} looks like a ${secret}. Moki never stores credentials: write \${VARIABLE} and set the variable on this computer.`);
    }
  }
  for (const [i, a] of args.entries()) {
    if (literalSecret('', a)) throw new McpError(`${name}: argument ${i + 1} looks like a credential. Use \${VARIABLE} instead.`);
  }
  if (literalSecret('', url)) throw new McpError(`${name}: the URL holds a credential. Use \${VARIABLE} instead.`);
  const id = String(r.id ?? '');
  return {
    id: ID.test(id) ? id : '', name, description: String(r.description ?? '').trim().slice(0, LIMIT.description), transport,
    command: transport === 'stdio' ? command : '', args, url: transport === 'http' ? url : '', env, headers,
    access: r.access === 'execute' ? 'execute' : 'read',
    enabled: r.enabled !== false,
    projects: [...new Set(strings(r.projects, LIMIT.projects).filter((p) => ID.test(p)))],
  };
}

// Creates (no id, or an unknown id) or updates a server. New ids come from the name and never clash;
// projects that do not exist in the workspace are left out, and a "specific projects" server needs at least one.
export function saveServer(raw: unknown, root: string): McpServer {
  const list = listServers(root);
  const server = clean(raw);
  const known = new Set(listProjects(root));
  const specific = (raw as { projects?: unknown } | null)?.projects;
  server.projects = server.projects.filter((p) => known.has(p));
  if (Array.isArray(specific) && specific.length && !server.projects.length) throw new McpError(`${server.name}: choose at least one project of this workspace, or make it global.`);
  const old = list.find((s) => s.id === server.id);
  if (!old) {
    const taken = new Set(list.map((s) => s.id));
    const base = slugify(server.name) || 'server';
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    server.id = id;
  }
  writeJson(catalogFile(root), { servers: old ? list.map((s) => (s.id === server.id ? server : s)) : [...list, server] });
  return server;
}

export function removeServer(id: string, root: string): void {
  const list = listServers(root);
  if (!list.some((s) => s.id === id)) throw new McpError('Unknown MCP server.');
  writeJson(catalogFile(root), { servers: list.filter((s) => s.id !== id) });
}

export const appliesTo = (s: McpServer, project: string): boolean => !s.projects.length || s.projects.includes(project);

// The servers one project gets: on, and global or listed for it.
export const enabledServers = (project: string, root: string): McpServer[] => listServers(root).filter((s) => s.enabled && appliesTo(s, project));

// The servers an agent's contract names that the project has, and the names it cannot have.
export function serversForAgent(project: string, mcps: { name: string }[], root: string): { servers: McpServer[]; missing: string[] } {
  const on = enabledServers(project, root);
  const servers = mcps.flatMap((m) => on.filter((s) => s.id === m.name));
  return { servers, missing: mcps.map((m) => m.name).filter((n) => !servers.some((s) => s.id === n)) };
}

export const variablesOf = (s: McpServer): string[] =>
  [...new Set([s.command, s.url, ...s.args, ...Object.values(s.env), ...Object.values(s.headers)].flatMap((v) => [...v.matchAll(REF)].map((m) => m[1])))];

// ${VAR} replaced from `env`; a variable that is not set stops the server with a clear message (never its value).
export function resolveServer(s: McpServer, env: NodeJS.ProcessEnv = process.env): McpServer {
  const missing = variablesOf(s).filter((v) => env[v] === undefined || env[v] === '');
  if (missing.length) throw new McpError(`${s.name}: set the environment variable${missing.length > 1 ? 's' : ''} ${missing.join(', ')} on this computer, then try again.`);
  const sub = (v: string) => v.replace(REF, (_, n: string) => String(env[n]));
  const map = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, sub(v)]));
  return { ...s, command: sub(s.command), url: sub(s.url), args: s.args.map(sub), env: map(s.env), headers: map(s.headers) };
}

// ---------------------------------------------------------------- importing

// A pasted configuration in the format of Claude Code / Cursor ({"mcpServers": {...}}), VS Code ({"servers": {...}})
// or one bare map of servers. A credential written as a value becomes ${NAME}: it is never stored.
export function importConfig(text: string): { servers: unknown[]; replaced: string[] } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new McpError('This is not valid JSON.'); }
  const obj = (data ?? {}) as Record<string, unknown>;
  const map = (obj.mcpServers ?? obj.servers ?? obj) as Record<string, unknown>;
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new McpError('No MCP servers found in this JSON.');
  const replaced: string[] = [];
  const servers = Object.entries(map).filter(([, v]) => v && typeof v === 'object').map(([name, v]) => {
    const c = v as Record<string, unknown>;
    const url = String(c.url ?? c.serverUrl ?? c.httpUrl ?? '');
    const scrub = (m: unknown) => Object.fromEntries(Object.entries(pairs(m)).map(([k, val]) => {
      const value = val.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, '${$1}'); // Cursor and VS Code write ${env:NAME}
      if (!literalSecret(k, value)) return [k, value];
      const ref = `${slugify(name).replace(/-/g, '_').toUpperCase()}_${k.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
      replaced.push(`${name}: ${k} → \${${ref}}`);
      return [k, `\${${ref}}`];
    }));
    return {
      name, transport: url && !c.command ? 'http' : 'stdio', command: String(c.command ?? ''), args: strings(c.args, LIMIT.args),
      url, env: scrub(c.env), headers: scrub(c.headers), access: 'read',
    };
  });
  if (!servers.length) throw new McpError('No MCP servers found in this JSON.');
  return { servers, replaced };
}

// ---------------------------------------------------------------- configurations for the AI tools

export interface GeneratedEntry { key: string; server: McpServer }
export const entryKey = (id: string): string => `moki-${id}`;
const isManaged = (key: string): boolean => key === MOKI_SERVER || key.startsWith('moki-');

// One server as Claude Code (".mcp.json", --mcp-config) and Cursor (".cursor/mcp.json") read it.
// Claude expands ${VAR} itself; Cursor reads ${env:VAR}.
function entry(s: McpServer, tool: 'claude' | 'cursor'): Record<string, unknown> {
  const ref = (v: string) => (tool === 'cursor' ? v.replace(REF, '${env:$1}') : v);
  const map = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, ref(v)]));
  if (s.transport === 'http') return { ...(tool === 'claude' ? { type: 'http' } : {}), url: ref(s.url), ...(Object.keys(s.headers).length ? { headers: map(s.headers) } : {}) };
  return { command: ref(s.command), args: s.args.map(ref), ...(Object.keys(s.env).length ? { env: map(s.env) } : {}) };
}

export const toolConfig = (entries: GeneratedEntry[], tool: 'claude' | 'cursor'): { mcpServers: Record<string, unknown> } =>
  ({ mcpServers: Object.fromEntries(entries.map((e) => [e.key, entry(e.server, tool)])) });

// The person's own entries stay; Moki's (moki, moki-*) are replaced by `entries`.
export function mergeManaged(existing: unknown, entries: GeneratedEntry[], tool: 'claude' | 'cursor'): Record<string, unknown> {
  const data = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  const current = data.mcpServers && typeof data.mcpServers === 'object' ? data.mcpServers as Record<string, unknown> : {};
  const own = Object.fromEntries(Object.entries(current).filter(([k]) => !isManaged(k)));
  return { ...data, mcpServers: { ...own, ...toolConfig(entries, tool).mcpServers } };
}

// Writes the merged file; returns false when nothing changed. A file that is not JSON is never overwritten.
export function writeMerged(file: string, entries: GeneratedEntry[], tool: 'claude' | 'cursor'): boolean {
  let existing: unknown = {};
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8');
    try { existing = text.trim() ? JSON.parse(text) : {}; } catch { throw new McpError(`${file} is not valid JSON; fix it or remove it first.`); }
  }
  const next = `${JSON.stringify(mergeManaged(existing, entries, tool), null, 2)}\n`;
  if (existsSync(file) && readFileSync(file, 'utf8') === next) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
  return true;
}

// ---------------------------------------------------------------- Moki's own server and Cursor in the linked folder

// Moki's read-only server (ide/mcp/server.ts) bound to one project, as the AI tools start it.
// `script`: the server file (the .ts in the repository, or a built bundle); without Node.js, `runtime` runs it as Node (ELECTRON_RUN_AS_NODE).
export function mokiServer(project: string, root: string, script: string, node: string | null, runtime = process.execPath): McpServer {
  return {
    id: MOKI_SERVER, name: 'Moki', description: 'This project in Moki (read-only)', transport: 'stdio', url: '', headers: {}, access: 'read', enabled: true, projects: [project],
    command: node ?? runtime, args: [script, '--project', project],
    env: { QA_ROOT: root, QA_WORKSPACE: workspaceDir(root), ...(node ? {} : { ELECTRON_RUN_AS_NODE: '1' }) },
  };
}

export const generatedEntries = (moki: McpServer, servers: McpServer[]): GeneratedEntry[] =>
  [{ key: MOKI_SERVER, server: moki }, ...servers.map((server) => ({ key: entryKey(server.id), server }))];

// Hides a path from Git in <folder>/.git/info/exclude (local only). A .git file (worktree) is left alone.
function excludeInGit(folder: string, line: string): void {
  const git = join(folder, '.git', 'info', 'exclude');
  if (!existsSync(join(folder, '.git'))) return;
  try {
    const text = existsSync(git) ? readFileSync(git, 'utf8') : '';
    if (!text.split(/\r?\n/).includes(line)) { mkdirSync(dirname(git), { recursive: true }); writeFileSync(git, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`); }
  } catch { /* not a .git folder: nothing hidden */ }
}

export const toolFile = (folder: string, tool: 'claude' | 'cursor'): string => (tool === 'cursor' ? join(folder, '.cursor', 'mcp.json') : join(folder, '.mcp.json'));

// A folder the AI tool is opened on (Cursor: .cursor/mcp.json; Claude Code: .mcp.json): Moki's entries written, the person's kept.
// The current file is copied to <folder>/.moki-backup/<tool>-mcp-<date>/ first; the backup, and a new .mcp.json, are hidden from Git.
// The caller checks that writing there is allowed and that the person confirmed it.
export function syncToolFolder(folder: string, entries: GeneratedEntry[], tool: 'claude' | 'cursor'): { file: string; changed: boolean; backup?: string } {
  const file = toolFile(folder, tool);
  let backup: string | undefined;
  if (existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    backup = join(folder, '.moki-backup', `${tool}-mcp-${stamp}`);
    mkdirSync(backup, { recursive: true });
    writeFileSync(join(backup, 'mcp.json'), readFileSync(file));
    excludeInGit(folder, '.moki-backup/');
  } else if (tool === 'claude') excludeInGit(folder, '.mcp.json'); // Moki created it: it stays out of the person's commits
  return { file, changed: writeMerged(file, entries, tool), backup };
}

export const syncCursorFolder = (folder: string, entries: GeneratedEntry[]) => syncToolFolder(folder, entries, 'cursor');
