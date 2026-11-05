// Activities: the ready-made requests a person picks in "Open in your AI tool". An activity
// does not know how to do anything itself: it says what to ask, of whom and with what -
// its name and description in the list, which inbox files it needs, what it points to
// (a skill, an agent, a workflow of qa-orchestrator or a multi-agent operation) and the
// text that goes to the AI. The skill is the procedure; the activity is the order.
//
// Three sources, one list:
// - moki: the app's own actions (open, context, setup, plan, resume), in code: their
//   requests depend on the app (plan.json approval, the run to resume...). Not editable.
// - builtin: activities/<id>.md in the framework (read-only; duplicate one to change it).
// - library: <workspace>/library/activities/<id>.md, the person's own.
// A library activity with tags reaches only the projects of those tags (none = every
// project, the same rule as agents and templates). Favorites: scripts/lib/favorites.ts.
//
// The text: {files} becomes the inbox files (a line with {files} is left out when there are
// none), a line that starts with {no-files} is kept only when there are none, and {project}
// becomes the project id. An empty text asks for the skill, workflow or agent it points to.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, workspaceDir } from './repo.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { appliesTo, cleanTags } from './tags.mjs';
import { favoritesOf, setFavoriteOf } from './favorites.ts';

export type TargetKind = 'moki' | 'skill' | 'agent' | 'workflow' | 'operation';
export const TARGET_KINDS: TargetKind[] = ['skill', 'agent', 'workflow', 'operation']; // what a file may point to
export type FilesRule = 'required' | 'optional' | 'none';
export const FILES_RULES: FilesRule[] = ['required', 'optional', 'none'];
export type ActivitySource = 'moki' | 'builtin' | 'library';

export interface ActivityDef {
  id: string; label: string; description: string; category: string;
  target: { kind: TargetKind; name: string }; // moki: the skill its request uses
  files: FilesRule; note: string; tags: string[]; template: string;
  source: ActivitySource; path?: string; // the file, for builtin and library ones
}

export const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const LIMIT = { label: 80, description: 300, category: 40, note: 200, template: 4000 };

// The app's own actions: their requests are built in core.ts (buildPrompt), not from a text.
export const MOKI_ACTIVITIES: ActivityDef[] = [
  { id: 'open', label: 'Just open the project', description: 'loads the context and asks what you need', target: { kind: 'moki', name: 'project-context' }, files: 'optional' },
  { id: 'context', label: 'Project context', description: 'onboarding, questions, updates', target: { kind: 'moki', name: 'project-context' }, files: 'optional' },
  { id: 'setup', label: 'Prepare the project', description: 'adapts the context to the project description', target: { kind: 'moki', name: 'project-context' }, files: 'optional' },
  { id: 'plan', label: 'Plan the project with the AI', description: 'interview, then a plan you review in the app', target: { kind: 'moki', name: 'project-context' }, files: 'optional' },
  { id: 'resume', label: 'Resume a run', description: '', target: { kind: 'moki', name: 'qa-orchestrator' }, files: 'none' },
  // "Call an agent" in the project panel: a conversation with one agent, not an activity (never in the activity lists: PICKABLE).
  { id: 'talk', label: 'Talk with an agent', description: 'a conversation about an idea, no activity', target: { kind: 'moki', name: 'project-context' }, files: 'none' },
  // "Use a skill" in the project panel: the skill and the AI, not an activity in the activity list.
  { id: 'skill', label: 'Use a skill', description: 'follow one skill', target: { kind: 'moki', name: 'project-context' }, files: 'none' },
].map((a) => ({ ...a, category: 'Moki', note: '', tags: [], template: '', source: 'moki' as const })) as ActivityDef[];
export const isMokiActivity = (id: string): boolean => MOKI_ACTIVITIES.some((a) => a.id === id);
// Activities offered where one is picked (the app, the IDE, the terminal menu). "talk" and "skill" start only from the project panel.
export const isPickable = (a: { id: string }): boolean => a.id !== 'talk' && a.id !== 'skill';

export const builtinDir = (root = ROOT): string => join(root, 'activities');
export const libraryDir = (root = ROOT): string => join(workspaceDir(root), 'library', 'activities');

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();

