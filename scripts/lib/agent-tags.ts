// Which projects each agent applies to, by tags (scripts/lib/tags.mjs: none = every
// project). Built-in agents cannot be edited, so the tags of every agent live in the
// workspace: <workspace>/library/agent-tags.json {"agents": {"<name>": [tags]}}.
// The first read turns the projects' old lists (project.json "agents") into tags, so
// every project keeps exactly the agents it had.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, workspaceDir } from './repo.mjs';
import { appliesTo, cleanTags, isProjectTag, projectTag } from './tags.mjs';
import { listProjects, projectsDir } from './core.ts';
import { isUsableAgent, listAgents } from './agents.ts';

const tagsFile = (root: string) => join(workspaceDir(root), 'library', 'agent-tags.json');
const readJson = (file: string): Record<string, unknown> | null => { try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; } catch { return null; } };
const usable = (root: string): string[] => listAgents(root).filter(isUsableAgent).map((a) => a.name);
// An agent turned off in its last project: no project has this tag (no tag at all would mean every project).
const NOWHERE = projectTag('none');

function write(map: Record<string, string[]>, root: string): void {
  const file = tagsFile(root);
  mkdirSync(dirname(file), { recursive: true });
  const agents = Object.fromEntries(Object.entries(map).filter(([, tags]) => tags.length).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, `${JSON.stringify({ agents }, null, 2)}\n`);
}

// Only the projects' own tags, all of them: the same as no tag (every project).
function simplify(tags: string[], root: string): string[] {
  const projects = listProjects(root);
  return tags.every(isProjectTag) && projects.length > 0 && projects.every((p) => tags.includes(projectTag(p))) ? [] : tags;
}

function migrate(root: string): void {
  if (existsSync(tagsFile(root))) return;
  const projects = listProjects(root);
  const lists = Object.fromEntries(projects.map((p) => {
    const agents = readJson(join(projectsDir(root), p, 'project.json'))?.agents;
    return [p, Array.isArray(agents) ? agents.map(String) : null]; // null: every agent
  }));
  const map: Record<string, string[]> = {};
  for (const name of usable(root)) {
    const where = projects.filter((p) => lists[p] === null || lists[p]!.includes(name));
    if (where.length < projects.length) map[name] = where.map(projectTag);
  }
  write(map, root);
}

export function agentTags(root = ROOT): Record<string, string[]> {
  migrate(root);
  const agents = readJson(tagsFile(root))?.agents;
  return Object.fromEntries(Object.entries(agents && typeof agents === 'object' ? agents : {}).map(([k, v]) => [k, cleanTags(v)]));
}

export function setAgentTags(name: string, tags: unknown, root = ROOT): string[] {
  if (!listAgents(root).some((a) => a.name === name)) throw new Error('Unknown agent.');
  const map = agentTags(root);
  map[name] = cleanTags(tags); // as chosen: one project tagged is not "every project", even when it is the only one
  write(map, root);
  return map[name];
}

// The usable agents a project has.
export function agentsOfProject(project: string, root = ROOT): string[] {
  const map = agentTags(root);
  return usable(root).filter((n) => appliesTo(map[n] ?? [], project, root));
}

// Turns agents on or off in one project (Set up project) through the project's own tag.
// An agent it reaches through a group tag cannot be turned off here: that tag says so.
export function setAgentsOfProject(project: string, names: string[], root = ROOT): string[] {
  const map = agentTags(root);
  const others = listProjects(root).filter((p) => p !== project).map(projectTag);
  const own = projectTag(project);
  for (const name of usable(root)) {
    const tags = map[name] ?? [];
    const on = appliesTo(tags, project, root);
    const want = names.includes(name);
    if (want && !on) map[name] = simplify([...tags, own], root);
    else if (!want && on) {
      const next = tags.length ? tags.filter((t) => t !== own) : others;
      if (next.length && appliesTo(next, project, root)) {
        throw new Error(`${name} reaches this project through the tag "${next.find((t) => !isProjectTag(t))}". Change its tags in Settings › Agents.`);
      }
      map[name] = next.length ? next : [NOWHERE]; // no tag would mean every project
    }
  }
  write(map, root);
  return agentsOfProject(project, root);
}
