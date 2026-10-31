// Shared core used by the `qa` launcher, the terminal menu and the local web
// server: projects, runs, skills, AI tool detection and request building.
// It never executes skills itself — the AI tools do, following AGENTS.md.

import { existsSync, readdirSync, statSync, copyFileSync, cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, basename, extname, resolve, sep } from 'node:path';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, SLUG, readJson, workspaceDir, workspaceLabel } from './repo.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { contractLines, type AgentContract } from './agents.ts';

export type ActivityKey = 'open' | 'review' | 'tests' | 'review-then-tests' | 'failure' | 'evidence' | 'context' | 'setup' | 'plan' | 'automation' | 'resume';
// How a new project starts: 'qa' copies the QA context files; 'blank' leaves context/ out and plans it with the AI.
export type Starter = 'qa' | 'blank';
export const STARTERS: Starter[] = ['qa', 'blank'];
// App plugins a project turns on itself (adapters/app-plugins/README.md); ponytail and rtk are always on.
export const PROJECT_PLUGINS = ['caveman', 'superpowers'];
export type ToolKey = 'claude' | 'codex' | 'cursor-agent' | 'gemini' | 'antigravity' | 'cursor' | 'vscode' | 'chat' | 'print';

export interface Activity { label: string; hint?: string; skill: string; needsFiles: boolean }
export interface Tool {
  label: string;
  hint?: string;
  command?: string;
  args?: (prompt: string) => string[];
  clipboard?: boolean;
  chat?: boolean;
  print?: boolean;
}

export const ACTIVITIES: Record<ActivityKey, Activity> = {
  open: { label: 'Just open the project', hint: 'loads the context and asks what you need', skill: 'project-context', needsFiles: false },
  review: { label: 'Review user stories', hint: 'ambiguities, gaps, interview, matrix, report', skill: 'requirements-review', needsFiles: true },
  tests: { label: 'Design tests', hint: 'scenario mapping, then test cases', skill: 'test-design', needsFiles: true },
  'review-then-tests': { label: 'Review, then design tests', hint: 'workflow with approval in between', skill: 'qa-orchestrator', needsFiles: true },
  failure: { label: 'Failure pre-analysis', hint: 'from your description and the log', skill: 'failure-analysis', needsFiles: false },
  evidence: { label: 'Build test evidence', hint: 'work item + Jam recordings, then spreadsheet and Word document', skill: 'qa-orchestrator', needsFiles: false },
  context: { label: 'Project context', hint: 'onboarding, questions, updates', skill: 'project-context', needsFiles: false },
  setup: { label: 'Prepare the project', hint: 'adapts the context to the project description', skill: 'project-context', needsFiles: false },
  plan: { label: 'Plan the project with the AI', hint: 'interview, then a plan you review in the app', skill: 'project-context', needsFiles: false },
  automation: { label: 'Automation', skill: 'automation', needsFiles: false },
  resume: { label: 'Resume a run', skill: 'qa-orchestrator', needsFiles: false },
};

export const TOOLS: Record<ToolKey, Tool> = {
  claude: { label: 'Claude Code', command: 'claude', args: (p) => [p] },
  codex: { label: 'OpenAI Codex CLI', command: 'codex', args: (p) => [p] },
  'cursor-agent': { label: 'Cursor Agent CLI', command: 'cursor-agent', args: (p) => [p] },
  gemini: { label: 'Gemini CLI', command: 'gemini', args: (p) => ['-i', p] },
  antigravity: { label: 'Antigravity CLI', command: 'agy', args: (p) => ['-i', p] },
  cursor: { label: 'Cursor editor', hint: 'opens the folder, request copied to clipboard', command: 'cursor', args: () => [ROOT], clipboard: true },
  vscode: { label: 'VS Code (Claude Code / Codex extensions)', hint: 'opens the folder, request copied to clipboard', command: 'code', args: () => [ROOT], clipboard: true },
  chat: { label: 'ChatGPT / claude.ai / Gemini web', hint: 'request copied, files listed', chat: true },
  print: { label: 'Just show the request', print: true },
};

