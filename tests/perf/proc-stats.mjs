// Pure helpers of the memory battery (tests/perf/measure-memory.mjs): per-process RSS / PSS / USS read from
// /proc, grouping by Electron process type, and the by-type before/after rows of `compare`. No Electron here,
// so tests/perf-proc-stats.test.ts covers them under `npm test`.
//
// RSS = resident pages, shared ones counted in full by every process (what the status bar summed before);
// PSS = shared pages split between the processes that map them (sums to the real footprint);
// USS = only pages private to the process (what would be freed if it exited).

import { readFileSync } from 'node:fs';

export const GROUPS = ['browser', 'renderer', 'gpu', 'utility', 'zygote', 'other'];
export const FIELDS = ['rss', 'pss', 'uss'];

// app.getAppMetrics() type -> group. A process of the tree that is not in the metrics (a terminal's shell) is 'other'.
const BY_METRIC_TYPE = { Browser: 'browser', Tab: 'renderer', GPU: 'gpu', Utility: 'utility', Zygote: 'zygote', 'Sandbox helper': 'zygote' };
export const groupOfMetricType = (type) => BY_METRIC_TYPE[type] ?? 'other';

export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

// /proc/<pid>/smaps_rollup text -> kB, or null when it has no Pss line.
export function parseSmapsRollup(text) {
  const kb = (key) => { const m = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const [rss, pss, clean, dirty] = ['Rss', 'Pss', 'Private_Clean', 'Private_Dirty'].map(kb);
  return pss === null ? null : { rss, pss, uss: (clean ?? 0) + (dirty ?? 0) };
}

// One process, in kB: smaps_rollup, else the RSS from statm (pss and uss are then null: unknown, not zero).
export function readProc(pid, read = (file) => readFileSync(file, 'utf8')) {
  try { const parsed = parseSmapsRollup(read(`/proc/${pid}/smaps_rollup`)); if (parsed) return parsed; } catch { /* not readable */ }
  try { return { rss: (Number(read(`/proc/${pid}/statm`).split(' ')[1]) * 4096) / 1024, pss: null, uss: null }; } catch { return { rss: 0, pss: null, uss: null }; }
}

// entries [{ group, rss, pss, uss }] in MB (a null field = unknown) -> { group: { n, rss, pss, uss }, total: {...} }.
// A field is null for a group when no process of it had that field.
/** @typedef {{ n: number, rss: number | null, pss: number | null, uss: number | null }} Sum */
/** @param {{ group: string, rss: number | null, pss: number | null, uss: number | null }[]} entries @returns {Record<string, Sum>} */
export function sumByGroup(entries) {
  const add = (a, v) => (v == null ? a : (a ?? 0) + v);
  /** @type {Record<string, Sum>} */
  const out = {};
  for (const e of entries) for (const key of [e.group, 'total']) {
    const g = (out[key] ??= { n: 0, rss: null, pss: null, uss: null });
    g.n += 1;
    for (const f of FIELDS) g[f] = add(g[f], e[f]);
  }
  return out;
}

// Median, field by field, of several sumByGroup() results (the readings of a settled measurement).
/** @param {Record<string, Sum>[]} list @returns {Record<string, Record<string, number | null>>} */
export function medianByGroup(list) {
  /** @type {Record<string, Record<string, number | null>>} */
  const out = {};
  for (const key of new Set(list.flatMap((x) => Object.keys(x)))) {
    out[key] = {};
    for (const f of ['n', ...FIELDS]) out[key][f] = median(list.map((x) => x[key]?.[f]).filter((v) => typeof v === 'number'));
  }
  return out;
}

// { renderer: { pss: 3 } } -> { bt_renderer_pss_mb: 3 }: flat numbers, so the repetition median/CV logic and `compare` need nothing new.
/** @param {Record<string, Record<string, number | null>>} byGroup @returns {Record<string, number>} */
export function flatByGroup(byGroup) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [group, g] of Object.entries(byGroup)) for (const f of FIELDS) if (typeof g[f] === 'number') out[`bt_${group}_${f}_mb`] = g[f];
  return out;
}

// Rows for `compare`: every group and field present in either median, baseline vs after.
export function typeBreakdownRows(baseMedian = {}, afterMedian = {}) {
  const rows = [];
  for (const group of [...GROUPS, 'total']) for (const field of FIELDS) {
    const key = `bt_${group}_${field}_mb`;
    const b = baseMedian[key];
    const a = afterMedian[key];
    if (typeof b !== 'number' && typeof a !== 'number') continue;
    const both = typeof b === 'number' && typeof a === 'number';
    rows.push({ group, field, b: b ?? null, a: a ?? null, delta: both ? a - b : null, pct: both && b ? ((a - b) / b) * 100 : null });
  }
  return rows;
}
