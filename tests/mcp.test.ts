import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/repo.mjs';
import { createProject, TOOLS } from '../scripts/lib/core.ts';
import {
  appliesTo, clean, enabledServers, generatedEntries, importConfig, listServers, mergeManaged, mokiServer, removeServer,
  mergeCodex, resolveServer, saveServer, serversForAgent, syncCursorFolder, syncToolFolder, toolConfig, type McpServer,
} from '../scripts/lib/mcp.ts';
import { createOperationRun } from '../scripts/lib/operation-runs.ts';
import { probeServer } from '../desktop/mcp-probe.ts';
import { createService } from '../desktop/service.ts';
import { openCompanion } from '../desktop/companion.ts';
import type { ToolKey } from '../scripts/lib/core.ts';

// Fixture: a framework root with the project template and two projects; acme is linked to a folder.
const root = mkdtempSync(join(tmpdir(), 'qa-mcp-'));
const linked = mkdtempSync(join(tmpdir(), 'qa-mcp-linked-'));
const projects = join(root, 'workspace', 'projects');
const launched: { tool: ToolKey; extra: string[] }[] = [];
let service: ReturnType<typeof createService>;
const setRepo = (id: string, entry: Record<string, unknown>) => {
  const file = join(projects, id, 'project.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), repositories: [entry] }));
};

before(() => {
  for (const s of ['project-context', 'test-design']) cpSync(join(ROOT, 'skills', s), join(root, 'skills', s), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
  createProject('acme', 'Acme', root);
  createProject('beta', 'Beta', root);
  setRepo('acme', { name: 'app', localPath: linked, purpose: 'system', writeAllowed: true, linkedFolder: true });
  service = createService(root, {
    launch: (tool, _prompt, _root, _plugins, extra = []) => { launched.push({ tool, extra }); return { opened: true, message: 'fake' }; },
    openFolder: () => {}, openPath: () => {},
    detectTools: () => Object.fromEntries(['claude', 'codex', 'cursor-agent', 'gemini', 'antigravity', 'cursor', 'vscode', 'chat', 'print'].map((k) => [k, true])) as Record<ToolKey, boolean>,
    probe: async (s) => ({ at: '2026-10-30T00:00:00Z', ok: true, tools: [{ name: `${s.id}_tool`, description: '' }], ms: 1 }),
  });
});

after(() => { rmSync(root, { recursive: true, force: true }); rmSync(linked, { recursive: true, force: true }); });

const playwright = { name: 'Playwright MCP', command: 'npx', args: ['@playwright/mcp@latest'] };
// Fake credentials, put together at run time so the repository holds nothing that looks like one.
const FAKE_GITHUB = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789AB'].join('_');
const FAKE_ANTHROPIC = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz'].join('-');
const FAKE_URL = ['https://user', 'secretpass@example.com'].join(':');

test('one catalog: ids are stable and unique, names may repeat', () => {
  const w = saveServer(playwright, root);
  assert.equal(w.id, 'playwright-mcp');
  const renamed = saveServer({ ...w, name: 'Playwright' }, root);
  assert.equal(renamed.id, 'playwright-mcp', 'a rename keeps the id');
  const twin = saveServer({ ...playwright, name: 'Playwright MCP' }, root);
  assert.equal(twin.id, 'playwright-mcp-2', 'the same name never overrides another server');
  removeServer(twin.id, root);
  assert.throws(() => removeServer('ghost', root), /Unknown MCP server/);
  assert.deepEqual(listServers(root).map((s) => s.id), ['playwright-mcp']);
});

test('credentials are never stored: ${VARIABLE} only', () => {
  assert.throws(() => clean({ name: 'GitHub', transport: 'http', url: 'https://api.example.com/mcp', headers: { Authorization: `Bearer ${FAKE_GITHUB}` } }), /never stores credentials/);
  assert.throws(() => clean({ name: 'Jira', command: 'npx', env: { JIRA_API_TOKEN: 'plain-text-value' } }), /looks like a credential/);
  assert.throws(() => clean({ name: 'X', command: 'npx', args: ['--key', FAKE_ANTHROPIC] }), /argument 2/);
  assert.throws(() => clean({ name: 'X', transport: 'http', url: FAKE_URL }), /URL holds a credential/);
  const ok = clean({ name: 'Jira', command: 'npx', env: { JIRA_API_TOKEN: '${JIRA_TOKEN}', JIRA_URL: 'https://acme.atlassian.net' } });
  assert.equal(ok.env.JIRA_API_TOKEN, '${JIRA_TOKEN}');
  assert.ok(clean({ name: 'H', transport: 'http', url: 'https://x.dev/mcp', headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' } }));
  assert.throws(() => clean({ name: 'X', command: 'npx && rm -rf /' }), /not a shell line/);
  assert.throws(() => clean({ name: 'X', transport: 'http', url: 'ftp://x' }), /http/);
  assert.throws(() => clean({ name: '', command: 'x' }), /name/);
});

test('where a server applies: global, or only the projects chosen; off reaches no project', () => {
  const on = (p: string) => enabledServers(p, root).map((s) => s.id);
  assert.deepEqual([on('acme'), on('beta')], [['playwright-mcp'], ['playwright-mcp']], 'global: every project of the workspace');
  saveServer({ name: 'Azure DevOps', command: 'npx', args: ['azure-devops-mcp'], access: 'execute', projects: ['acme'] }, root);
  saveServer({ name: 'Local tools', command: 'node', args: ['tools.js'], projects: ['acme', 'gone'] }, root);
  assert.deepEqual(on('acme'), ['playwright-mcp', 'azure-devops', 'local-tools']);
  assert.deepEqual(on('beta'), ['playwright-mcp'], 'a project not chosen never gets it');
  assert.deepEqual(listServers(root).find((s) => s.id === 'local-tools')?.projects, ['acme'], 'projects that do not exist are left out');
  assert.throws(() => saveServer({ name: 'Nowhere', command: 'npx', projects: ['gone'] }, root), /at least one project/);
  const temp = saveServer({ name: 'Temp', command: 'npx', enabled: false }, root);
  assert.ok(!on('acme').includes(temp.id) && !on('beta').includes(temp.id), 'switched off: no project gets it');
  assert.ok(appliesTo(temp, 'beta'));
  removeServer(temp.id, root);
});

test('an agent gets only the servers its contract names and the project has on', () => {
  const r = serversForAgent('beta', [{ name: 'playwright-mcp' }, { name: 'azure-devops' }, { name: 'ghost' }], root);
  assert.deepEqual(r.servers.map((s) => s.id), ['playwright-mcp']);
  assert.deepEqual(r.missing, ['azure-devops', 'ghost']);
});

test('import: Claude/Cursor, VS Code and bare maps; credentials become variables', () => {
  const a = importConfig(JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['gh-mcp'], env: { GITHUB_TOKEN: FAKE_GITHUB } } } }));
  assert.deepEqual((a.servers[0] as McpServer).env, { GITHUB_TOKEN: '${GITHUB_GITHUB_TOKEN}' });
  assert.equal(a.replaced.length, 1);
  assert.ok(!JSON.stringify(a).includes(FAKE_GITHUB), 'the credential is not kept anywhere');
  const b = importConfig(JSON.stringify({ servers: { remote: { type: 'http', url: 'https://x.dev/mcp', headers: { Authorization: 'Bearer ${env:TOKEN}' } } } }));
  assert.deepEqual([(b.servers[0] as McpServer).transport, (b.servers[0] as McpServer).headers.Authorization], ['http', 'Bearer ${TOKEN}']);
  assert.equal(importConfig(JSON.stringify({ fs: { command: 'npx' } })).servers.length, 1);
  assert.throws(() => importConfig('nope'), /valid JSON/);
  assert.throws(() => importConfig('{"mcpServers": {}}'), /No MCP servers/);
});

test('configurations for Claude Code and Cursor; merging keeps the person\'s entries', () => {
  const s = clean({ id: 'jira', name: 'Jira', command: 'npx', args: ['jira-mcp'], env: { TOKEN: '${JIRA_TOKEN}' } });
  const h = clean({ id: 'gh', name: 'GH', transport: 'http', url: 'https://x.dev/${PATH_PART}', headers: { Authorization: 'Bearer ${GH}' } });
  const entries = [{ key: 'moki-jira', server: s }, { key: 'moki-gh', server: h }];
  assert.deepEqual(toolConfig(entries, 'claude').mcpServers['moki-jira'], { command: 'npx', args: ['jira-mcp'], env: { TOKEN: '${JIRA_TOKEN}' } });
  assert.deepEqual(toolConfig(entries, 'cursor').mcpServers['moki-gh'], { url: 'https://x.dev/${env:PATH_PART}', headers: { Authorization: 'Bearer ${env:GH}' } });
  assert.equal((toolConfig(entries, 'claude').mcpServers['moki-gh'] as { type: string }).type, 'http');
  const merged = mergeManaged({ other: 1, mcpServers: { mine: { command: 'x' }, 'moki-old': { command: 'y' }, moki: { command: 'z' } } }, entries, 'cursor');
  assert.deepEqual(Object.keys(merged.mcpServers as object).sort(), ['mine', 'moki-gh', 'moki-jira']);
  assert.equal(merged.other, 1);
});

test('variables are read only when a server starts; a missing one says which, never a value', () => {
  const s = clean({ id: 'jira', name: 'Jira', command: 'npx', env: { TOKEN: '${JIRA_TOKEN}', URL: 'https://${HOST}/x' } });
  assert.throws(() => resolveServer(s, { HOST: 'h' }), /JIRA_TOKEN/);
  const r = resolveServer(s, { JIRA_TOKEN: 'abc', HOST: 'acme.dev' });
  assert.deepEqual(r.env, { TOKEN: 'abc', URL: 'https://acme.dev/x' });
  assert.equal(s.env.TOKEN, '${JIRA_TOKEN}', 'the stored server keeps the reference');
});

test('Claude Code started by Moki gets --mcp-config with the project servers and Moki\'s own', () => {
  launched.length = 0;
  service.launch({ project: 'beta', activity: 'open', tool: 'claude', files: [], note: '', language: 'English' } as never);
  const extra = launched.at(-1)?.extra ?? [];
  assert.equal(extra[0], '--mcp-config');
  const config = JSON.parse(readFileSync(extra[1], 'utf8')) as { mcpServers: Record<string, { args?: string[]; env?: Record<string, string> }> };
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ['moki', 'moki-playwright-mcp']);
  assert.deepEqual(config.mcpServers.moki.args?.slice(-2), ['--project', 'beta']);
  assert.equal(config.mcpServers.moki.env?.QA_ROOT, root);
  // --mcp-config takes several files: without "--" Claude Code read the request as one more and quit at once.
  const args = [...extra, ...(TOOLS.claude.args?.('Revise a US-1') ?? [])];
  assert.deepEqual(args.slice(-2), ['--', 'Revise a US-1']);
});