export const LANGUAGES = ['English', 'Portuguese (pt-BR)', 'Spanish'];

export const isActivity = (v: string): v is ActivityKey => Object.hasOwn(ACTIVITIES, v);
export const isTool = (v: string): v is ToolKey => Object.hasOwn(TOOLS, v);

// ---------------------------------------------------------------- skills

export interface SkillInfo { name: string; status: string; description: string }

interface Frontmatter { description?: string; metadata?: { status?: string } }
const frontmatter = (file: string): Frontmatter => (parseFrontmatter(readFileSync(file, 'utf8')).data ?? {}) as Frontmatter;

export function skillStatus(skill: string, root = ROOT): string {
  const file = join(root, 'skills', skill, 'SKILL.md');
  if (!existsSync(file)) return 'missing';
  return frontmatter(file).metadata?.status ?? 'unknown';
}

export const isUsable = (skill: string, root = ROOT): boolean => ['stable', 'draft'].includes(skillStatus(skill, root));

export function listSkills(root = ROOT): SkillInfo[] {
  const dir = join(root, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'SKILL.md')))
    .sort()
    .map((name) => {
      const data = frontmatter(join(dir, name, 'SKILL.md'));
      return { name, status: data.metadata?.status ?? 'unknown', description: String(data.description ?? '') };
    });
}

// ---------------------------------------------------------------- projects and runs

export interface RunState {
  id: string;
  status: string;
  currentStep?: string;
  skill?: string;
  workflow?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  onboardingStatus: string;
  deliverableLanguage: string;
  runs: number;
  openRuns: number;
  repository: string; // folder on this machine linked to the project ('' when none)
  linkedSkills: string[]; // global skills this project uses, by name (project.json linkedSkills)
  starter: Starter;
  tags: string[]; // tag ids (project.json tags)
  plugins: string[]; // app plugins turned on for this project (project.json plugins)
}

export const projectsDir = (root = ROOT): string => join(workspaceDir(root), 'projects');

export function listProjects(root = ROOT): string[] {
  const dir = projectsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => existsSync(join(dir, d, 'project.json'))).sort();
}

