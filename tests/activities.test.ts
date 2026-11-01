// Activities (scripts/lib/activities.ts): the app's own actions in code, the ones of Moki in activities/,
// the person's own in the workspace library; edited from Settings, picked in "Open in your AI tool".
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/repo.mjs';
import { createProject } from '../scripts/lib/core.ts';
import { activityId, activityMarkdown, activityRequest, favorites, getActivity, libraryDir, listActivities, parseActivity, removeLibraryActivity, saveLibraryActivity, setFavorite } from '../scripts/lib/activities.ts';
import { createService } from '../desktop/service.ts';

const root = mkdtempSync(join(tmpdir(), 'qa-activities-'));
const prompts: string[] = [];
let svc: ReturnType<typeof createService>;

before(() => {
  for (const s of ['project-context', 'test-design', 'failure-analysis', 'requirements-review', 'qa-orchestrator']) cpSync(join(ROOT, 'skills', s), join(root, 'skills', s), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  cpSync(join(ROOT, 'activities'), join(root, 'activities'), { recursive: true });
  createProject('acme', 'Acme', root);
  createProject('beta', 'Beta', root);
  writeFileSync(join(root, 'workspace', 'projects', 'acme', 'inbox', 'us-1.md'), '# US-1');
  svc = createService(root, {
    launch: (_tool, prompt) => { prompts.push(prompt); return { opened: true, message: '' }; },
    openFolder: () => {}, openPath: () => {},
    detectTools: () => ({ claude: true }) as never,
  });
});
after(() => rmSync(root, { recursive: true, force: true }));

const text = (fields: Record<string, string>, body = '') => ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '---', '', body, ''].join('\n');

test('the app\'s actions and the activities that come with Moki: one list, the same ids as before', () => {
  const ids = listActivities(root).map((a) => `${a.source}:${a.id}`);
  for (const id of ['open', 'context', 'setup', 'plan', 'resume']) assert.ok(ids.includes(`moki:${id}`), id);
  for (const id of ['review', 'tests', 'review-then-tests', 'failure', 'evidence', 'automation']) assert.ok(ids.includes(`builtin:${id}`), id);
  assert.ok(!ids.some((i) => i.endsWith(':README')), 'the README of activities/ is not an activity');
  assert.deepEqual(getActivity('review-then-tests', root)?.target, { kind: 'workflow', name: 'requirements-to-tests' });
  assert.equal(getActivity('tests', root)?.files, 'required');
});

test('the request text: {files} lines only with files, {no-files} lines only without, {project}; an empty text asks for its target', () => {
  const failure = getActivity('failure', root)!;
  assert.equal(activityRequest(failure, ['inbox/log.txt'], 'acme'), 'Use the failure-analysis skill with the input in: inbox/log.txt.');
  assert.equal(activityRequest(failure, [], 'acme'), 'Use the failure-analysis skill. I will paste the filled input template next.');
  const own = parseActivity(text({ label: 'Mine', uses: 'skill:test-design' }, 'Project {project}.\nFiles: {files}.'), 'mine', 'library').activity!;
  assert.equal(activityRequest(own, ['a.md', 'b.md'], 'acme'), 'Project acme. Files: a.md, b.md.');
  const empty = parseActivity(text({ label: 'Empty', uses: 'workflow:test-evidence' }), 'empty', 'library').activity!;
  assert.equal(activityRequest(empty, [], 'acme'), 'Use the qa-orchestrator with the test-evidence workflow.');
});

test('a file is checked: what it uses, its files rule, its id and its name', () => {
  const errors = (fields: Record<string, string>, id = 'ok') => parseActivity(text(fields), id, 'library').errors.join(' ');
  assert.equal(errors({ label: 'Fine', uses: 'agent:test-designer', files: 'none' }), '');
  assert.match(errors({ label: 'X', uses: 'tool:x' }), /uses must be/);
  assert.match(errors({ label: 'X', uses: 'skill:test-design', files: 'always' }), /files must be/);
  assert.match(errors({ label: 'X', uses: 'skill:test-design' }, 'Bad Id'), /id/);
  assert.match(errors({ uses: 'skill:test-design' }), /label is required/);
});

test('your own activities: saved in the library, reach projects by tags, never take an id of Moki; favorites', () => {
  const md = activityMarkdown({ label: 'Release notes', description: 'Reviews them', category: 'Docs', target: { kind: 'skill', name: 'test-design' }, files: 'optional', note: '', tags: ['project:beta'], template: 'Review {files}.' });
  const saved = saveLibraryActivity('release-notes', md, root);
  assert.ok(existsSync(join(libraryDir(root), 'release-notes.md')));
  assert.equal(saved.source, 'library');
  assert.ok(listActivities(root, 'beta').some((a) => a.id === 'release-notes'));
  assert.ok(!listActivities(root, 'acme').some((a) => a.id === 'release-notes'), 'a tag of another project');
  assert.throws(() => saveLibraryActivity('tests', md, root), /comes with Moki/);
  assert.equal(activityId('Release notes', root), 'release-notes-2');
  assert.deepEqual(setFavorite('release-notes', true, root), ['release-notes']);
  assert.deepEqual(favorites(root), ['release-notes']);
  removeLibraryActivity('release-notes', root);
  assert.deepEqual(favorites(root), [], 'a deleted activity leaves the favorites');
  assert.throws(() => removeLibraryActivity('tests', root), /Only your own/);
});

