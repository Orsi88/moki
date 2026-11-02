// Favorites of the workspace (scripts/lib/favorites.ts): one list per kind in library/favorites.json.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allFavorites, favoritesOf, isFavoriteKind, mostUsed, recordUse, setFavoriteOf } from '../scripts/lib/favorites.ts';
import { favorites as activityFavorites } from '../scripts/lib/activities.ts';
import { createService } from '../desktop/service.ts';

const root = mkdtempSync(join(tmpdir(), 'qa-favorites-'));
after(() => rmSync(root, { recursive: true, force: true }));

test('one list per kind, kept apart, in the order they were starred; unstarring removes one', () => {
  assert.deepEqual(allFavorites(root), { activities: [], agents: [], operations: [], templates: [], skills: [] });
  setFavoriteOf('agents', 'test-designer', true, root);
  setFavoriteOf('agents', '~my-agent', true, root);
  setFavoriteOf('operations', 'fluxo-qa', true, root);
  setFavoriteOf('templates', 'default', true, root);
  setFavoriteOf('skills', 'test-design', true, root);
  setFavoriteOf('activities', 'tests', true, root);
  assert.deepEqual(favoritesOf('agents', root), ['test-designer', '~my-agent']);
  assert.deepEqual(setFavoriteOf('agents', 'test-designer', true, root), ['~my-agent', 'test-designer'], 'starred again: moves to the end, never twice');
  assert.deepEqual(setFavoriteOf('agents', '~my-agent', false, root), ['test-designer']);
  assert.deepEqual(activityFavorites(root), ['tests'], 'activities read the same file');
  const file = JSON.parse(readFileSync(join(root, 'workspace', 'library', 'favorites.json'), 'utf8')) as Record<string, string[]>;
  assert.deepEqual(file.operations, ['fluxo-qa']);
  assert.deepEqual(file.templates, ['default']);
});

test('only the known kinds and safe ids', () => {
  assert.equal(isFavoriteKind('agents'), true);
  assert.equal(isFavoriteKind('projects'), false);
  assert.throws(() => setFavoriteOf('skills', '../escape', true, root), /Unknown item/);
  const svc = createService(root, { launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {} });
  assert.throws(() => svc.setFavorite('projects', 'x', true), /Unknown list/);
  assert.deepEqual(svc.setFavorite('skills', 'failure-analysis', true), ['test-design', 'failure-analysis']);
  assert.deepEqual(svc.favorites().skills, ['test-design', 'failure-analysis']);
});

test('most used: counted per kind, the top 5, ties by id, unsafe ids ignored', () => {
  const r = mkdtempSync(join(tmpdir(), 'qa-usage-'));
  try {
    for (const id of ['f', 'e', 'd', 'c', 'b', 'a']) recordUse('activities', id, r);
    recordUse('activities', 'f', r);
    recordUse('activities', '../x', r);
    assert.deepEqual(mostUsed('activities', r), ['f', 'a', 'b', 'c', 'd']);
    assert.deepEqual(mostUsed('agents', r), []);
  } finally { rmSync(r, { recursive: true, force: true }); }
});
