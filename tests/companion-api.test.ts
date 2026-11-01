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
const launched: { tool: ToolKey; prompt: string; extra: string[]; terminal: string }[] = [];
// The terminals the fake launcher opened: alive until killed or closed, with what was typed into them.
const terms = new Map<string, { alive: boolean; typed: string[] }>();
const shown: string[] = [];
const copied: string[] = [];
let companion: Companion | null = null;
let confirmAnswer = true;
let api: ReturnType<typeof createCompanionApi>;
let serviceRef: ReturnType<typeof createService>;
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
  saveServer({ name: 'Playwright', command: 'npx', args: ['@playwright/mcp@latest'] }, root);
  execFileSync('git', ['init', '-q'], { cwd: folder });
  writeFileSync(join(folder, '.mcp.json'), JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }));

  const service = createService(root, {
    launch: (tool, prompt, _root, _plugins, extra = []) => {
      const terminal = `vs-${launched.length + 1}`;
      launched.push({ tool, prompt, extra, terminal });
      terms.set(terminal, { alive: true, typed: [] });
      return { opened: true, message: 'fake', terminal: { id: terminal, title: tool } };
    },
    openFolder: () => {}, openPath: () => {},
    detectTools: () => ({ claude: true, codex: true, 'cursor-agent': false, gemini: false, antigravity: false }) as never,
    terminalAlive: (id) => terms.get(id)?.alive === true,
    writeTerminal: (id, data) => { terms.get(id)?.typed.push(data); },
    killTerminal: (id) => { const t = terms.get(id); if (t) t.alive = false; },
  });
  serviceRef = service;
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
    language: () => 'Portuguese (pt-BR)',
    showTerminal: (id) => { shown.push(id); return terms.get(id)?.alive === true; },
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

test('connect Cursor and Codex from the same menu: each in its own file of the folder', async () => {
  confirmAnswer = true;
  const cursor = await call('connectTool', 'cursor') as { changed: boolean; file: string };
  assert.ok(cursor.changed && cursor.file.endsWith(join('.cursor', 'mcp.json')));
  assert.ok(JSON.parse(readFileSync(cursor.file, 'utf8')).mcpServers.moki);
  const codex = await call('connectTool', 'codex') as { changed: boolean; file: string };
  assert.ok(codex.changed && codex.file.endsWith(join('.codex', 'config.toml')));
  assert.match(readFileSync(codex.file, 'utf8'), /^\[mcp_servers\."moki"\]$/m);
  assert.match(readFileSync(join(folder, '.git', 'info', 'exclude'), 'utf8'), /^\.codex\/$/m);
  await assert.rejects(call('connectTool', 'gemini'), /Unknown AI tool/);
});

test('without a project the panel asks for one', async () => {
  const saved = companion;
  companion = null;
  await assert.rejects(call('agents'), /Choose the Moki project/);
  assert.equal((await call('state') as { project: null }).project, null);
  companion = saved;
});

test('operations from the panel: started, each step in its own terminal, moved on by the loop', async () => {
  const svc = serviceRef;
  const op = svc.saveOperation({
    name: 'Fluxo QA', description: '', lanes: [],
    steps: [{ id: 's1', agent: 'library:requirements-analyst', x: 20, y: 60 }, { id: 's2', agent: 'library:test-designer', x: 320, y: 60 }],
    links: [{ from: 's1', to: 's2', gate: 'approval', map: {} }],
  });
  svc.setProjectOperations('acme', [op.id]);
  svc.setProjectOperations('beta', [op.id]);
  assert.deepEqual((await call('operations') as { id: string }[]).map((o) => o.id), [op.id]);
  const tools = await call('aiTools') as { id: string; available: boolean }[];
  assert.ok(tools.every((t) => ['claude', 'codex', 'cursor-agent', 'gemini', 'antigravity'].includes(t.id)));
  assert.equal(tools.find((t) => t.id === 'claude')?.available, true);
  const plan = await call('operationPlan', op.id) as { steps: { id: string }[] };
  assert.deepEqual(plan.steps.map((s) => s.id), ['s1', 's2']);

  // Starting runs the loop: the first step opens in a terminal whose id the run keeps.
  launched.length = 0;
  const run = await call('startOperation', op.id, { tools: { s1: 'claude', s2: 'codex' }, context: 'Login', answers: [] }) as { id: string };
  assert.equal(launched.length, 1);
  // On Windows the request goes to a UTF-8 file (accents); either way it names the step's agent.
  const file = launched[0].prompt.match(/workspace\/projects\/acme\/temporary\/[^ ]+\.md/)?.[0];
  assert.match(file ? readFileSync(join(root, file), 'utf8') : launched[0].prompt, /requirements-analyst/);
  let state = await call('operationRun', run.id) as { status: string; visits: { slot: string; status: string; terminal?: string; live?: boolean }[] };
  assert.deepEqual(state.visits.map((v) => [v.slot, v.status, v.terminal]), [['s1', 'running', 'vs-1']]);
  assert.equal(await call('showTerminal', run.id), true);
  assert.deepEqual(shown, ['vs-1']);

  // A question: answered in the live terminal.
  const dir = join(projects, 'acme', 'runs', run.id);
  writeFileSync(join(dir, 'waiting', 's1.md'), 'Qual ambiente?');
  api.drive();
  state = await call('operationRun', run.id);
  assert.equal(state.status, 'awaiting-input');
  assert.deepEqual(await call('answerOperationStep', run.id, 'Homologação'), { sent: 'terminal' });
  assert.deepEqual(terms.get('vs-1')?.typed, ['Homologação\r']);
  rmSync(join(dir, 'waiting', 's1.md'));

  // Done (its handoff and outputs): the next step waits for approval, approving starts it.
  mkdirSync(join(dir, 'outputs', 's1'), { recursive: true });
  for (const f of ['review-matrix.json', 'Matriz.xlsx', 'Relatório.pdf']) writeFileSync(join(dir, 'outputs', 's1', f), 'x');
  writeFileSync(join(dir, 'handoff', 's1.md'), 'Revisei.');
  api.drive();
  state = await call('operationRun', run.id);
  assert.deepEqual(state.visits.map((v) => [v.slot, v.status]), [['s1', 'done'], ['s2', 'awaiting-approval']]);
  assert.equal(launched.length, 1, 'nothing starts before the approval');
  await call('approveOperationStep', run.id);
  assert.equal(launched.length, 2, 'approved: the loop starts it at once');
  assert.equal(launched[1].tool, 'codex');

  // Its terminal closes before the summary: failed; retrying (with another AI) starts it again.
  svc.operationStepExited('acme', 'vs-2');
  state = await call('operationRun', run.id);
  assert.equal(state.visits.at(-1)?.status, 'failed');
  await call('retryOperationStep', run.id, 'claude');
  assert.equal(launched.length, 3);
  assert.equal(launched[2].tool, 'claude');

  // Cancelling closes the running step's terminal.
  await call('cancelOperation', run.id);
  assert.equal(terms.get('vs-3')?.alive, false);
  assert.equal((await call('operationRun', run.id) as { status: string }).status, 'cancelled');

  // The page never chooses the project: a run of another project is not found from here.
  companion = openCompanion(root, 'beta');
  await assert.rejects(call('operationRun', run.id), /Unknown operation run/);
  companion = openCompanion(root, 'acme');
});
