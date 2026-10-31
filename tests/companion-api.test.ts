import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/repo.mjs';
import { createProject, type ToolKey } from '../scripts/lib/core.ts';
import { mokiServer, saveServer } from '../scripts/lib/mcp.ts';
import { createService } from '../desktop/service.ts';
import { openCompanion, type Companion } from '../desktop/companion.ts';
import { createCompanionApi } from '../desktop/companion-api.ts';

// Fixture: two projects, the IDE connected to acme, an open folder with its own .mcp.json.
const root = mkdtempSync(join(tmpdir(), 'qa-companion-api-'));
const folder = mkdtempSync(join(tmpdir(), 'qa-companion-folder-'));
const projects = join(root, 'workspace', 'projects');
const launched: { tool: ToolKey; prompt: string; extra: string[] }[] = [];
const copied: string[] = [];
let companion: Companion | null = null;
let confirmAnswer = true;
let api: ReturnType<typeof createCompanionApi>;
const call = async (method: string, ...args: unknown[]) => {
  const r = await api(method, args);
  if (!r.ok) throw new Error(r.error);
  return r.value as never;
};

before(() => {
  for (const s of ['project-context', 'test-design', 'failure-analysis']) cpSync(join(ROOT, 'skills', s), join(root, 'skills', s), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
  createProject('acme', 'Acme', root);
  createProject('beta', 'Beta', root);
  writeFileSync(join(projects, 'acme', 'context', 'rules.md'), '# Rules\n');
  writeFileSync(join(projects, 'acme', 'context', 'old.md'), '# Old\n');
  writeFileSync(join(projects, 'acme', 'inbox', 'us-1.md'), '# US-1');
  const file = join(projects, 'acme', 'project.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), agents: ['test-designer'] }));
  saveServer('workspace', null, { name: 'Playwright', command: 'npx', args: ['@playwright/mcp@latest'] }, root);
  execFileSync('git', ['init', '-q'], { cwd: folder });
  writeFileSync(join(folder, '.mcp.json'), JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }));

  const service = createService(root, {
    launch: (tool, prompt, _root, _plugins, extra = []) => { launched.push({ tool, prompt, extra }); return { opened: true, message: 'fake' }; },
    openFolder: () => {}, openPath: () => {},
  });
  companion = openCompanion(root, 'acme');
  api = createCompanionApi(root, service, {
    companion: () => companion,
    choose: (id) => { companion = openCompanion(root, id); },
    copy: (text) => { copied.push(text); },
    focusChat: async () => 'Claude Code',
    confirm: async () => confirmAnswer,
    folder: () => folder,
    tracked: () => false,
    mokiServer: (project) => mokiServer(project, root, 'mcp.cjs', 'node'),
  });
});

after(() => { rmSync(root, { recursive: true, force: true }); rmSync(folder, { recursive: true, force: true }); });

test('only the calls of the panel exist; the service as a whole is never reachable', async () => {
  for (const name of ['writeFile', 'deleteProject', 'saveAgent', 'removeMcpServer', 'toString', '__proto__', 42]) {
    const r = await api(name, []);
    assert.deepEqual(r, { ok: false, error: 'Unknown action.' }, String(name));
  }
});

test('state: the connected project, the list to switch, the MCP servers that are on', async () => {
  const s = await call('state') as { project: { id: string }; projects: { id: string }[]; mcp: { id: string }[] };
  assert.equal(s.project.id, 'acme');
  assert.deepEqual(s.projects.map((p) => p.id), ['acme', 'beta']);
  assert.deepEqual(s.mcp.map((m) => m.id), ['playwright']);
  await assert.rejects(call('chooseProject', '../beta'), /Unknown project/);
});

test('agents: only the ones the project uses', async () => {
  const agents = await call('agents') as { name: string }[];
  assert.deepEqual(agents.map((a) => a.name), ['test-designer']);
});

test('context: switching a file off leaves it out of requests and of what the AI reads', async () => {
  const files = await call('context') as { id: string; included: boolean }[];
  const old = files.find((f) => f.id.endsWith('context/old.md'))!;
  assert.ok(old.included);
  const after = await call('setIncluded', old.id, false) as { id: string; included: boolean; priority: boolean }[];
  assert.equal(after.find((f) => f.id === old.id)?.included, false);
  assert.ok(!companion!.resources().some((r) => r.id === old.id), 'hidden from the MCP server too');
  await assert.rejects(call('setIncluded', 'workspace/projects/beta/context/index.md', true), /not in the project's context/);
  const rules = files.find((f) => f.id.endsWith('context/rules.md'))!;
  const starred = await call('setPriority', rules.id, true) as { id: string; priority: boolean }[];
  assert.ok(starred.find((f) => f.id === rules.id)?.priority);
});

test('launch: Claude Code with the request, the exclusions and --mcp-config, for the active project only', async () => {
  launched.length = 0;
  await call('launch', { activity: 'tests', files: ['us-1.md'], note: 'focus on upload', language: 'English', project: 'beta' });
  const l = launched.at(-1)!;
  assert.equal(l.tool, 'claude');
  assert.equal(l.extra[0], '--mcp-config');
  assert.match(l.prompt, /acme/);
  assert.ok(!/projects\/beta/.test(l.prompt), 'a project sent by the page is ignored');
  assert.match(l.prompt, /Do not use these files of this project in this activity: workspace\/projects\/acme\/context\/old\.md/, 'the file switched off is left out');
  await assert.rejects(call('launch', { activity: 'tests', files: [] }), /at least one file/);
  await assert.rejects(call('launch', { activity: 'tests', files: ['../secret.md'] }), /Not in the project inbox/);
});

test('copy for the chat: the same request copied, nothing started', async () => {
  launched.length = 0;
  const r = await call('copyRequest', { activity: 'open', agent: 'test-designer', language: 'English' }) as { prompt: string; chat: string };
  assert.equal(launched.length, 0);
  assert.equal(copied.at(-1), r.prompt);
  assert.equal(r.chat, 'Claude Code');
  assert.match(r.prompt, /test-designer/);
});

test('connect Claude Code: asks first, writes only Moki\'s entries, backs up and hides from Git', async () => {
  confirmAnswer = false;
  const no = await call('connectClaude') as { cancelled: boolean };
  assert.ok(no.cancelled);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(folder, '.mcp.json'), 'utf8')).mcpServers), ['mine']);
  confirmAnswer = true;
  const yes = await call('connectClaude') as { changed: boolean; backup?: string };
  assert.ok(yes.changed && yes.backup && existsSync(join(yes.backup, 'mcp.json')));
  const servers = JSON.parse(readFileSync(join(folder, '.mcp.json'), 'utf8')).mcpServers as Record<string, { args?: string[] }>;
  assert.deepEqual(Object.keys(servers).sort(), ['mine', 'moki', 'moki-playwright']);
  assert.deepEqual(servers.moki.args, ['mcp.cjs', '--project', 'acme']);
  assert.match(readFileSync(join(folder, '.git', 'info', 'exclude'), 'utf8'), /\.moki-backup\//);
  // A folder without .mcp.json gets one, kept out of the person's commits.
  rmSync(join(folder, '.mcp.json'));
  mkdirSync(join(folder, '.git', 'info'), { recursive: true });
  await call('connectClaude');
  assert.match(readFileSync(join(folder, '.git', 'info', 'exclude'), 'utf8'), /^\.mcp\.json$/m);
});

test('without a project the panel asks for one', async () => {
  const saved = companion;
  companion = null;
  await assert.rejects(call('agents'), /Choose the Moki project/);
  assert.equal((await call('state') as { project: null }).project, null);
  companion = saved;
});