// One activity file: frontmatter and the text. Returns the errors instead of throwing.
export function parseActivity(text: string, id: string, source: 'builtin' | 'library', path?: string): { activity: ActivityDef | null; errors: string[] } {
  const { data, body, errors } = parseFrontmatter(text) as { data: Record<string, unknown> | null; body: string; errors: string[] };
  if (!data) return { activity: null, errors };
  const problems = [...errors];
  const uses = str(data.uses);
  const m = uses.match(/^(skill|agent|workflow|operation):([a-z0-9][a-z0-9:-]{0,99})$/);
  if (!m) problems.push('uses must be skill:<name>, agent:<name>, workflow:<id> or operation:<id>');
  const files = (str(data.files) || 'optional') as FilesRule;
  if (!FILES_RULES.includes(files)) problems.push('files must be required, optional or none');
  if (!ID.test(id)) problems.push('the id (file name) must be lowercase letters, digits and hyphens');
  const label = str(data.label);
  if (!label) problems.push('label is required');
  const activity: ActivityDef = {
    id, label: label.slice(0, LIMIT.label), description: str(data.description).slice(0, LIMIT.description),
    category: (str(data.category) || 'Other').slice(0, LIMIT.category),
    target: { kind: (m?.[1] ?? 'skill') as TargetKind, name: m?.[2] ?? '' },
    files, note: str(data.note).slice(0, LIMIT.note),
    tags: cleanTags(str(data.tags).split(',').map((t) => t.trim()).filter(Boolean)),
    template: body.trim().slice(0, LIMIT.template), source, path,
  };
  return { activity: problems.length ? null : activity, errors: problems };
}

function readDir(dir: string, source: 'builtin' | 'library'): ActivityDef[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().flatMap((f) => {
    const path = join(dir, f);
    const { activity } = parseActivity(readFileSync(path, 'utf8'), f.slice(0, -3), source, path);
    return activity ? [activity] : []; // a broken file is left out, never half-used (the validator reports builtin ones)
  });
}

// Every activity, or the ones a project sees (library ones by their tags). An id is unique: moki, then builtin, then library.
export function listActivities(root = ROOT, project?: string): ActivityDef[] {
  const seen = new Set<string>();
  return [...MOKI_ACTIVITIES, ...readDir(builtinDir(root), 'builtin'), ...readDir(libraryDir(root), 'library')]
    .filter((a) => !seen.has(a.id) && seen.add(a.id))
    .filter((a) => !project || appliesTo(a.tags, project, root));
}

export const getActivity = (id: string, root = ROOT): ActivityDef | undefined => listActivities(root).find((a) => a.id === id);

// The request text of a builtin or library activity (moki ones are built in core.ts).
export function activityRequest(a: ActivityDef, files: string[], project: string): string {
  const list = files.join(', ');
  const text = a.template || defaultTemplate(a);
  return text.split('\n').flatMap((line) => {
    if (line.startsWith('{no-files}')) return files.length ? [] : [line.slice('{no-files}'.length).trim()];
    if (line.includes('{files}') && !files.length) return [];
    return [line.replaceAll('{files}', list).replaceAll('{project}', project).trim()];
  }).filter(Boolean).join(' ');
}

function defaultTemplate(a: ActivityDef): string {
  const files = '\nFiles to use: {files}.';
  if (a.target.kind === 'skill') return `Use the ${a.target.name} skill.${files}`;
  if (a.target.kind === 'workflow') return `Use the qa-orchestrator with the ${a.target.name} workflow.${files}`;
  return files.trim(); // agent: the request already says to act as it
}

// The file of a library activity, from what the person typed (validated as a builtin file would be).
export function activityMarkdown(a: Pick<ActivityDef, 'label' | 'description' | 'category' | 'target' | 'files' | 'note' | 'tags' | 'template'>): string {
  const q = (s: string) => JSON.stringify(s);
  return ['---', `label: ${q(a.label)}`, `description: ${q(a.description)}`, `category: ${q(a.category)}`, `uses: ${a.target.kind}:${a.target.name}`,
    `files: ${a.files}`, `note: ${q(a.note)}`, `tags: ${q(a.tags.join(', '))}`, '---', '', a.template.trim(), ''].join('\n');
}

export function saveLibraryActivity(id: string, text: string, root = ROOT): ActivityDef {
  const { activity, errors } = parseActivity(text, id, 'library');
  if (!activity) throw new Error(`The activity is not valid: ${errors.join('; ')}.`);
  if (isMokiActivity(id) || existsSync(join(builtinDir(root), `${id}.md`))) throw new Error(`"${id}" is the id of an activity that comes with Moki: choose another name.`);
  mkdirSync(libraryDir(root), { recursive: true });
  writeFileSync(join(libraryDir(root), `${id}.md`), text);
  return { ...activity, path: join(libraryDir(root), `${id}.md`) };
}

export function removeLibraryActivity(id: string, root = ROOT): void {
  const file = join(libraryDir(root), `${id}.md`);
  if (!ID.test(id) || !existsSync(file)) throw new Error('Only your own activities can be deleted.');
  rmSync(file);
  setFavorite(id, false, root);
}

// A free id from a name: "Design tests" -> design-tests, design-tests-2...
export function activityId(label: string, root = ROOT): string {
  const base = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'activity';
  const taken = new Set(listActivities(root).map((a) => a.id));
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

// Starred activities (scripts/lib/favorites.ts keeps the favorites of every kind).
export const favorites = (root = ROOT): string[] => favoritesOf('activities', root).filter((id) => ID.test(id));
export const setFavorite = (id: string, on: boolean, root = ROOT): string[] => setFavoriteOf('activities', id, on, root);
