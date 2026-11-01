import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/repo.mjs';
import { createProject, saveTag, setProjectTags } from '../scripts/lib/core.ts';
import { CompanionError, isSensitive, openCompanion, projectsForFolder } from '../desktop/companion.ts';
import { bindProject, createHandler } from '../ide/mcp/server.ts';

// Fixture: a framework root with two skills and the agents, and three projects:
// acme (linked to a repository folder), beta (shares a tag with acme), gamma (nothing shared).
const root = mkdtempSync(join(tmpdir(), 'qa-companion-'));
const repo = mkdtempSync(join(tmpdir(), 'qa-companion-repo-'));
const projects = join(root, 'workspace', 'projects');
const linkTo = (id: string, entries: Record<string, unknown>[]) => {
  const file = join(projects, id, 'project.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), repositories: entries }));
};

before(() => {
  for (const s of ['project-context', 'test-design', 'automation']) cpSync(join(ROOT, 'skills', s), join(root, 'skills', s), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  cpSync(join(ROOT, 'activities'), join(root, 'activities'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
  for (const [id, name] of [['acme', 'Acme'], ['beta', 'Beta'], ['gamma', 'Gamma']]) createProject(id, name, root);
  linkTo('acme', [{ name: 'app', localPath: repo, purpose: 'system', writeAllowed: true, linkedFolder: true }]);
  linkTo('gamma', [{ name: 'docs', localPath: join(repo, 'docs'), purpose: 'docs', writeAllowed: false }]);
  writeFileSync(join(projects, 'acme', 'context', 'business-rules.md'), '# Business rules\n\nRenewal needs an active contract.\n');
  mkdirSync(join(projects, 'acme', 'notes'), { recursive: true });
  writeFileSync(join(projects, 'acme', 'notes', 'meeting.md'), '# Meeting\n\nPlaywright for the renewal flow.\n');
  writeFileSync(join(projects, 'acme', 'context', '.env'), 'TOKEN=secret');
  writeFileSync(join(projects, 'beta', 'context', 'glossary.md'), '# Glossary\n\nContract: the signed agreement.\n');
  writeFileSync(join(projects, 'gamma', 'context', 'private.md'), '# Gamma private\n');
  saveTag({ name: 'Billing' }, root);
  setProjectTags('acme', ['billing'], root);
  setProjectTags('beta', ['billing'], root);
});

after(() => { rmSync(root, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }); });

const label = (id: string, path: string) => `workspace/projects/${id}/${path}`;

test('the open folder finds its project: linked folder first, subfolders too', () => {
  assert.deepEqual(projectsForFolder(root, repo), ['acme']);
  assert.deepEqual(projectsForFolder(root, join(repo, 'src', 'pages')), ['acme']);
  mkdirSync(join(repo, 'docs'), { recursive: true });
  assert.deepEqual(projectsForFolder(root, join(repo, 'docs')), ['acme', 'gamma']);
  assert.deepEqual(projectsForFolder(root, tmpdir()), []);
  if (process.platform === 'win32') assert.deepEqual(projectsForFolder(root, repo.toUpperCase()), ['acme']);
});

test('resources: own context and notes, shared context waits for the person, no secrets', () => {
  const c = openCompanion(root, 'acme');
  const ids = c.resources().map((r) => r.id);
  assert.ok(ids.includes(label('acme', 'context/business-rules.md')));
  assert.ok(ids.includes(label('acme', 'notes/meeting.md')));
  assert.ok(ids.includes('agent:test-designer'));
  assert.ok(ids.includes('skill:test-design'));
  assert.ok(!ids.includes('skill:automation'), 'skills that are not usable are left out');
  assert.ok(!ids.some((id) => id.endsWith('.env')), 'secret files are never listed');
  assert.ok(!ids.some((id) => id.includes('/gamma/')), 'another project without a shared tag stays out');
  const shared = c.resources().find((r) => r.id === label('beta', 'context/glossary.md'));
  assert.equal(shared?.kind, 'shared');
  assert.equal(shared?.mode, 'ask');
  assert.throws(() => c.getResource(shared!.id), /select this resource/);
  c.select(shared!.id, true);
  assert.match(c.getResource(shared!.id).text, /signed agreement/);
  c.select(shared!.id, false);
});

test('isolation: ids of other projects or paths outside are refused', () => {
  const c = openCompanion(root, 'acme');
  for (const id of [label('gamma', 'context/private.md'), label('acme', '../gamma/context/private.md'), label('acme', 'context/.env'), 'agent:nobody', '/etc/passwd']) {
    assert.throws(() => c.getResource(id), CompanionError, id);
  }
  assert.throws(() => openCompanion(root, '../acme'), /Unknown project/);
  assert.ok(isSensitive('C:/x/.env.local') && isSensitive('id_rsa') && isSensitive('server.pem') && !isSensitive('env.md'));
});

test('manual resources are hidden until selected; modes are saved in companion.json', () => {
  const c = openCompanion(root, 'acme');
  const id = label('acme', 'notes/meeting.md');
  c.setMode(id, 'manual');
  assert.ok(!c.resources().some((r) => r.id === id));
  assert.throws(() => c.getResource(id), CompanionError);
  assert.equal(c.search('playwright').length, 0);
  c.select(id, true);
  assert.equal(c.search('playwright')[0].id, id);
  const saved = JSON.parse(readFileSync(join(projects, 'acme', 'companion.json'), 'utf8'));
  assert.deepEqual(saved, { selected: [id], modes: { [id]: 'manual' } });
  c.setMode(id, 'auto'); // the default again: nothing stored
  c.clearSelection();
  assert.deepEqual(JSON.parse(readFileSync(join(projects, 'acme', 'companion.json'), 'utf8')), { selected: [], modes: {} });
  assert.throws(() => c.setMode(id, 'always'), /Unknown mode/);
});

test('context pack: selected text first within the budget, then related references', () => {
  const c = openCompanion(root, 'acme');
  const rules = label('acme', 'context/business-rules.md');
  c.select(rules, true);
  const pack = c.contextPack('Design test cases for the renewal rules', 1000);
  assert.equal(pack.selected[0].resource.id, rules);
  assert.match(pack.selected[0].text, /active contract/);
  assert.ok(pack.used <= pack.budget);
  assert.ok(pack.related.every((r) => !('text' in r)), 'related resources are references only');
  assert.ok(!pack.related.some((r) => r.id === rules), 'no duplicate of a selected resource');
  assert.ok(pack.related.some((r) => r.id === 'skill:test-design'));
  c.clearSelection();
});

test('MCP: initialize, tools/list, tools/call, and every call is logged', () => {
  const handle = createHandler(openCompanion(root, 'acme'), '');
  const init = handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }) as { result: { protocolVersion: string; capabilities: object } };
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
  assert.deepEqual(list.result.tools.map((t) => t.name), ['moki_get_project', 'moki_list_resources', 'moki_search_knowledge', 'moki_get_resource', 'moki_get_context', 'moki_get_agent']);
  assert.ok(list.result.tools.every((t) => t.annotations.readOnlyHint));
  const call = (name: string, args: object) => (handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }) as { result: { content: { text: string }[]; isError: boolean } }).result;
  assert.equal(JSON.parse(call('moki_get_project', {}).content[0].text).id, 'acme');
  assert.match(call('moki_search_knowledge', { query: 'renewal' }).content[0].text, /business-rules\.md/);
  assert.match(JSON.parse(call('moki_get_agent', { name: 'test-designer' }).content[0].text).text, /test/i);
  const refused = call('moki_get_resource', { id: label('gamma', 'context/private.md') });
  assert.ok(refused.isError);
  assert.ok(!refused.content[0].text.includes('Gamma private'));
  assert.equal((handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'moki_write', arguments: {} } }) as { error: { code: number } }).error.code, -32602);
  const log = readFileSync(join(projects, 'acme', 'logs', 'companion.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(log.some((e) => e.tool === 'moki_get_resource' && e.error));
});