export function listRuns(project: string, root = ROOT): RunState[] {
  const dir = join(projectsDir(root), project, 'runs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => existsSync(join(dir, id, 'state.json')))
    .map((id): RunState => {
      try { return { ...(readJson(join(dir, id, 'state.json')) as object), id } as RunState; } catch { return { id, status: 'unreadable' }; }
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

// Runs to resume in an AI tool. Multi-agent operation runs are left out: Moki runs them step by step (the Operations panel).
export const openRuns = (project: string, root = ROOT): RunState[] =>
  listRuns(project, root).filter((s) => !['completed', 'cancelled'].includes(s.status) && !s.operation);

export function projectSummary(id: string, root = ROOT): ProjectSummary {
  let data: Record<string, unknown> = {};
  try { data = readJson(join(projectsDir(root), id, 'project.json')) as Record<string, unknown>; } catch { /* listed but unreadable */ }
  const runs = listRuns(id, root);
  return {
    id,
    name: String(data.name || id),
    description: String(data.description || ''),
    onboardingStatus: String(data.onboardingStatus || 'unknown'),
    deliverableLanguage: String(data.deliverableLanguage || 'en (default)'),
    runs: runs.length,
    openRuns: runs.filter((r) => !['completed', 'cancelled'].includes(r.status)).length,
    repository: linkedOf(data)?.path ?? '',
    linkedSkills: Array.isArray(data.linkedSkills) ? data.linkedSkills.filter((s): s is string => typeof s === 'string') : [],
    starter: data.starter === 'blank' ? 'blank' : 'qa',
    tags: Array.isArray(data.tags) ? [...new Set(data.tags.filter((s): s is string => typeof s === 'string'))] : [],
    plugins: Array.isArray(data.plugins) ? PROJECT_PLUGINS.filter((p) => (data.plugins as unknown[]).includes(p)) : [],
  };
}

// The folder linked with the desktop app's "Choose my folder": the repositories[] entry marked linkedFolder.
// writeBlocked: the entry says writeAllowed: false, so nothing is ever written there.
export interface LinkedFolder { path: string; writeBlocked: boolean }

function linkedOf(data: Record<string, unknown>): LinkedFolder | null {
  const repos = Array.isArray(data.repositories) ? (data.repositories as Record<string, unknown>[]) : [];
  const r = repos.find((x) => x?.linkedFolder === true && typeof x.localPath === 'string' && x.localPath);
  return r ? { path: String(r.localPath), writeBlocked: r.writeAllowed === false } : null;
}

export function linkedFolder(project: string, root = ROOT): LinkedFolder | null {
  try { return linkedOf(readJson(join(projectsDir(root), project, 'project.json')) as Record<string, unknown>); } catch { return null; }
}

export const projectRepository = (project: string, root = ROOT): string => linkedFolder(project, root)?.path ?? '';

// ---------------------------------------------------------------- installed skills and agents

// Names of the skill folders (<dir>/<name>/SKILL.md) in a skills directory.
export const skillFolders = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md'))).sort() : [];

// Names of the agent definitions (<dir>/<name>.md) in an agents directory.
export const agentFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('.')).map((n) => n.slice(0, -3)).sort() : [];

// Where one project's installed skills or agents live, as the AI is told: <linked folder>/.claude/<kind>, or workspace/projects/<id>/<kind>.
type Kind = 'skills' | 'agents';
const folderLabel = (project: string, repository: string, kind: Kind, workspace = 'workspace'): string =>
  repository ? `${repository.split(sep).join('/')}/.claude/${kind}` : `${workspace}/projects/${project}/${kind}`;

// `dir` on disk, `label` as written in requests and agents.
function projectFolder(project: string, kind: Kind, root: string): { dir: string; label: string } {
  const repo = linkedFolder(project, root)?.path ?? '';
  return { dir: repo ? join(repo, '.claude', kind) : join(projectsDir(root), project, kind), label: folderLabel(project, repo, kind, workspaceLabel(root)) };
}
export const projectSkillsDir = (project: string, root = ROOT) => projectFolder(project, 'skills', root);
export const projectAgentsDir = (project: string, root = ROOT) => projectFolder(project, 'agents', root);
export const installedSkills = (project: string, root = ROOT): string[] => skillFolders(projectSkillsDir(project, root).dir);
export const installedAgents = (project: string, root = ROOT): string[] => agentFiles(projectAgentsDir(project, root).dir);

export interface AgentSpec {
  name: string; description: string; skills: { name: string; path: string }[];
  framework?: { root: string; project: string; workspace?: string }; // set when the agent uses Moki's own skills; workspace: its folder when not <root>/workspace
  contract?: AgentContract; // inputs, outputs, MCP servers and AI tool (for multi-agent operations)
}

// An agent in the Claude Code subagent format (plain Markdown any AI tool can follow).
// The skills list closes the agent to the skills chosen for it.
export function agentMarkdown({ name, description, skills, framework, contract }: AgentSpec): string {
  const summary = description.split('\n')[0].split(/(?<=[.!?])\s/)[0].slice(0, 300);
  return [
    '---', `name: ${name}`, `description: ${JSON.stringify(summary)}`, ...(contract ? contractLines(contract) : []), '---', '',
    description, '',
    '## Skills', '',
    'Use only these skills (read the SKILL.md when one fits the task). Do not use or install any other skill; if the task needs one that is not listed, say so and stop.', '',
    ...skills.map((s) => `- \`${s.name}\`: \`${s.path}\``), '',
    ...(framework ? [`The Moki skills follow \`${framework.root}/AGENTS.md\` for the project \`${framework.project}\`: its context, runs and approvals are in \`${framework.workspace ?? `${framework.root}/workspace`}/projects/${framework.project}/\`.`, ''] : []),
  ].join('\n');
}

// Creates workspace/projects/<id>/ from templates/project-context/ (also used by npm run new-project).
// A blank project leaves the QA context files out; the "plan" activity proposes its own.
export function createProject(id: string, name: string, root = ROOT, starter: Starter = 'qa'): ProjectSummary {
  if (!SLUG.test(id)) throw new Error('Project id: use lowercase letters, digits and single hyphens.');
  const target = join(projectsDir(root), id);
  if (existsSync(target)) throw new Error(`Project "${id}" already exists.`);
  cpSync(join(root, 'templates', 'project-context'), target, { recursive: true });
  renameSync(join(target, 'gitignore.txt'), join(target, '.gitignore'));
  if (starter === 'blank') rmSync(join(target, 'context'), { recursive: true, force: true });
  for (const dir of ['inbox', 'runs', 'temporary']) mkdirSync(join(target, dir), { recursive: true });
  const file = join(target, 'project.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const blank = starter === 'blank' ? { starter, contextFiles: [] } : {};
  writeFileSync(file, `${JSON.stringify({ ...data, project: id, name: name.trim() || id, ...blank }, null, 2)}\n`);
  return projectSummary(id, root);
}

export const slugify = (name: string): string => name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// ---------------------------------------------------------------- tags

// A tag shares context between projects: the confirmed context (context/) of every
// project with the tag, plus each file marked with it. Catalog in workspace/tags.json;
// a project's tags in project.json "tags"; its files' tags in <project>/tags.json.
export interface Tag { id: string; name: string; color: string; description: string }
export interface SharedSource { project: string; name: string; whole: boolean; paths: string[] } // whole: the project has the tag
export interface SharedTag { tag: Tag; sources: SharedSource[] }
export interface ContextChoice { own: string[]; shared: SharedTag[] } // what an activity may read, before the user's exclusions

export const TAG_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
const tagsFile = (root: string) => join(workspaceDir(root), 'tags.json');
const fileTagsFile = (project: string, root: string) => join(projectsDir(root), project, 'tags.json');
const writeJson = (file: string, data: unknown) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); };
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

export function listTags(root = ROOT): Tag[] {
  let data: { tags?: unknown } = {};
  try { data = readJson(tagsFile(root)) as { tags?: unknown }; } catch { /* no catalog yet */ }
  const list = Array.isArray(data.tags) ? (data.tags as Partial<Tag>[]) : [];
  return list.filter((t) => typeof t?.id === 'string' && SLUG.test(t.id) && typeof t.name === 'string')
    .map((t, i) => ({ id: t.id!, name: t.name!, color: typeof t.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : TAG_COLORS[i % TAG_COLORS.length], description: String(t.description ?? '') }));
}

// Creates the tag (id from the name) or updates the one with `id`. A new name that matches an existing tag returns it.
export function saveTag(input: { id?: string; name: string; color?: string; description?: string }, root = ROOT): Tag {
  const name = String(input.name ?? '').trim().slice(0, 40);
  if (!name) throw new Error('Tag name is required.');
  const tags = listTags(root);
  const id = input.id ? String(input.id) : slugify(name);
  if (!SLUG.test(id)) throw new Error('Tag name: use at least one letter or digit.');
  const old = tags.find((t) => t.id === id);
  if (!input.id && old) return old;
  if (input.id && !old) throw new Error('Unknown tag.');
  const color = input.color && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : old?.color ?? TAG_COLORS[tags.length % TAG_COLORS.length];
  const tag: Tag = { id, name, color, description: String(input.description ?? old?.description ?? '').slice(0, 300) };
  writeJson(tagsFile(root), { tags: old ? tags.map((t) => (t.id === id ? tag : t)) : [...tags, tag] });
  return tag;
}

// Removes the tag from the catalog, from every project and from every file.
export function removeTag(id: string, root = ROOT): void {
  writeJson(tagsFile(root), { tags: listTags(root).filter((t) => t.id !== id) });
  for (const project of listProjects(root)) {
    if (projectSummary(project, root).tags.includes(id)) setProjectTags(project, projectSummary(project, root).tags.filter((t) => t !== id), root);
    const files = fileTags(project, root);
    for (const [path, ids] of Object.entries(files)) if (ids.includes(id)) setFileTags(project, path, ids.filter((t) => t !== id), root);
  }
}

const knownTags = (ids: unknown, root: string): string[] => {
  const known = new Set(listTags(root).map((t) => t.id));
  return [...new Set(strings(ids).filter((id) => known.has(id)))];
};

export function setProjectTags(project: string, ids: unknown, root = ROOT): string[] {
  const file = join(projectsDir(root), project, 'project.json');
  const data = readJson(file) as Record<string, unknown>;
  const tags = knownTags(ids, root);
  writeJson(file, { ...data, tags });
  return tags;
}

// Tags of the project's files, keyed by path relative to the project folder ("/" separators).
export function fileTags(project: string, root = ROOT): Record<string, string[]> {
  let data: { files?: unknown } = {};
  try { data = readJson(fileTagsFile(project, root)) as { files?: unknown }; } catch { /* nothing tagged */ }
  const files = data.files && typeof data.files === 'object' ? (data.files as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(files).map(([path, ids]) => [path, strings(ids)]).filter(([, ids]) => ids.length));
}

// A relative path inside the project, normalized to "/", that is an existing file (not project.json or tags.json).
export function projectFilePath(project: string, path: string, root = ROOT): string {
  const rel = String(path ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = rel.split('/');
  if (!rel || rel.includes('\0') || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel) || parts.some((p) => p === '..' || p === '.' || p === '')) throw new Error('Invalid path.');
  if (rel === 'project.json' || rel === 'tags.json') throw new Error('This file cannot be tagged.');
  if (!isFile(join(projectsDir(root), project, ...parts))) throw new Error('File not found in the project.');
  return rel;
}

export function setFileTags(project: string, path: string, ids: unknown, root = ROOT): string[] {
  const files = fileTags(project, root);
  const rel = String(path).replace(/\\/g, '/');
  const tags = knownTags(ids, root);
  if (tags.length) files[projectFilePath(project, rel, root)] = tags;
  else delete files[rel]; // untagging also works for a file that is gone
  writeJson(fileTagsFile(project, root), { files });
  return tags;
}

const contextFilesOf = (project: string, root: string): string[] => {
  const dir = join(projectsDir(root), project, 'context');
  const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).sort().flatMap((n) => {
    const full = join(d, n);
    return statSync(full).isDirectory() ? walk(full) : [full];
  }) : []);
  return walk(dir).map((f) => `${workspaceLabel(root)}/projects/${project}/${f.slice(join(projectsDir(root), project).length + 1).split(sep).join('/')}`);
};

