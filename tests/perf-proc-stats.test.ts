import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatByGroup, groupOfMetricType, medianByGroup, parseSmapsRollup, readProc, sumByGroup, typeBreakdownRows } from './perf/proc-stats.mjs';

const ROLLUP = `55d0c4a00000-7ffd8a3e9000 ---p 00000000 00:00 0                          [rollup]
Rss:               20480 kB
Pss:               12288 kB
Pss_Dirty:          4096 kB
Shared_Clean:       8192 kB
Shared_Dirty:          0 kB
Private_Clean:      2048 kB
Private_Dirty:      6144 kB
Referenced:        20480 kB
`;

test('memory battery: smaps_rollup gives RSS, PSS and USS (private clean + dirty) in kB', () => {
  assert.deepEqual(parseSmapsRollup(ROLLUP), { rss: 20480, pss: 12288, uss: 8192 });
});

test('memory battery: a text without a Pss line is not a reading', () => {
  assert.equal(parseSmapsRollup('Rss: 10 kB\n'), null);
  assert.equal(parseSmapsRollup(''), null);
});

test('memory battery: readProc falls back to the RSS of statm (pss and uss unknown) and to zero when nothing is readable', () => {
  const files: Record<string, string> = { '/proc/1/smaps_rollup': ROLLUP, '/proc/2/statm': '100 50 10 1 0 5 0\n' };
  const read = (file: string) => { if (file in files) return files[file]; throw new Error('ENOENT'); };
  assert.deepEqual(readProc(1, read), { rss: 20480, pss: 12288, uss: 8192 });
  assert.deepEqual(readProc(2, read), { rss: 200, pss: null, uss: null }); // 50 pages x 4 kB
  assert.deepEqual(readProc(3, read), { rss: 0, pss: null, uss: null });
});

test('memory battery: Electron process types map to the groups of the report, anything else is other', () => {
  assert.deepEqual(['Browser', 'Tab', 'GPU', 'Utility', 'Zygote', 'Sandbox helper', 'Pepper Plugin'].map(groupOfMetricType), ['browser', 'renderer', 'gpu', 'utility', 'zygote', 'zygote', 'other']);
});

test('memory battery: processes are summed per group and in total, a field nobody had stays null', () => {
  const by = sumByGroup([
    { group: 'renderer', rss: 300, pss: 200, uss: 150 },
    { group: 'renderer', rss: 100, pss: 50, uss: 20 },
    { group: 'browser', rss: 120, pss: 80, uss: null },
  ]);
  assert.deepEqual(by.renderer, { n: 2, rss: 400, pss: 250, uss: 170 });
  assert.deepEqual(by.browser, { n: 1, rss: 120, pss: 80, uss: null });
  assert.deepEqual(by.total, { n: 3, rss: 520, pss: 330, uss: 170 });
  assert.equal(by.gpu, undefined);
});

test('memory battery: the median of several readings is taken per group and field, and flattens to bt_<group>_<field>_mb', () => {
  const reads = [100, 110, 500].map((pss) => sumByGroup([{ group: 'renderer', rss: pss * 2, pss, uss: pss / 2 }]));
  const med = medianByGroup(reads);
  assert.deepEqual(med.renderer, { n: 1, rss: 220, pss: 110, uss: 55 });
  assert.deepEqual(flatByGroup(med).bt_renderer_pss_mb, 110);
  assert.equal(flatByGroup(sumByGroup([{ group: 'gpu', rss: 5, pss: null, uss: null }])).bt_gpu_pss_mb, undefined);
});

test('memory battery: the compare breakdown lists each group and field with the change in MB and %', () => {
  const rows = typeBreakdownRows({ bt_renderer_pss_mb: 200, bt_renderer_rss_mb: 400 }, { bt_renderer_pss_mb: 150, bt_gpu_pss_mb: 30 });
  assert.deepEqual(rows.find((r) => r.group === 'renderer' && r.field === 'pss'), { group: 'renderer', field: 'pss', b: 200, a: 150, delta: -50, pct: -25 });
  assert.deepEqual(rows.find((r) => r.group === 'renderer' && r.field === 'rss'), { group: 'renderer', field: 'rss', b: 400, a: null, delta: null, pct: null });
  assert.deepEqual(rows.find((r) => r.group === 'gpu'), { group: 'gpu', field: 'pss', b: null, a: 30, delta: null, pct: null });
  assert.deepEqual(typeBreakdownRows({}, {}), []);
});
