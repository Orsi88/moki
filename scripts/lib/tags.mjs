// Which projects a workspace item (an agent, a template, an MCP server, an operation)
// applies to, by its tags: no tag = every project; "project:<id>" = that project (every
// project has its own tag); any other tag = the projects that carry it (project.json
// "tags", catalog in workspace/tags.json). One rule for every kind of item. No dependencies.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, workspaceDir } from './repo.mjs';

export const PROJECT_TAG = 'project:';
export const projectTag = (id) => `${PROJECT_TAG}${id}`;
export const isProjectTag = (tag) => typeof tag === 'string' && tag.startsWith(PROJECT_TAG);
const TAG = /^(project:)?[a-z0-9]+(-[a-z0-9]+)*$/;

// A project's own tags (project.json "tags").
export function tagsOfProject(project, root = ROOT) {
  try {
    const data = JSON.parse(readFileSync(join(workspaceDir(root), 'projects', project, 'project.json'), 'utf8'));
    return Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string') : [];
  } catch { return []; }
}

export function appliesTo(tags, project, root = ROOT) {
  if (!Array.isArray(tags) || !tags.length) return true;
  if (tags.includes(projectTag(project))) return true;
  const own = tagsOfProject(project, root);
  return tags.some((t) => own.includes(t));
}

// Any input as a clean list of tags (ids of the catalog or project tags), without repeats.
export const cleanTags = (value) => [...new Set((Array.isArray(value) ? value : []).map(String).filter((t) => TAG.test(t)))].slice(0, 200);