// What an activity of `project` may read: its own context files, and, for each of its tags,
// the context of the other projects with the tag and the files tagged with it elsewhere.
export function contextChoice(project: string, root = ROOT): ContextChoice {
  const own = contextFilesOf(project, root);
  const mine = projectSummary(project, root).tags;
  const catalog = listTags(root);
  const others = listProjects(root).filter((p) => p !== project).map((p) => ({ summary: projectSummary(p, root), files: fileTags(p, root) }));
  const shared = mine.flatMap((id): SharedTag[] => {
    const tag = catalog.find((t) => t.id === id);
    if (!tag) return [];
    const sources = others.flatMap(({ summary, files }): SharedSource[] => {
      const whole = summary.tags.includes(id);
      const tagged = Object.entries(files).filter(([path, ids]) => ids.includes(id) && isFile(join(projectsDir(root), summary.id, ...path.split('/'))))
        .map(([path]) => `${workspaceLabel(root)}/projects/${summary.id}/${path}`);
      const paths = [...new Set([...(whole ? contextFilesOf(summary.id, root) : []), ...tagged])];
      return paths.length || whole ? [{ project: summary.id, name: summary.name, whole, paths }] : [];
    });
    return sources.length ? [{ tag, sources }] : [];
  });
  return { own, shared };
}

