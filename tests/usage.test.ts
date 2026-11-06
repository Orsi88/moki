// Status bar numbers (desktop/usage.ts): plan windows from the providers' answers and
// the memory of a terminal's process tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appMemory, claudeWindows, codexWindows, memoryUsage, parseProcesses, parseSmapsRollup, treeBytes, treePids, windowLabel } from '../desktop/usage.ts';

test('Claude plan windows come from limits[], with the model of a scoped limit', () => {
  const windows = claudeWindows({
    five_hour: { utilization: 1 },
    limits: [
      { kind: 'session', group: 'session', percent: 30, resets_at: '2026-10-27T18:00:00.344048+00:00', scope: null },
      { kind: 'weekly_all', group: 'weekly', percent: 70, resets_at: '2026-10-27T16:00:00+00:00' },
      { kind: 'weekly_scoped', group: 'weekly', percent: 120, resets_at: null, scope: { model: { display_name: 'Fable' } } },
      { kind: 'weekly_x', group: 'weekly', percent: null },
    ],
  });
  assert.deepEqual(windows, [
    { label: '5h', percent: 30, resetsAt: Date.parse('2026-10-27T18:00:00.344Z') },
    { label: '7d', percent: 70, resetsAt: Date.parse('2026-10-27T16:00:00Z') },
    { label: '7d Fable', percent: 100, resetsAt: null },
  ]);
  // Older answers without limits[].
  assert.deepEqual(claudeWindows({ five_hour: { utilization: 2, resets_at: 1795025309 }, seven_day: null }).map((w) => [w.label, w.percent, w.resetsAt]), [['5h', 2, 1795025309000]]);
});

test('Codex plan windows are labeled by their length', () => {
  const windows = codexWindows({ rate_limit: { primary_window: { used_percent: 17, limit_window_seconds: 2592000, reset_at: 1795025309 }, secondary_window: null } });
  assert.deepEqual(windows, [{ label: '30d', percent: 17, resetsAt: 1795025309000 }]);
  assert.deepEqual([18000, 604800].map(windowLabel), ['5h', '7d']);
  assert.deepEqual(codexWindows({}), []);
});

test('a terminal counts the memory of everything it started, once', () => {
  const rows = parseProcesses(' 1     0  100\n 10     1  2048\n 11    10  1024\r\n 12    11  512\n 20     1  4096\nbad line\n');
  assert.equal(treeBytes(rows, 10), (2048 + 1024 + 512) * 1024);
  assert.equal(treeBytes(rows, 20), 4096 * 1024);
  assert.equal(treeBytes(rows, 99), 0); // already exited
});

test('a terminal tree can be measured with the PSS of each process', () => {
  const rows = parseProcesses(' 10 1 2048\n 11 10 1024\n 12 11 512\n');
  assert.deepEqual(treePids(rows, 10).sort(), [10, 11, 12]);
  // 11 was measured (PSS), the others keep the size ps listed.
  assert.equal(treeBytes(rows, 10, new Map([[11, 100]])), 2048 * 1024 + 100 + 512 * 1024);
});

test('PSS is read from smaps_rollup', () => {
  const text = '55d0c0000000-7ffd00000000 ---p 00000000 00:00 0 [rollup]\nRss:              270464 kB\nPss:              153600 kB\nPss_Anon:          90000 kB\n';
  assert.equal(parseSmapsRollup(text), 153600 * 1024);
  assert.equal(parseSmapsRollup(''), null);
});

test("Moki's memory is grouped by role, with the windows each renderer draws", () => {
  const metric = (pid: number, type: string, kb: number, privateBytes?: number) => ({ pid, type, memory: { workingSetSize: kb, ...(privateBytes === undefined ? {} : { privateBytes }) } });
  const app = appMemory(
    [metric(1, 'Browser', 1000), metric(2, 'GPU', 500), metric(3, 'Tab', 800), metric(4, 'Tab', 300), metric(5, 'Tab', 200), metric(6, 'Utility', 100), metric(7, 'Zygote', 50, 10)],
    new Map([[3, 'window'], [4, 'notes'], [5, 'notes']]),
    new Map([[1, 4096]]), // the main process measured (PSS)
  );
  assert.deepEqual(app.processes, [
    { kind: 'main', bytes: 4096, count: 1 },
    { kind: 'window', bytes: 800 * 1024, count: 1 },
    { kind: 'notes', bytes: 500 * 1024, count: 2 },
    { kind: 'gpu', bytes: 500 * 1024, count: 1 },
    { kind: 'other', bytes: (100 + 10) * 1024, count: 2 }, // private bytes (Windows) win over the working set
  ]);
  assert.equal(app.bytes, app.processes.reduce((n, p) => n + p.bytes, 0));
});

test('memory is listed per project and, inside it, per terminal, apart from Moki', async () => {
  const m = await memoryUsage([
    { id: 't1', pid: process.pid, project: 'acme' },
    { id: 't2', pid: 2 ** 22 + 12345, project: 'acme' }, // exited: no memory
    { id: 't3', pid: process.pid, project: 'beta' },
  ], [{ pid: 2 ** 22 + 54321, type: 'Browser', memory: { workingSetSize: 1 } }]);
  assert.ok(m.total > 0 && m.used > 0);
  assert.ok(['pss', 'private', 'rss'].includes(m.metric));
  assert.deepEqual(m.app, { bytes: 1024, processes: [{ kind: 'main', bytes: 1024, count: 1 }] }); // the terminals are not part of Moki
  const acme = m.projects.find((p) => p.project === 'acme');
  assert.deepEqual(acme?.sessions.map((s) => s.id), ['t1', 't2']);
  assert.ok((acme?.sessions[0].bytes ?? 0) > 0);
  assert.equal(acme?.bytes, acme?.sessions[0].bytes);
  assert.deepEqual(m.projects.map((p) => p.project).sort(), ['acme', 'beta']);
  assert.equal(m.tools, m.projects.reduce((n, p) => n + p.bytes, 0));
});
