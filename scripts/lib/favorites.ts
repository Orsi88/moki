// Favorites of the workspace: activities, agents, operations, templates and skills the person
// starred, so they come first wherever they are listed or picked. One file per workspace,
// <workspace>/library/favorites.json: {"activities": [...], "agents": [...], ...}, a list of ids
// per kind (an agent or skill by its name, an operation, template or activity by its id).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, workspaceDir } from './repo.mjs';

export const FAVORITE_KINDS = ['activities', 'agents', 'operations', 'templates', 'skills'] as const;
export type FavoriteKind = typeof FAVORITE_KINDS[number];
export const isFavoriteKind = (v: unknown): v is FavoriteKind => (FAVORITE_KINDS as readonly unknown[]).includes(v);
const ITEM = /^[A-Za-z0-9~][A-Za-z0-9:._~-]{0,119}$/; // names and ids of the workspace ("~" marks an agent of the user folder)
const MAX = 500;

const file = (root: string) => join(workspaceDir(root), 'library', 'favorites.json');
function read(root: string): Record<string, unknown> {
  try { const data = JSON.parse(readFileSync(file(root), 'utf8')); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; }
}

export function favoritesOf(kind: FavoriteKind, root = ROOT): string[] {
  const list = read(root)[kind];
  return Array.isArray(list) ? [...new Set(list.map(String).filter((id) => ITEM.test(id)))].slice(0, MAX) : [];
}

// Every kind at once, for the app.
export const allFavorites = (root = ROOT): Record<FavoriteKind, string[]> =>
  Object.fromEntries(FAVORITE_KINDS.map((k) => [k, favoritesOf(k, root)])) as Record<FavoriteKind, string[]>;

export function setFavoriteOf(kind: FavoriteKind, id: string, on: boolean, root = ROOT): string[] {
  if (!ITEM.test(id)) throw new Error('Unknown item.');
  const now = favoritesOf(kind, root).filter((x) => x !== id);
  const next = (on ? [...now, id] : now).slice(-MAX);
  mkdirSync(join(workspaceDir(root), 'library'), { recursive: true });
  writeFileSync(file(root), `${JSON.stringify({ ...read(root), [kind]: next }, null, 2)}\n`);
  return next;
}

// Usage counts of the workspace, <workspace>/library/usage.json: {"activities": {"<id>": n}, ...}.
// Only what is started from the IDE panel counts. The most used of a kind come with the favorites.
const USAGE_TOP = 5;
const usageFile = (root: string) => join(workspaceDir(root), 'library', 'usage.json');
function readUsage(root: string): Record<string, Record<string, number>> {
  try { const data = JSON.parse(readFileSync(usageFile(root), 'utf8')); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; }
}

export function recordUse(kind: FavoriteKind, id: string, root = ROOT): void {
  if (!ITEM.test(id)) return;
  const all = readUsage(root);
  const counts = all[kind] && typeof all[kind] === 'object' ? all[kind] : {};
  counts[id] = (Number(counts[id]) || 0) + 1;
  mkdirSync(join(workspaceDir(root), 'library'), { recursive: true });
  writeFileSync(usageFile(root), `${JSON.stringify({ ...all, [kind]: counts }, null, 2)}\n`);
}

// The ids used most (ties by id), at most USAGE_TOP.
export function mostUsed(kind: FavoriteKind, root = ROOT): string[] {
  const counts = readUsage(root)[kind] ?? {};
  return Object.entries(counts).filter(([id, n]) => ITEM.test(id) && Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0])).slice(0, USAGE_TOP).map(([id]) => id);
}

export const allMostUsed = (root = ROOT): Record<FavoriteKind, string[]> =>
  Object.fromEntries(FAVORITE_KINDS.map((k) => [k, mostUsed(k, root)])) as Record<FavoriteKind, string[]>;