test('Cursor started by Moki: the moki entries of <root>/.cursor/mcp.json, the person\'s kept', () => {
  mkdirSync(join(root, '.cursor'), { recursive: true });
  writeFileSync(join(root, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }));
  service.launch({ project: 'acme', activity: 'open', tool: 'cursor-agent', files: [], note: '', language: 'English' } as never);
  const keys = Object.keys((JSON.parse(readFileSync(join(root, '.cursor', 'mcp.json'), 'utf8')) as { mcpServers: object }).mcpServers).sort();
  assert.deepEqual(keys, ['mine', 'moki', 'moki-azure-devops', 'moki-local-tools', 'moki-playwright-mcp']);
});

test('sync with Cursor in the linked folder: asks first, honours writeAllowed, backs up', () => {
  mkdirSync(join(linked, '.cursor'), { recursive: true });
  writeFileSync(join(linked, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }));
  assert.throws(() => service.syncCursorMcp('acme', false), /Confirm/);
  assert.throws(() => service.syncCursorMcp('beta', true), /no linked folder/);
  const r = service.syncCursorMcp('acme', true);
  assert.ok(r.changed && r.backup && existsSync(join(r.backup, 'mcp.json')));
  const data = JSON.parse(readFileSync(join(linked, '.cursor', 'mcp.json'), 'utf8')) as { mcpServers: Record<string, unknown> };
  assert.ok(data.mcpServers.mine && data.mcpServers.moki && data.mcpServers['moki-azure-devops']);
  assert.equal(syncCursorFolder(linked, generatedEntries(mokiServer('acme', root, 'x', 'node'), [])).changed, true);
  setRepo('acme', { name: 'app', localPath: linked, purpose: 'system', writeAllowed: false, linkedFolder: true });
  assert.throws(() => service.syncCursorMcp('acme', true), /writeAllowed: false/);
  setRepo('acme', { name: 'app', localPath: linked, purpose: 'system', writeAllowed: true, linkedFolder: true });
});