// ---------------------------------------------------------------- files

// Accepts paths typed or dragged into a terminal ("quoted", 'quoted', escaped spaces).
export function cleanPath(raw: string): string {
  let p = raw.trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) p = p.slice(1, -1);
  if (process.platform !== 'win32') p = p.replace(/\\ /g, ' ');
  if (p.startsWith('~')) p = join(process.env.HOME || process.env.USERPROFILE || '', p.slice(1));
  // Git Bash style /c/Users/... on Windows
  if (process.platform === 'win32' && /^\/[a-zA-Z]\//.test(p)) p = `${p[1]}:${p.slice(2)}`;
  return resolve(p);
}

export const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();

// Copies a file into the project inbox without overwriting; returns repo-relative path.
export function copyToInbox(project: string, source: string, root = ROOT): string {
  const inbox = join(projectsDir(root), project, 'inbox');
  mkdirSync(inbox, { recursive: true });
  if (resolve(source).startsWith(resolve(inbox))) return `${workspaceLabel(root)}/projects/${project}/inbox/${basename(source)}`;
  const ext = extname(source);
  const stem = basename(source, ext);
  let name = basename(source);
  for (let i = 1; existsSync(join(inbox, name)); i++) name = `${stem}-${i}${ext}`;
  copyFileSync(source, join(inbox, name));
  return `${workspaceLabel(root)}/projects/${project}/inbox/${name}`;
}

