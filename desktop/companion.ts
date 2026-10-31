// The IDE Companion's view of one project: what the AI of an IDE may read from
// Moki (through ide/mcp/server.ts) and what the person chose for it (ide/vscode).
// Read-only over the framework and the workspace; it writes only the project's
// companion.json (choices) and logs/companion.log (what was read). Every request
// is checked against the project it was opened for, never against an id the AI sends.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { contextChoice, listProjects, listSkills, isUsable, projectSummary, projectsDir, type ProjectSummary } from '../scripts/lib/core.ts';
import { isUsableAgent, listAgents } from '../scripts/lib/agents.ts';
import { readJson, workspaceLabel } from '../scripts/lib/repo.mjs';
import { parseFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { PathError, resolveInside } from './fs-guard.ts';

export type ResourceKind = 'context' | 'note' | 'shared' | 'agent' | 'skill';
// auto: listed and readable; ask: listed, readable once the person selects it; manual: hidden until selected.
export type Mode = 'auto' | 'ask' | 'manual';
export const MODES: Mode[] = ['auto', 'ask', 'manual'];
// Another project's files reach this one only through a tag, so they wait for the person by default.
export const DEFAULT_MODES: Record<ResourceKind, Mode> = { context: 'auto', note: 'auto', shared: 'ask', agent: 'auto', skill: 'auto' };

export interface Resource {
  id: string; // a file: its workspace label (workspace/projects/<id>/<path>); agent:<name>; skill:<name>
  kind: ResourceKind;
  title: string;
  description: string;
  source: string; // the project that owns the file, or "framework"
  size?: number;
  mode: Mode;
  selected: boolean;
}

export interface ContextPack {
  project: string;
  task: string;
  selected: { resource: Resource; text: string; truncated: boolean }[]; // chosen by the person, with content, first
  related: (Resource & { score: number })[]; // references only: read them with getResource
  budget: number;
  used: number;
}

export interface SearchHit { id: string; title: string; line: number; snippet: string }

interface Choices { selected: string[]; modes: Record<string, Mode> }

export class CompanionError extends Error {}

const TEXT = new Set(['.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.xml', '.feature']);
const SENSITIVE = [/^\.env(\..*)?$/i, /\.(pem|key|p12|pfx|crt|jks)$/i, /^(credentials|secrets?)(\..*)?$/i, /^id_(rsa|dsa|ecdsa|ed25519)/i];
const FILE_LIMIT = 200_000; // characters of one resource
export const DEFAULT_BUDGET = 24_000; // characters of selected content in one context pack
export const MAX_BUDGET = 100_000;
const RELATED_LIMIT = 15;
const HIT_LIMIT = 30;

export const isSensitive = (path: string): boolean => SENSITIVE.some((r) => r.test(basename(path)));
// Windows and macOS folders are compared without case; a folder that is gone keeps its resolved path.
const norm = (p: string): string => {
  let real = resolve(p);
  try { real = realpathSync(real); } catch { /* not on this machine */ }
  return process.platform === 'linux' ? real : real.toLowerCase();
};
const within = (dir: string, p: string): boolean => { const r = relative(dir, p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

// Projects whose repositories[] hold `folder` (the folder itself or one above it). The folder
// linked with "Choose my folder" counts first; projects with another entry for it come after.
export function projectsForFolder(root: string, folder: string): string[] {
  const target = norm(folder);
  const linked: string[] = [];
  const listed: string[] = [];
  for (const id of listProjects(root)) {
    let repos: Record<string, unknown>[] = [];
    try {
      const data = readJson(join(projectsDir(root), id, 'project.json')) as { repositories?: unknown };
      repos = Array.isArray(data.repositories) ? data.repositories as Record<string, unknown>[] : [];
    } catch { continue; }
    const hits = repos.filter((r) => typeof r?.localPath === 'string' && isAbsolute(r.localPath) && within(norm(r.localPath), target));
    if (hits.some((r) => r.linkedFolder === true)) linked.push(id);
    else if (hits.length) listed.push(id);
  }
  return [...linked, ...listed];
}

const firstLine = (text: string): string => {
  const { data, body } = parseFrontmatter(text) as { data: Record<string, unknown> | null; body: string };
  if (data?.description) return String(data.description).slice(0, 200);
  const line = (data ? body : text).split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '';
  return line.slice(0, 200);
};

function walk(dir: string, rel = ''): string[] {
  const here = join(dir, rel);
  if (!existsSync(here)) return [];
  return readdirSync(here).sort().flatMap((name) => {
    const path = rel ? `${rel}/${name}` : name;
    let st;
    try { st = statSync(join(dir, path)); } catch { return []; }
    if (st.isDirectory()) return name.startsWith('.') ? [] : walk(dir, path);
    return TEXT.has(extname(name).toLowerCase()) && !isSensitive(name) ? [path] : [];
  });
}

export function openCompanion(root: string, project: string) {
  if (!listProjects(root).includes(project)) throw new CompanionError('Unknown project.');
  const dir = join(projectsDir(root), project);
  const choicesFile = join(dir, 'companion.json');
  const label = (owner: string, path: string): string => `${workspaceLabel(root)}/projects/${owner}/${path}`;
  const prefix = (): string => `${workspaceLabel(root)}/projects/`;

  const choices = (): Choices => {
    try {
      const data = readJson(choicesFile) as Partial<Choices>;
      return {
        selected: Array.isArray(data.selected) ? data.selected.filter((s): s is string => typeof s === 'string') : [],
        modes: Object.fromEntries(Object.entries(data.modes ?? {}).filter(([, m]) => MODES.includes(m as Mode))) as Record<string, Mode>,
      };
    } catch { return { selected: [], modes: {} }; }
  };
  const saveChoices = (c: Choices): void => writeFileSync(choicesFile, `${JSON.stringify(c, null, 2)}\n`);

  const fileResource = (owner: string, path: string, kind: ResourceKind, c: Choices): Resource => {
    const file = join(projectsDir(root), owner, ...path.split('/'));
    let text = '';
    let size = 0;
    try { size = statSync(file).size; text = readFileSync(file, 'utf8').slice(0, 4000); } catch { /* listed, then gone */ }
    const id = label(owner, path);
    return {
      id, kind, title: path, description: firstLine(text), source: owner, size,
      mode: c.modes[id] ?? DEFAULT_MODES[kind], selected: c.selected.includes(id),
    };
  };

  // Everything this project may offer, before the modes are applied.
  const all = (): Resource[] => {
    const c = choices();
    const own = (sub: string, kind: ResourceKind) => walk(join(dir, sub)).map((p) => fileResource(project, `${sub}/${p}`, kind, c));
    const shared = new Map<string, Resource>();
    for (const { sources } of contextChoice(project, root).shared) {
      for (const s of sources) {
        for (const path of s.paths) {
          const rel = path.slice(prefix().length + s.project.length + 1);
          if (!TEXT.has(extname(rel).toLowerCase()) || isSensitive(rel)) continue;
          const r = fileResource(s.project, rel, 'shared', c);
          shared.set(r.id, { ...r, title: `${s.name}: ${rel}` });
        }
      }
    }
    let enabled: unknown;
    try { enabled = (readJson(join(dir, 'project.json')) as { agents?: unknown }).agents; } catch { /* every usable agent */ }
    const agents = listAgents(root).filter(isUsableAgent).filter((a) => !Array.isArray(enabled) || enabled.includes(a.name))
      .map((a): Resource => {
        const id = `agent:${a.name}`;
        return { id, kind: 'agent', title: a.name, description: a.description, source: 'framework', mode: c.modes[id] ?? DEFAULT_MODES.agent, selected: c.selected.includes(id) };
      });
    const skills = listSkills(root).filter((s) => isUsable(s.name, root))
      .map((s): Resource => {
        const id = `skill:${s.name}`;
        return { id, kind: 'skill', title: s.name, description: s.description, source: 'framework', mode: c.modes[id] ?? DEFAULT_MODES.skill, selected: c.selected.includes(id) };
      });
    return [...own('context', 'context'), ...own('notes', 'note'), ...shared.values(), ...agents, ...skills];
  };

  const visible = (r: Resource): boolean => r.mode !== 'manual' || r.selected;
  const readable = (r: Resource): boolean => r.mode === 'auto' || r.selected;

  const find = (id: unknown): Resource => {
    const r = all().find((x) => x.id === id);
    if (!r) throw new CompanionError('This resource does not belong to the project, or it is gone.');
    return r;
  };

  const text = (r: Resource): string => {
    if (r.kind === 'agent') {
      const agent = listAgents(root).find((a) => `agent:${a.name}` === r.id);
      if (!agent) throw new CompanionError('Unknown agent.');
      return readFileSync(join(root, agent.path), 'utf8');
    }
    if (r.kind === 'skill') return readFileSync(join(root, 'skills', r.id.slice('skill:'.length), 'SKILL.md'), 'utf8');
    const rel = r.id.slice(prefix().length + r.source.length + 1);
    let file: string;
    try { file = resolveInside(join(projectsDir(root), r.source), rel); } catch (e) {
      throw new CompanionError(e instanceof PathError ? e.message : 'File not found.');
    }
    if (isSensitive(file)) throw new CompanionError('This file is never shared.');
    return readFileSync(file, 'utf8');
  };

  const log = (tool: string, detail: Record<string, unknown>): void => {
    try {
      mkdirSync(join(dir, 'logs'), { recursive: true });
      appendFileSync(join(dir, 'logs', 'companion.log'), `${JSON.stringify({ at: new Date().toISOString(), tool, ...detail })}\n`);
    } catch { /* the log never stops a read */ }
  };

  const terms = (task: string): string[] => [...new Set(task.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2))].slice(0, 30);

  return {
    project,

    summary: (): ProjectSummary & { agents: string[]; skills: string[] } => {
      const list = all().filter(visible);
      return { ...projectSummary(project, root), agents: list.filter((r) => r.kind === 'agent').map((r) => r.title), skills: list.filter((r) => r.kind === 'skill').map((r) => r.title) };
    },

    // What the person sees in the IDE: everything, with its mode.
    allResources: all,

    // What the AI sees: no manual resource that is not selected.
    resources: (kind?: unknown): Resource[] => all().filter(visible).filter((r) => !kind || r.kind === kind),

    getResource: (id: unknown): { resource: Resource; text: string; truncated: boolean } => {
      const r = find(id);
      if (!visible(r)) throw new CompanionError('This resource does not belong to the project, or it is gone.');
      if (!readable(r)) throw new CompanionError('The person must select this resource in the Moki panel before it can be read.');
      const full = text(r);
      return { resource: r, text: full.slice(0, FILE_LIMIT), truncated: full.length > FILE_LIMIT };
    },

    // Plain text search in the files the AI may read (no index: the projects are small).
    search: (query: unknown): SearchHit[] => {
      const q = String(query ?? '').trim().toLowerCase().slice(0, 200);
      if (!q) return [];
      const hits: SearchHit[] = [];
      for (const r of all().filter((x) => readable(x) && visible(x))) {
        let body: string;
        try { body = text(r); } catch { continue; }
        const lines = body.split('\n');
        for (let i = 0; i < lines.length && hits.length < HIT_LIMIT; i++) {
          if (lines[i].toLowerCase().includes(q)) hits.push({ id: r.id, title: r.title, line: i + 1, snippet: lines[i].trim().slice(0, 200) });
        }
        if (hits.length >= HIT_LIMIT) break;
      }
      return hits;
    },

    // Selected resources with their text, within the budget, then the most related references.
    contextPack: (task: unknown, budget?: unknown): ContextPack => {
      const words = terms(String(task ?? ''));
      const limit = Math.min(MAX_BUDGET, Math.max(1000, Number(budget) || DEFAULT_BUDGET));
      const list = all().filter(visible);
      let used = 0;
      const selected: ContextPack['selected'] = [];
      for (const r of list.filter((x) => x.selected)) {
        let body = '';
        try { body = text(r); } catch { continue; }
        const room = limit - used;
        if (room <= 0) break;
        selected.push({ resource: r, text: body.slice(0, room), truncated: body.length > room });
        used += Math.min(body.length, room);
      }
      const related = list.filter((r) => !r.selected && readable(r)).map((r) => {
        const hay = `${r.title}\n${r.description}`.toLowerCase();
        const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) + (r.kind === 'context' ? 0.5 : 0);
        return { ...r, score };
      }).filter((r) => r.score > 0 || !words.length).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, RELATED_LIMIT);
      return { project, task: String(task ?? ''), selected, related, budget: limit, used };
    },

    select: (id: unknown, on: boolean): string[] => {
      const r = find(id);
      const c = choices();
      c.selected = on ? [...new Set([...c.selected, r.id])] : c.selected.filter((s) => s !== r.id);
      saveChoices(c);
      return c.selected;
    },

    clearSelection: (): void => saveChoices({ ...choices(), selected: [] }),

    setMode: (id: unknown, mode: unknown): Mode => {
      const r = find(id);
      if (!MODES.includes(mode as Mode)) throw new CompanionError('Unknown mode.');
      const c = choices();
      if (mode === DEFAULT_MODES[r.kind]) delete c.modes[r.id]; else c.modes[r.id] = mode as Mode;
      saveChoices(c);
      return mode as Mode;
    },

    // A file resource's place on disk, for "Open in editor".
    filePath: (id: unknown): string | null => {
      const r = find(id);
      if (r.kind === 'agent') { const a = listAgents(root).find((x) => `agent:${x.name}` === r.id); return a ? join(root, a.path) : null; }
      if (r.kind === 'skill') return join(root, 'skills', r.id.slice('skill:'.length), 'SKILL.md');
      return join(projectsDir(root), r.source, ...r.id.slice(prefix().length + r.source.length + 1).split('/'));
    },

    log,
    logFile: join(dir, 'logs', 'companion.log'),
  };
}

export type Companion = ReturnType<typeof openCompanion>;
