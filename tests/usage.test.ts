// Status bar numbers (desktop/usage.ts): plan windows from the providers' answers and
// the memory of a terminal's process tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claudeWindows, codexWindows, memoryUsage, parseProcesses, treeBytes, treePids, ttlCache, windowLabel } from '../desktop/usage.ts';
import { memoryKbByPid, parsePssKb } from '../desktop/proc-memory.ts';

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

test('memory is listed per project and, inside it, per terminal', async () => {
  const m = await memoryUsage([
    { id: 't1', pid: process.pid, project: 'acme' },
    { id: 't2', pid: 2 ** 22 + 12345, project: 'acme' }, // exited: no memory
    { id: 't3', pid: process.pid, project: 'beta' },
  ], 1);
  assert.ok(m.total > 0 && m.used > 0 && m.app === 1);
  const acme = m.projects.find((p) => p.project === 'acme');
  assert.deepEqual(acme?.sessions.map((s) => s.id), ['t1', 't2']);
  assert.ok((acme?.sessions[0].bytes ?? 0) > 0);
  assert.equal(acme?.bytes, acme?.sessions[0].bytes);
  assert.deepEqual(m.projects.map((p) => p.project).sort(), ['acme', 'beta']);
});

test('the process list is read once per ttl, not at every poll', async () => {
  let clock = 0, calls = 0;
  const get = ttlCache(async () => ++calls, 2500, () => clock);
  assert.deepEqual([await get(), await get()], [1, 1]);
  clock = 2499;
  assert.equal(await get(), 1);
  clock = 2500;
  assert.equal(await get(), 2);
});

// A real smaps_rollup (kernel 6.x): the Pss line sits among Rss and the shared/private breakdown.
const SMAPS = `55d1c0a00000-7ffd5c3ff000 ---p 00000000 00:00 0                          [rollup]
Rss:               52844 kB
Pss:               31216 kB
Pss_Dirty:         14952 kB
Pss_Anon:          13808 kB
Pss_File:          17090 kB
Pss_Shmem:           318 kB
Shared_Clean:      32420 kB
Shared_Dirty:       2568 kB
Private_Clean:     12452 kB
Private_Dirty:      5404 kB
Referenced:        52844 kB
Anonymous:         13808 kB
`;

test('PSS is read from the Pss line of smaps_rollup, not from Rss or Pss_Anon', () => {
  assert.equal(parsePssKb(SMAPS), 31216);
  assert.equal(parsePssKb('Rss: 10 kB\nPss_Anon: 5 kB\n'), null);
  assert.equal(parsePssKb(''), null);
});

test('PSS of several pids is read in parallel; a pid that cannot be read keeps its RSS', async () => {
  const denied = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  const read = async (pid: number) => {
    if (pid === 1) return SMAPS;
    if (pid === 2) return 'Rss: 9 kB\n'; // no Pss line (old kernel)
    throw denied; // 3: other user, 4: exited, 5: no smaps_rollup
  };
  const kb = await memoryKbByPid([1, 2, 3, 4, 5].map((pid) => ({ pid, kb: pid * 100 })), read);
  assert.deepEqual([...kb], [[1, 31216], [2, 200], [3, 300], [4, 400], [5, 500]]);
  assert.deepEqual([...(await memoryKbByPid([], read))], []);
});

test('the PSS reader is asynchronous: it waits for a reader that has not answered yet', async () => {
  const answers: ((text: string) => void)[] = [];
  const pending = memoryKbByPid([{ pid: 1, kb: 1 }, { pid: 2, kb: 2 }], () => new Promise<string>((resolve) => { answers.push(resolve); }));
  assert.equal(await Promise.race([pending, Promise.resolve('not yet')]), 'not yet');
  assert.equal(answers.length, 2); // both reads started before either answered
  for (const answer of answers) answer(SMAPS);
  assert.deepEqual([...(await pending)], [[1, 31216], [2, 31216]]);
});

test('on Linux the bar measures PSS for Moki and for the terminals, and keeps the RSS next to it', async () => {
  const ps = async () => ' 10 1 2048\n 11 10 1024\n 20 1 4096\n';
  const pss: Record<number, number> = { 100: 700, 101: 300, 10: 500, 11: 200, 20: 1500 }; // pid 20 has no file: its RSS is used
  const readSmaps = async (pid: number) => { if (!(pid in pss) || pid === 20) throw new Error('ENOENT'); return `Rss: 1 kB\nPss: ${pss[pid]} kB\n`; };
  const m = await memoryUsage([
    { id: 't1', pid: 10, project: 'acme' },
    { id: 't2', pid: 20, project: 'beta' },
  ], [{ pid: 100, kb: 1000 }, { pid: 101, kb: 500 }], { platform: 'linux', readSmaps, ps });
  assert.equal(m.kind, 'pss');
  assert.equal(m.app, (700 + 300) * 1024);
  assert.equal(m.appRss, 1500 * 1024);
  const acme = m.projects.find((p) => p.project === 'acme');
  assert.equal(acme?.bytes, (500 + 200) * 1024);
  assert.equal(acme?.rssBytes, (2048 + 1024) * 1024);
  assert.deepEqual(acme?.sessions, [{ id: 't1', bytes: (500 + 200) * 1024, rssBytes: (2048 + 1024) * 1024 }]);
  assert.equal(m.projects.find((p) => p.project === 'beta')?.bytes, 4096 * 1024); // fallback to RSS for that pid
  assert.deepEqual(m.projects.map((p) => p.project), ['beta', 'acme']); // sorted by the bar's figure
});

test('on macOS and Windows the numbers stay RSS from the same sources, and no smaps_rollup is read', async () => {
  const ps = async () => ' 10 1 2048\n 11 10 1024\n';
  const readSmaps = async (): Promise<string> => { throw new Error('must not be called'); };
  for (const platform of ['darwin', 'win32'] as const) {
    const m = await memoryUsage([{ id: 't1', pid: 10, project: 'acme' }], [{ pid: 100, kb: 1000 }, { pid: 101, kb: 500 }], { platform, readSmaps, ps });
    assert.equal(m.kind, 'rss');
    assert.equal(m.app, 1500 * 1024);
    assert.equal(m.appRss, m.app);
    assert.equal(m.projects[0].bytes, 3072 * 1024);
    assert.equal(m.projects[0].rssBytes, m.projects[0].bytes);
    assert.equal(m.projects[0].sessions[0].bytes, 3072 * 1024);
  }
});

test('a plain number of bytes for Moki is still accepted', async () => {
  const m = await memoryUsage([], 123, { platform: 'darwin' });
  assert.deepEqual([m.app, m.appRss, m.projects], [123, 123, []]);
});

test('the tree of a terminal lists its processes once, only the ones that exist', () => {
  const rows = parseProcesses(' 10 1 5\n 11 10 5\n 12 11 5\n 20 1 5\n');
  assert.deepEqual(treePids(rows, 10).sort(), [10, 11, 12]);
  assert.deepEqual(treePids(rows, 99), []);
});

test('on Linux the real smaps_rollup of this process gives a positive PSS no larger than its RSS', { skip: process.platform !== 'linux' }, async () => {
  const rss = Number(readFileSync('/proc/self/statm', 'utf8').split(' ')[1]) * 4; // pages -> kB (4 kB pages)
  const kb = (await memoryKbByPid([{ pid: process.pid, kb: 0 }])).get(process.pid) ?? 0;
  assert.ok(kb > 0 && kb <= rss * 1.1, `${kb} kB vs ${rss} kB`);
});