test('service: Settings lists, creates, duplicates and deletes; a target that does not exist is refused', () => {
  assert.throws(() => svc.saveActivity({ label: 'X', kind: 'agent', target: 'nobody' }), /no agent "nobody"/);
  assert.throws(() => svc.saveActivity({ label: 'X', kind: 'workflow', target: 'nothing' }), /no workflow "nothing"/);
  assert.throws(() => svc.saveActivity({ label: '', kind: 'skill', target: 'test-design' }), /Give the activity a name/);
  const mine = svc.saveActivity({ label: 'Smoke check', description: 'Quick look', category: 'QA', kind: 'skill', target: 'test-design', files: 'required', template: 'Use the test-design skill to list smoke checks for: {files}.' });
  assert.equal(mine.id, 'smoke-check');
  const changed = svc.saveActivity({ id: 'smoke-check', label: 'Smoke check', kind: 'skill', target: 'test-design', files: 'required', template: 'Smoke checks for: {files}.' });
  assert.equal(changed.id, 'smoke-check', 'saving one of yours keeps its id');
  assert.throws(() => svc.saveActivity({ id: 'tests', label: 'Mine', kind: 'skill', target: 'test-design' }), /cannot be changed: duplicate it/);
  const copy = svc.duplicateActivity('tests');
  assert.equal(copy.source, 'library');
  assert.equal(copy.template, getActivity('tests', root)?.template, 'the copy has the same request');
  assert.throws(() => svc.duplicateActivity('open'), /cannot be duplicated/);
  assert.throws(() => svc.deleteActivity('tests'), /Only your own/);
  svc.setActivityFavorite('smoke-check', true);
  const listed = svc.activities('acme').activities;
  assert.equal(listed.find((a) => a.id === 'smoke-check')?.favorite, true);
  assert.equal(listed.find((a) => a.id === 'smoke-check')?.needsFiles, true);
  assert.equal(svc.activity('smoke-check').template, 'Smoke checks for: {files}.');
  assert.equal(svc.deleteActivity(copy.id), true);
});

test('launching: your activity\'s text, an agent\'s activity acts as it, an operation\'s activity opens its form instead', () => {
  prompts.length = 0;
  assert.throws(() => svc.launch({ project: 'acme', activity: 'smoke-check', tool: 'claude', files: [], note: '', language: 'English' } as never), /needs at least one file/);
  svc.launch({ project: 'acme', activity: 'smoke-check', tool: 'claude', files: ['us-1.md'], note: '', language: 'English' } as never);
  assert.match(prompts.at(-1) ?? '', /Smoke checks for: workspace\/projects\/acme\/inbox\/us-1\.md\./);

  svc.saveActivity({ label: 'Design with the designer', kind: 'agent', target: 'test-designer', files: 'optional', template: '' });
  svc.launch({ project: 'acme', activity: 'design-with-the-designer', tool: 'claude', files: [], note: '', language: 'English' } as never);
  assert.match(prompts.at(-1) ?? '', /Act as the test-designer agent: read .*test-designer\.md and follow it\./);

  const op = svc.saveOperation({ name: 'Fluxo', description: '', lanes: [], steps: [{ id: 's1', agent: 'library:test-designer', x: 0, y: 0 }], links: [] });
  svc.saveActivity({ label: 'Run Fluxo', kind: 'operation', target: op.id, files: 'none' });
  assert.equal(svc.activities('acme').activities.find((a) => a.id === 'run-fluxo')?.available, false, 'not linked to the project yet');
  svc.setProjectOperations('acme', [op.id]);
  assert.equal(svc.activities('acme').activities.find((a) => a.id === 'run-fluxo')?.available, true);
  assert.throws(() => svc.launch({ project: 'acme', activity: 'run-fluxo', tool: 'claude', files: [], note: '', language: 'English' } as never), /starts the operation/);
  assert.throws(() => svc.launch({ project: 'acme', activity: 'made-up', tool: 'claude', files: [], note: '', language: 'English' } as never), /Unknown activity/);
  assert.ok(readFileSync(join(libraryDir(root), 'run-fluxo.md'), 'utf8').includes(`uses: operation:${op.id}`));
});