test('MCP: the session is bound to one project, or explains why not', () => {
  assert.deepEqual(bindProject(root, {}, repo), { project: 'acme', reason: '' });
  assert.equal(bindProject(root, { project: 'beta' }, repo).project, 'beta');
  assert.match(bindProject(root, { project: 'nope' }, repo).reason, /no project "nope"/);
  assert.match(bindProject(root, { folder: join(repo, 'docs') }, repo).reason, /more than one/);
  assert.match(bindProject(root, {}, tmpdir()).reason, /not linked/);
  const unbound = createHandler(null, 'not linked');
  const r = unbound({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'moki_get_project', arguments: {} } }) as { result: { isError: boolean; content: { text: string }[] } };
  assert.ok(r.result.isError);
  assert.equal(r.result.content[0].text, 'not linked');
});

test('MCP server over stdio', () => {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'moki_list_resources', arguments: { kind: 'context' } } },
  ].map((m) => JSON.stringify(m)).join('\n');
  const out = spawnSync(process.execPath, [join(ROOT, 'ide', 'mcp', 'server.ts'), '--folder', repo], { input: `${input}\nnot json\n`, encoding: 'utf8', env: { ...process.env, QA_ROOT: root, QA_WORKSPACE: '' }, timeout: 20000 });
  assert.equal(out.status, 0, out.stderr);
  const replies = out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(replies.length, 3);
  assert.equal(replies[0].result.serverInfo.name, 'moki');
  assert.match(replies[1].result.content[0].text, /business-rules\.md/);
  assert.equal(replies[2].error.code, -32700);
  assert.ok(existsSync(join(projects, 'acme', 'logs', 'companion.log')));
});