test('Codex: Moki writes its own region of .codex/config.toml; the person\'s tables stay; a variable is never written as a value', () => {
  const server = (id: string, extra: Partial<McpServer>): McpServer => ({
    id, name: id, description: '', transport: 'stdio', command: 'npx', args: ['-y', 'x'], url: '', headers: {}, env: {}, access: 'read', enabled: true, projects: [], ...extra,
  });
  const entries = generatedEntries(server('moki', { command: 'node', args: ['C:\\moki\\server.ts', '--project', 'acme'], env: { QA_ROOT: 'C:\\moki' } }), [
    server('jira', { env: { JIRA_TOKEN: '${JIRA_TOKEN}', MODE: 'cloud', OTHER: 'x-${JIRA_TOKEN}' } }),
    server('github', { transport: 'http', url: 'https://api.example.com/mcp', headers: { Authorization: 'Bearer ${GH_TOKEN}', 'X-Team': '${TEAM}' } }),
  ]);
  const mine = '[mcp_servers.mine]\ncommand = "mine"\n';
  const first = mergeCodex(mine, entries);
  assert.ok(first.text.startsWith(mine));
  assert.match(first.text, /\[mcp_servers\."moki"\]\ncommand = "node"\nargs = \["C:\\\\moki\\\\server.ts", "--project", "acme"\]\nenv = \{ "QA_ROOT" = "C:\\\\moki" \}/);
  assert.match(first.text, /\[mcp_servers\."moki-jira"\]\ncommand = "npx"\nargs = \["-y", "x"\]\nenv = \{ "MODE" = "cloud" \}\nenv_vars = \["JIRA_TOKEN"\]/);
  assert.match(first.text, /\[mcp_servers\."moki-github"\]\nurl = "https:\/\/api.example.com\/mcp"\nbearer_token_env_var = "GH_TOKEN"/);
  assert.doesNotMatch(first.text, /\$\{/);
  assert.deepEqual(first.skipped, ['moki-jira: OTHER', 'moki-github: header X-Team']);
  // Written again: Moki's region is replaced, not repeated.
  const again = mergeCodex(first.text, entries.slice(0, 1));
  assert.equal(again.text.match(/>>> moki/g)?.length, 1);
  assert.ok(!again.text.includes('moki-jira') && again.text.startsWith(mine));

  const folder = mkdtempSync(join(tmpdir(), 'moki-codex-'));
  const r = syncToolFolder(folder, entries, 'codex');
  assert.ok(r.changed && r.file.endsWith(join('.codex', 'config.toml')));
  assert.equal(syncToolFolder(folder, entries, 'codex').changed, false);
  rmSync(folder, { recursive: true, force: true });
});

test('service: one catalog with where each server applies, test results kept without values', async () => {
  const c = service.mcpCatalog();
  assert.deepEqual(c.projects.map((p) => p.id), ['acme', 'beta']);
  assert.deepEqual(c.servers.find((s) => s.id === 'playwright-mcp')?.usedBy, ['acme', 'beta']);
  assert.deepEqual(c.servers.find((s) => s.id === 'azure-devops')?.usedBy, ['acme']);
  const r = await service.testMcpServer('playwright-mcp');
  assert.equal(r.tools[0].name, 'playwright-mcp_tool');
  assert.equal(service.mcpCatalog().servers.find((s) => s.id === 'playwright-mcp')?.status?.ok, true);
  assert.ok(readFileSync(join(root, 'workspace', 'logs', 'mcp.log'), 'utf8').includes('"action":"test"'));
  assert.ok(service.knownMcps('acme').includes('local-tools'));
  assert.ok(!service.knownMcps('beta').includes('local-tools'));
  const imported = service.importMcpServers(JSON.stringify({ mcpServers: { local: { command: 'node', args: ['tools.js'] } } }), ['beta']);
  assert.deepEqual(imported.saved.map((s) => [s.id, s.projects]), [['local', ['beta']]]);
  assert.ok(service.tree('beta').at(-1)?.children?.some((n) => n.mcp === 'Moki (this project)' && n.name === 'local'));
  assert.ok(service.tree('beta').at(-1)?.children?.some((n) => n.mcp === 'Moki (global)' && n.name === 'Playwright'));
  service.removeMcpServer('local');
  assert.ok(!service.mcpCatalog().servers.some((s) => s.id === 'local'));
});

test('an operation run keeps the servers it started with', () => {
  const dir = join(projects, 'acme');
  const servers = serversForAgent('acme', [{ name: 'playwright-mcp' }], root).servers;
  const op = { id: 'op', name: 'Op', steps: [{ id: 's1', agent: 'library:test-designer', x: 0, y: 0 }], links: [], lanes: [], maxRounds: 3 };
  const agent = { key: 'library:test-designer', name: 'test-designer', source: 'library', description: '', access: 'project-write', inputs: [], outputs: [], outcomes: [], mcps: [{ name: 'playwright-mcp', mode: 'read' }], ai: 'claude', file: 'agents/quality/test-designer.md', servers };
  const run = createOperationRun(dir, 'acme', op as never, [agent as never], ['s1'], { tools: { s1: 'claude' }, answers: [], context: '' });
  saveServer({ ...listServers(root).find((s) => s.id === 'playwright-mcp'), args: ['@playwright/mcp@2'] }, root);
  const saved = JSON.parse(readFileSync(join(dir, 'runs', run.id, 'state.json'), 'utf8')) as { steps: { servers: McpServer[] }[] };
  assert.deepEqual(saved.steps[0].servers[0].args, ['@playwright/mcp@latest'], 'the run still has the definition it started with');
});

test('the IDE Companion lists the servers that are on, without command or variables', () => {
  const s = openCompanion(root, 'acme').summary();
  assert.ok(s.mcpServers.some((m) => m.id === 'azure-devops' && m.access === 'execute'));
  assert.ok(!JSON.stringify(s.mcpServers).includes('npx'));
});

test('probe: a real stdio server (Moki\'s own) and an HTTP one', async () => {
  const stdio = clean({ id: 'moki', name: 'Moki', command: process.execPath, args: [join(ROOT, 'ide', 'mcp', 'server.ts'), '--project', 'acme'], env: { QA_ROOT: root } });
  const ok = await probeServer(stdio, { ...process.env, QA_WORKSPACE: '' });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.server, 'moki');
  assert.ok(ok.tools.some((t) => t.name === 'moki_get_context'));

  let session = '';
  const http = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const msg = JSON.parse(body) as { id?: number; method: string };
      if (req.headers.authorization !== 'Bearer s3cr3t-value') { res.writeHead(401).end(); return; }
      if (msg.method === 'initialize') { session = 'abc'; res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': session }).end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'fake' } } })}\n\n`); return; }
      if (msg.id === undefined) { res.writeHead(202).end(); return; }
      assert.equal(req.headers['mcp-session-id'], 'abc');
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'search', description: 'Find' }] } }));
    });
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const port = (http.address() as { port: number }).port;
  const h = clean({ id: 'fake', name: 'Fake', transport: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: 'Bearer ${FAKE_TOKEN}' } });
  const good = await probeServer(h, { FAKE_TOKEN: 's3cr3t-value' });
  assert.deepEqual([good.ok, good.server, good.tools.map((t) => t.name)], [true, 'fake', ['search']]);
  const bad = await probeServer(h, { FAKE_TOKEN: 'wrong-value' });
  assert.ok(!bad.ok && /credentials/.test(bad.error ?? '') && !(bad.error ?? '').includes('wrong-value'));
  const missing = await probeServer(h, {});
  assert.match(missing.error ?? '', /FAKE_TOKEN/);
  http.close();
  const gone = await probeServer(clean({ id: 'x', name: 'X', command: 'no-such-mcp-command-zz' }), process.env);
  assert.match(gone.error ?? '', /not found/);
  assert.ok(readdirSync(join(root, 'workspace')).includes('mcp-servers.json'));
});