// ---------------------------------------------------------------- requests

export interface Request {
  project: string;
  activity: ActivityKey;
  files?: string[];
  note?: string;
  run?: string;
  language?: string;
  // Agent to act as: its name and its file (relative to the framework folder).
  agent?: { name: string; path: string };
  repository?: string; // folder linked to the project
  skills?: string[]; // installed for this project (installedSkills)
  agents?: string[]; // installed for this project (installedAgents)
  description?: string; // the project's goal, for the setup activity
  globalSkills?: { name: string; path: string }[]; // global skills linked to the project, with their SKILL.md
  available?: { skills: string[]; agents: string[] }; // what the plan activity may recommend (global skills, usable agents)
  shared?: { tag: string; project: string; paths: string[] }[]; // other projects' files shared through tags and kept by the user
  excluded?: string[]; // this project's context files the user left out of the activity
  workspace?: string; // workspaceLabel: "workspace", or the folder of another workspace
}

export function buildPrompt({ project, activity, files = [], note = '', run = '', language = 'English', agent, repository = '', skills = [], agents = [], description = '', globalSkills = [], available, shared = [], excluded = [], workspace = 'workspace' }: Request): string {
  const list = files.length ? files.join(', ') : '';
  const parts = [`Follow AGENTS.md. Project: ${project}.`];
  if (workspace !== 'workspace') {
    parts.push(`Workspace folder: ${workspace}. Every path that AGENTS.md and the skills write as workspace/... is inside this folder, not in this repository's workspace/ folder;`
      + ` paths recorded inside state.json and project files keep the workspace/... form. Run the npm helper commands with the environment variable QA_WORKSPACE=${workspace}.`);
  }
  if (repository) parts.push(`Linked folder (the system's repository): ${repository}.`);
  if (agent) parts.push(`Act as the ${agent.name} agent: read ${agent.path} and follow it.`);
  switch (activity) {
    case 'open':
      parts.push('Use the project-context skill to load this project\'s context, summarize in a few lines what is known and what is missing, and ask me what I need.');
      if (list) parts.push(`Files available for this session: ${list}.`);
      break;
    case 'review':
      parts.push(`Use the requirements-review skill to review the user stories in: ${list}.`);
      break;
    case 'tests':
      parts.push(`Use the test-design skill to map the test scenarios for: ${list}.`);
      break;
    case 'review-then-tests':
      parts.push(`Use the qa-orchestrator with the requirements-to-tests workflow: review the user stories in ${list} and, once the review is approved, map the test scenarios.`);
      break;
    case 'failure':
      parts.push(list
        ? `Use the failure-analysis skill with the input in: ${list}.`
        : 'Use the failure-analysis skill. I will paste the filled input template next.');
      break;
    case 'evidence':
      parts.push(`Use the qa-orchestrator with the test-evidence workflow: collect the work item and the Jam recordings, then build the evidence spreadsheet and the Word document.${list ? ` Inputs and models: ${list}.` : ' I will give you the work item and the Jam links next.'}`);
      break;
    case 'context':
      parts.push('Use the project-context skill: load the project context, show what is known and what is missing, and continue the onboarding if needed.');
      if (list) parts.push(`Documents to use: ${list}.`);
      break;
    case 'setup':
      parts.push(`Use the project-context skill to prepare this project for its goal: ${description.trim() ? JSON.stringify(description.trim()) : 'the description in project.json (ask me for it if it is empty)'}.`
        + `${repository ? ' Look at the linked folder first.' : ''} Propose how to adapt the context files and which of the available skills fit;`
        + ` write the proposals to ${workspace}/projects/${project}/proposed-updates.md and wait for my approval before changing context/. Do not install skills: I install them from the app.`);
      if (list) parts.push(`Documents to use: ${list}.`);
      break;
    case 'plan': {
      const dir = `${workspace}/projects/${project}`;
      const names = (l: string[] = []) => (l.length ? l.join(', ') : 'none');
      parts.push(`Use the project-context skill to plan this blank project ("Plan a blank project" procedure). Read ${dir}/plan.json first.`
        + ` If it has "approved": true, create only the contextFiles it lists (confirmed answers only), list them in context/index.md and project.json contextFiles, and stop.`
        + ` Otherwise: the goal is ${description.trim() ? JSON.stringify(description.trim()) : 'the description in project.json (ask me for it if it is empty)'}.${repository ? ' Look at the linked folder first.' : ''}`
        + ' Interview me one question at a time about what the project needs: goal, technologies, team, and what to link (repository, skills, agents, knowledge sources, inbox documents).'
        + ` Then write the plan to ${dir}/proposed-updates.md and the recommendation to ${dir}/plan.json, recommending only these names - skills: ${names(available?.skills)}; agents: ${names(available?.agents)}; skills I still need go in searchSkills as search terms.`
        + ' Stop and tell me to review the plan in the app. Do not create context files, install or link anything before I approve it there.');
      if (list) parts.push(`Documents to use: ${list}.`);
      break;
    }
    case 'automation':
      parts.push(`Use the automation skill.${list ? ` Inputs: ${list}.` : ''}`);
      break;
    case 'resume':
      parts.push(`Resume run ${run}: read ${workspace}/projects/${project}/runs/${run}/state.json first, summarize where we stopped and continue from the current step.`);
      break;
    default:
      throw new Error(`Unknown activity "${String(activity)}"`);
  }
  if (skills.length) parts.push(`Skills installed for this project (read ${folderLabel(project, repository, 'skills', workspace)}/<name>/SKILL.md when one fits the task): ${skills.join(', ')}.`);
  if (globalSkills.length) parts.push(`Global skills linked to this project (read the SKILL.md when one fits the task): ${globalSkills.map((s) => `${s.name} (${s.path})`).join(', ')}.`);
  if (agents.length) parts.push(`Agents defined for this project (when I ask for one, follow ${folderLabel(project, repository, 'agents', workspace)}/<name>.md and use only the skills it lists): ${agents.join(', ')}.`);
  const sources = shared.filter((s) => s.paths.length);
  if (sources.length) {
    parts.push(`Shared context I authorize for this activity, through project tags (read-only files of other projects; cite the source project of anything you use; never write in those projects; new knowledge for this project goes to ${workspace}/projects/${project}/proposed-updates.md, not to context/): ${sources.map((s) => `tag ${s.tag}, project ${s.project}: ${s.paths.join(', ')}`).join('; ')}.`
      + " Read nothing else from other projects. Record these files in the run's state.json under contextSources.");
  }
  if (excluded.length) parts.push(`Do not use these files of this project in this activity: ${excluded.join(', ')}.`);
  if (note.trim()) parts.push(`Additional instructions: ${note.trim().replace(/([^.!?])$/, '$1.')}`);
  parts.push(`Talk to me in ${language}.`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- AI tools

export function which(command: string): string | null {
  try {
    // A missing command returns at once. A hung lookup must not freeze the app (the desktop window shares this process).
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).find(Boolean) || null;
  } catch { return null; }
}

export function detectTools(): Record<ToolKey, boolean> {
  return Object.fromEntries(Object.entries(TOOLS).map(([key, t]) => [key, t.command ? Boolean(which(t.command)) : true])) as Record<ToolKey, boolean>;
}

const nodeRequire = createRequire(import.meta.url);

// clip.exe, started from the desktop app, waits forever for a console that a windowed process does not have.
// The app then stays on "Opening…" and never shows what happened. Electron's own clipboard returns immediately.
function electronClipboard(text: string): boolean {
  try {
    const electron = nodeRequire('electron') as { clipboard?: { writeText?: (value: string) => void } } | string;
    const write = typeof electron === 'object' ? electron.clipboard?.writeText : undefined;
    if (typeof write !== 'function') return false;
    write(text);
    return true;
  } catch { return false; }
}

export function copyToClipboard(text: string): boolean {
  if (electronClipboard(text)) return true;
  const attempts: [string, string[]][] = process.platform === 'win32' ? [['clip', []]]
    : process.platform === 'darwin' ? [['pbcopy', []]]
      : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  // clip.exe reads UTF-16LE (with BOM) correctly; other tools take UTF-8.
  const input = process.platform === 'win32' ? Buffer.from(`\uFEFF${text}`, 'utf16le') : Buffer.from(text, 'utf8');
  for (const [cmd, args] of attempts) {
    const r = spawnSync(cmd, args, { input, timeout: 4000, windowsHide: true });
    if (r.status === 0) return true;
  }
  return false;
}

// On Windows, tools installed as .cmd shims receive their arguments through
// cmd.exe, which corrupts non-ASCII text (ç, ã, é...). In that case the full
// request is written to a UTF-8 file inside the project and the tool gets a
// short ASCII instruction to read it. Elsewhere the prompt is passed as-is.
export function windowsSafePrompt(prompt: string, project: string, root = ROOT, platform: string = process.platform): string {
  if (platform !== 'win32' || /^[\x20-\x7e]*$/.test(prompt)) return prompt;
  const dir = join(projectsDir(root), project, 'temporary');
  mkdirSync(dir, { recursive: true });
  const name = `request-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  writeFileSync(join(dir, name), `${prompt}\n`, 'utf8');
  return `Follow AGENTS.md. Project: ${project}. Your request is in the file ${workspaceLabel(root)}/projects/${project}/temporary/${name} (UTF-8 text). Read it and follow it exactly.`;
}

// Windows shells (.cmd shims) need the prompt as a single quoted argument.
export function launchTool(tool: ToolKey, prompt: string, cwd = ROOT): ChildProcess {
  const t = TOOLS[tool];
  if (!t.command || !t.args) throw new Error(`${t.label} cannot be launched from the terminal.`);
  const args = t.args(prompt);
  if (process.platform === 'win32') {
    const quoted = args.map((a) => `"${String(a).replace(/"/g, "'").replace(/%/g, ' percent')}"`).join(' ');
    return spawn(`${t.command} ${quoted}`, { cwd, stdio: 'inherit', shell: true });
  }
  return spawn(t.command, args, { cwd, stdio: 'inherit' });
}

// ---------------------------------------------------------------- preferences

const prefsFile = (root = ROOT): string => join(workspaceDir(root), '.qa-preferences.json');

export interface Prefs { project?: string; language?: string; tool?: string }

export function loadPrefs(root = ROOT): Prefs {
  try { return JSON.parse(readFileSync(prefsFile(root), 'utf8')) as Prefs; } catch { return {}; }
}

export function savePrefs(prefs: Prefs, root = ROOT): void {
  try { mkdirSync(workspaceDir(root), { recursive: true }); writeFileSync(prefsFile(root), JSON.stringify(prefs, null, 2)); } catch { /* optional */ }
}
