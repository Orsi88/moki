// Memory and load battery for the Moki desktop app: the same scenarios (S0-S13, no S10, plus the S-floor
// reference) before and after a change, to prove a memory task helped and nothing else got worse. Not part of
// `npm test` and not packaged (it lives in tests/perf/, not scripts/).
//
//   npm run measure:memory -- --label baseline [--reps 3] [--only S2,S5] [--s9-seconds 60]
//   QA_PERF=1 npm run measure:memory -- --label baseline --only S6,S11,S12,S13   # adds the main-process probe
//   npm run measure:memory -- compare build/memory/baseline-<date>.json build/memory/after-<date>.json [--goal c1,c2,c3,c5,perf]
//   QA_ELECTRON_ARGS="--disable-gpu" npm run measure:memory -- --label e1 --only S-floor,S2     # one Chromium switch set
//   npm run measure:memory -- --label ab --matrix E0,E1,E2,E3,E4,E5 --only S-floor,S0,S2         # one file per configuration
//
// S-floor is a bare Electron on about:blank (tests/perf/floor-main.mjs, no app build needed): the cost of Electron itself.
// Every scenario also reports RSS, PSS and USS per process type, and the RSS the status bar used to show against PSS.

// QA_PERF=1 loads tests/perf/main-hook.mjs into the main process (event loop lag, IPC calls and
// bytes per method, execFileSync calls). S12 needs it; without it S6 and the others simply omit
// those metrics. S6 (loop lag) and S11-S13 are new and have not been run by anyone yet.
//
// It launches the built app (npm run app:build first) on the virtual display, like the UI tests.
// Everything it creates is under the system temp folder. Result: a table and build/memory/<label>-<date>.json.
// Memory is PSS read from /proc (Linux); elsewhere Electron's working set. Under Xvfb the GPU is
// drawn by software, so only the comparison before/after means something, not the absolute numbers.

import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from 'pdf-lib';
import { crc32, deflateSync } from 'node:zlib';
import { runHeadless } from '../ui/run.mjs';
import { createRequire } from 'node:module';
import { installHook, readHook, resetHook } from './main-hook.mjs';
import { flatByGroup, groupOfMetricType, median, medianByGroup, readProc, sumByGroup, typeBreakdownRows } from './proc-stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chromium switch sets of the A/B matrix (--matrix E0,E1,...): each is QA_ELECTRON_ARGS for one whole run.
const MATRIX = {
  E0: '',
  E1: '--disable-gpu',
  E2: '--disable-gpu --disable-software-rasterizer',
  E3: '--enable-features=NetworkServiceInProcess2',
  E4: '--disable-gpu --enable-features=NetworkServiceInProcess2',
  E5: '--js-flags=--max-lazy',
};

// ---------------------------------------------------------------- compare (no app)

const MEM = { limit: (base, cv) => base * Math.max(0.05, 2 * cv), unit: 'MB' };
// Every metric compared, and the rule that says when "after" is worse than "baseline".
const RULES = {
  peak_mb: MEM,
  stable_mb: MEM,
  renderer_stable_mb: MEM,
  open_ms: { limit: (base, cv) => base * Math.max(0.15, 2 * cv), unit: 'ms' },
  cpu_main_s: { limit: (base, cv) => Math.max(base * Math.max(0.05, 2 * cv), 0.1), unit: 's' }, // CPU seconds of the main process in the scenario window
  loop_lag_max_ms: { limit: (base, cv) => Math.max(base * Math.max(0.15, 2 * cv), 20), unit: 'ms' },
  tab_readfile_calls: { limit: () => 0, unit: '' },
  canvas_peak: { limit: (base) => base * 0.1, unit: '' },
  leak_mb: { limit: (_base, _cv, sd) => Math.max(5, 2 * sd), unit: 'MB' },
  first_excalidraw_ms: { limit: () => 400, unit: 'ms' }, // C1: the first drawing may take up to 400 ms more
  readfile_calls: { limit: () => 0, unit: '' },
};
// Goals of each batch of tasks, asked for with --goal. Each: [scenario, metric, test(base, after), text].
const GOALS = {
  c1: [['S7', 'first_excalidraw_ms', (b, a) => a - b <= 400, 'first Excalidraw render at most +400 ms']],
  c2: [['S9', 'cpu_main_s', (b, a) => a <= b * 0.2, 'main CPU with terminals at least -80%']],
  c3: [['S2', 'peak_mb', (b, a) => a <= b * 0.6, 'PDF peak at most 60% of baseline'], ['S4', 'readfile_calls', (_b, a) => a === 0, 'no PDF re-sent on file changes']],
  c5: [['S5', 'renderer_stable_mb', (b, a) => a <= b * 0.7, 'renderer with 3 full terminals at least -30%']],
  // Absolute goals (a fifth item true): only the "after" report needs the metric. Thresholds are proposals, to adjust after the first real measurement.
  perf: [
    ['S2', 'peak_mb', (_b, a) => a <= 590, 'PDF peak at most 590 MB', true],
    ['S11', 'renderer_growth_pct', (_b, a) => a <= 10, 'long PDF: renderer grows at most 10% from 25% of the scroll to the end', true],
    ['S12', 'tab_readfile_calls', (_b, a) => a <= 0, 'tab re-reads at most the files really changed (none here)', true],
    ['S6', 'loop_lag_max_ms', (_b, a) => a <= 50, 'main event loop lag during the search at most 50 ms', true],
  ],
};

function compare(baselineFile, afterFile) {
  const load = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const base = load(baselineFile);
  const after = load(afterFile);
  const goals = (flag('goal', '') || '').split(',').filter(Boolean);
  const rows = [];
  for (const [id, b] of Object.entries(base.scenarios)) {
    const a = after.scenarios[id];
    for (const [metric, rule] of Object.entries(RULES)) {
      const bv = b.median?.[metric];
      const av = a?.median?.[metric];
      // An old report has only the percentage of CPU: it cannot be compared with seconds.
      if (metric === 'cpu_main_s' && (bv === undefined || bv === null) && b.median?.cpu_main_pct !== undefined) { rows.push({ id, metric, bv: null, av: av ?? null, verdict: 'N/A (baseline has only cpu_main_pct)' }); continue; }
      if (bv === undefined || bv === null) continue;
      if (av === undefined || av === null) { rows.push({ id, metric, bv, av: null, verdict: a?.status === 'ok' ? 'N/A' : 'FAIL (scenario did not run)' }); continue; }
      const cv = b.cv?.[metric] ?? 0;
      const sd = b.sd?.[metric] ?? 0;
      const limit = rule.limit(bv, cv, sd);
      const delta = av - bv;
      rows.push({ id, metric, bv, av, delta, pct: bv ? (delta / bv) * 100 : 0, limit, verdict: delta <= limit ? 'PASS' : 'FAIL' });
    }
  }
  for (const goal of goals) {
    for (const [id, metric, test, text, absolute] of GOALS[goal] ?? []) {
      const bv = base.scenarios[id]?.median?.[metric];
      const av = after.scenarios[id]?.median?.[metric];
      const missing = av === undefined || av === null || (!absolute && (bv === undefined || bv === null));
      rows.push({ id, metric: `goal ${goal}`, bv, av, text, verdict: missing ? 'N/A' : test(bv, av) ? 'PASS' : 'FAIL' });
    }
  }
  const f = (n, d = 1, none = 'n/d') => (n === undefined || n === null ? none : n.toFixed(d));
  console.log(`baseline ${base.meta.label} (${base.meta.date}) vs after ${after.meta.label} (${after.meta.date})`);
  console.log(['scenario'.padEnd(9), 'metric'.padEnd(21), 'baseline'.padStart(10), 'after'.padStart(10), 'delta'.padStart(9), 'delta %'.padStart(8), 'allowed'.padStart(9), 'verdict'].join(' '));
  for (const r of rows) {
    console.log([r.id.padEnd(9), r.metric.padEnd(21), f(r.bv).padStart(10), f(r.av).padStart(10), f(r.delta, 1, '-').padStart(9), f(r.pct, 1, '-').padStart(8), f(r.limit, 1, '-').padStart(9), `${r.verdict}${r.text ? ` (${r.text})` : ''}`].join(' '));
  }
  const failed = rows.filter((r) => r.verdict.startsWith('FAIL')).length;
  console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
  process.exitCode = failed ? 1 : 0;
  // Information only: it never changes the verdicts above.
  const cell = (r) => `${f(r.b)}->${f(r.a)} ${r.delta === null ? '' : `${r.delta >= 0 ? '+' : ''}${f(r.delta)} MB ${r.pct === null ? '' : `(${r.pct >= 0 ? '+' : ''}${f(r.pct)}%)`}`}`.trim();
  console.log('\nBy process type, median MB (RSS counts shared pages in every process; PSS splits them; USS is private only)');
  for (const [id, b] of Object.entries(base.scenarios)) {
    const a = after.scenarios[id];
    if (!a?.median) continue;
    const byType = typeBreakdownRows(b.median, a.median);
    const ratio = [b.median?.rss_pss_ratio, a.median?.rss_pss_ratio];
    if (!byType.length && ratio.every((x) => x === undefined)) continue;
    console.log(`${id}${ratio[0] !== undefined || ratio[1] !== undefined ? `  status bar RSS / PSS: ${f(ratio[0], 2)} -> ${f(ratio[1], 2)}` : ''}`);
    for (const group of new Set(byType.map((r) => r.group))) console.log(`  ${group.padEnd(9)} ${byType.filter((r) => r.group === group).map((r) => `${r.field.toUpperCase()} ${cell(r)}`).join(' | ')}`);
  }
}

if (argv[0] === 'compare') {
  if (!argv[2]) { console.error('Usage: measure-memory.mjs compare <baseline.json> <after.json> [--goal c1,c2,c3,c5,perf]'); process.exit(2); }
  compare(argv[1], argv[2]);
  process.exit(process.exitCode ?? 0);
}

// ---------------------------------------------------------------- run (needs the virtual display)

if (process.env.QA_UI_HEADLESS !== '1') process.exit(runHeadless([fileURLToPath(import.meta.url), ...argv]));
const { launchMoki } = await import('../ui/launch.ts');
const { parseElectronArgs } = await import('../../desktop/electron-args.ts');

const LABEL = flag('label', 'run');
const REPS = Number(flag('reps', 3));
const ONLY = (flag('only', '') || '').split(',').filter(Boolean);
const S9_SECONDS = Number(flag('s9-seconds', 60));
const MATRIX_IDS = (flag('matrix', '') || '').split(',').filter(Boolean);
const WINDOW = [1360, 860];
const SETTLE_MS = 3000; // after the app starts and after an action, before measuring "stable"
const SAMPLE_MS = 200;
const PERF = process.env.QA_PERF === '1'; // loads tests/perf/main-hook.mjs into the main process
const linux = process.platform === 'linux';

// ---- measurement: PSS per process from /proc (Linux), else Electron's working set

const parents = () => {
  const map = new Map();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try { map.set(Number(name), Number(readFileSync(`/proc/${name}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[1])); } catch { /* gone */ }
  }
  return map;
};

// One reading: MB of the whole process tree (windows, GPU, helpers, terminals' shells) and of the parts.
// Also RSS / PSS / USS per process type, and what the status bar summed before (the working set of getAppMetrics).
async function snapshot(app) {
  const procs = await app.evaluate(({ app: electron }) => electron.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, kb: m.memory.workingSetSize, privateKb: m.memory.privateBytes ?? null, sharedKb: m.memory.sharedBytes ?? null, cpu: m.cpu.cumulativeCPUUsage })));
  const main = procs.find((p) => p.type === 'Browser');
  const sum = (type) => procs.filter((p) => p.type === type);
  const barRssMb = procs.reduce((a, p) => a + p.kb / 1024, 0);
  let total;
  let part;
  let byType;
  let pssMetricsMb = null;
  let kids = 0;
  if (linux && main) {
    const ppid = parents();
    const tree = new Set([main.pid]);
    for (let grew = true; grew;) { grew = false; for (const [pid, parent] of ppid) if (tree.has(parent) && !tree.has(pid)) { tree.add(pid); grew = true; } }
    const mem = new Map([...tree].map((pid) => [pid, readProc(pid)]));
    const mb = new Map([...mem].map(([pid, m]) => [pid, (m.pss ?? m.rss) / 1024]));
    total = [...mb.values()].reduce((a, b) => a + b, 0);
    part = (type) => sum(type).reduce((a, p) => a + (mb.get(p.pid) ?? 0), 0);
    const group = new Map(procs.map((p) => [p.pid, groupOfMetricType(p.type)]));
    const inMb = (kb) => (kb === null ? null : kb / 1024);
    byType = sumByGroup([...mem].map(([pid, m]) => ({ group: group.get(pid) ?? 'other', rss: m.rss / 1024, pss: inMb(m.pss), uss: inMb(m.uss) })));
    pssMetricsMb = procs.reduce((a, p) => a + (mb.get(p.pid) ?? 0), 0);
    try { const f = readFileSync(`/proc/${main.pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' '); kids = (Number(f[11]) + Number(f[12]) + Number(f[13]) + Number(f[14])) / 100; } catch { /* gone */ }
  } else {
    total = procs.reduce((a, p) => a + p.kb / 1024, 0);
    part = (type) => sum(type).reduce((a, p) => a + p.kb / 1024, 0);
    byType = sumByGroup(procs.map((p) => ({ group: groupOfMetricType(p.type), rss: p.kb / 1024, pss: null, uss: null })));
  }
  const metrics = procs.map((p) => ({ pid: p.pid, type: p.type, workingSetSize: p.kb, privateBytes: p.privateKb, sharedBytes: p.sharedKb })); // kB, as Electron reports them
  return { at: Date.now(), total, renderer: part('Tab'), main: part('Browser'), gpu: part('GPU'), cpu: main?.cpu ?? 0, cpuKids: kids, byType, barRssMb, pssMetricsMb, metrics };
}

// Takes samples in the background while a scenario runs, so a short spike (a PDF read as text) is not missed.
function sampler(app) {
  const snaps = [];
  let on = true;
  const loop = (async () => { while (on) { const t = Date.now(); try { snaps.push(await snapshot(app)); } catch { /* app closing */ } await sleep(Math.max(0, SAMPLE_MS - (Date.now() - t))); } })();
  return { snaps, stop: async () => { on = false; await loop; } };
}

// Settled values: wait, then the median of 5 readings.
async function stable(app, wait = SETTLE_MS) {
  await sleep(wait);
  const reads = [];
  for (let i = 0; i < 5; i++) { reads.push(await snapshot(app)); await sleep(500); }
  const pick = (key) => median(reads.map((r) => r[key]));
  const barRssMb = pick('barRssMb');
  const pssMetricsMb = reads.every((r) => r.pssMetricsMb === null) ? null : pick('pssMetricsMb');
  return { total: pick('total'), renderer: pick('renderer'), main: pick('main'), gpu: pick('gpu'), byType: medianByGroup(reads.map((r) => r.byType)), barRssMb, pssMetricsMb, rssPssRatio: pssMetricsMb ? barRssMb / pssMetricsMb : null, metrics: reads.at(-1).metrics };
}

// ---- fixtures (temp folder only)

const TEXT_PDF_LINE = 'requisito marcador-moki';
let pdfFile = '';
let longPdfFile = '';

// ~26 MB, 10 pages with an uncompressible image each (seeded noise), so the file is the same on every run.
async function makePdf(file) {
  let seed = 20240601;
  const next = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0); };
  const [w, h] = [1024, 850];
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 10; i++) {
    const pixels = new Uint8Array(w * h * 3);
    const words = new Uint32Array(pixels.buffer, 0, (pixels.length >> 2));
    for (let j = 0; j < words.length; j++) words[j] = next();
    const image = doc.context.register(doc.context.stream(pixels, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }));
    const page = doc.addPage([612, 792]);
    const name = page.node.newXObject(`Im${i}`, image);
    page.drawText(`Pagina ${i + 1} ${TEXT_PDF_LINE}`, { x: 50, y: 740, size: 18, font });
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(500, 0, 0, 415, 50, 300), drawObject(name), popGraphicsState());
  }
  writeFileSync(file, await doc.save({ useObjectStreams: false }));
}

// 300 light pages (a few lines of text, no images): a long document, not a heavy one.
async function makeLongPdf(file) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 300; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Pagina ${i + 1} ${TEXT_PDF_LINE}`, { x: 50, y: 740, size: 18, font });
    for (let l = 0; l < 30; l++) page.drawText(`linha ${l + 1} da pagina ${i + 1}: texto leve para preencher a pagina`, { x: 50, y: 700 - l * 20, size: 11, font });
  }
  writeFileSync(file, await doc.save({ useObjectStreams: false }));
}

// A PNG of seeded noise (does not compress, so its size is predictable) as a data: URL, which is how a note keeps its images.
function pngDataUrl(w, h, seed) {
  let x = seed;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let i = 0; i < raw.length; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; raw[i] = i % (w * 3 + 1) === 0 ? 0 : x >>> 24; } // first byte of a row: filter none
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const head = Buffer.alloc(4); head.writeUInt32BE(data.length); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(body)); return Buffer.concat([head, body, tail]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// Markdown with `images` noise pictures (side px) and filler lines until it is about `kb` KB.
function bigMarkdown(title, images, side, kb) {
  const parts = [`# ${title}\n\nTexto de abertura do documento de medicao.\n`];
  for (let i = 0; i < images; i++) parts.push(`\n![imagem ${i + 1}](${pngDataUrl(side, side, 1000 + i)})\n`);
  let size = parts.join('').length;
  for (let n = 1; size < kb * 1024; n++) { const line = `\nLinha ${n} do texto de preenchimento para o documento de medicao do Moki.\n`; parts.push(line); size += line.length; }
  return parts.join('');
}

const MERMAIDS = ['flowchart LR\n  A --> B', 'flowchart TD\n  X --> Y\n  Y --> Z', 'sequenceDiagram\n  A->>B: oi'];
const EXCALIDRAW = '{"type":"excalidraw","version":2,"source":"moki","elements":[],"appState":{"viewBackgroundColor":"#ffffff"},"files":{}}';
const DIAGRAM_NOTE = MERMAIDS.map((m) => `\`\`\`mermaid\n${m}\n\`\`\`\n\n\`\`\`excalidraw\n${EXCALIDRAW}\n\`\`\`\n`).join('\n');

function addProject(root, id, name) {
  const project = join(root, 'workspace', 'projects', id);
  cpSync(join(REPO, 'templates', 'project-context'), project, { recursive: true });
  renameSync(join(project, 'gitignore.txt'), join(project, '.gitignore'));
  for (const dir of ['inbox', 'runs', 'temporary', 'notes']) mkdirSync(join(project, dir), { recursive: true });
  const file = join(project, 'project.json');
  writeFileSync(file, `${JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), project: id, name }, null, 2)}\n`);
  return project;
}

// A workspace like the UI tests', with the project `acme` ready for every scenario.
// pdf: true copies the 25 MB PDF, 'long' the 300-page one, both as inbox/big.pdf.
function fixture({ pdf = false, extra = (_root) => {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'moki-mem-'));
  const userData = mkdtempSync(join(tmpdir(), 'moki-mem-profile-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.0.0-test' }));
  for (const dir of ['skills', 'agents', 'activities', 'templates']) cpSync(join(REPO, dir), join(root, dir), { recursive: true });
  const acme = addProject(root, 'acme', 'Acme Library');
  writeFileSync(join(acme, 'notes', 'diagram.md'), DIAGRAM_NOTE);
  if (pdf) copyFileSync(pdf === 'long' ? longPdfFile : pdfFile, join(acme, 'inbox', 'big.pdf'));
  extra(root);
  return { root, userData, acme };
}

// ~20,000 small text files in 220 folders (1 in 500 has the search word).
function bigTree(root) {
  const project = addProject(root, 'big', 'Arvore Grande');
  let n = 0;
  for (let g = 0; g < 20; g++) for (let d = 0; d < 10; d++) {
    const dir = join(project, 'data', `g${String(g).padStart(2, '0')}`, `d${d}`);
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < 100; f++, n++) writeFileSync(join(dir, `f${String(f).padStart(3, '0')}.txt`), `arquivo ${n}\n${n % 500 === 0 ? 'marcador-moki\n' : ''}linha de texto para preencher o arquivo ${n}.\n`);
  }
}

// ---- driving the UI (Portuguese, like the UI tests)

// What the app said about QA_ELECTRON_ARGS on stderr ("ignored (not allowed): ..."), best effort: the first lines may come before we listen.
const appStderr = new Set();
const listenStderr = (app) => app.process().stderr?.on('data', (chunk) => { for (const line of String(chunk).split('\n')) if (line.includes('QA_ELECTRON_ARGS')) appStderr.add(line.trim()); });

async function openMoki(env) {
  const app = await launchMoki({ QA_FAKE_TOOLS: '1', SHELL: '/bin/sh', ...env });
  listenStderr(app);
  const page = await app.firstWindow();
  page.on('pageerror', (err) => console.error('  pageerror', err.message));
  await page.evaluate(() => { localStorage.setItem('qa-ui-language', 'pt-BR'); localStorage.setItem('qa-language', 'Portuguese (pt-BR)'); });
  const reloaded = page.waitForEvent('load');
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setSize(w, h); win.webContents.reload(); }, WINDOW);
  await reloaded;
  return { app, page };
}

// S-floor: a bare Electron (tests/perf/floor-main.mjs). tests/ui/launch.ts only starts Moki, so the same screen guard is repeated here.
async function openFloor() {
  const { _electron: electron } = await import('@playwright/test');
  if (linux && (!process.env.DISPLAY || process.env.DISPLAY === process.env.QA_REAL_DISPLAY || process.env.WAYLAND_DISPLAY)) throw new Error('No virtual display: run through "npm run measure:memory" (Xvfb).');
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  for (const key of ['QA_SCREENSHOT', 'ELECTRON_RUN_AS_NODE', 'PWDEBUG']) delete env[key];
  const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), cwd: REPO, args: linux ? ['--ozone-platform=x11', join(HERE, 'floor-main.mjs')] : [join(HERE, 'floor-main.mjs')], env, timeout: 60_000 });
  listenStderr(app);
  await app.firstWindow();
  return { app, page: null };
}

const timed = async (fn) => { const t = performance.now(); await fn(); return performance.now() - t; };
const row = (page, title) => page.locator(`.tree-row[title="${title}"]`);

async function openPdf(page) {
  if (!await row(page, 'inbox/big.pdf').isVisible()) await row(page, 'inbox').click();
  return timed(async () => { await row(page, 'inbox/big.pdf').click(); await page.locator('.pdf-page .textLayer span').first().waitFor({ timeout: 60_000 }); });
}
async function scrollPdf(page) {
  await page.locator('.pdf-pages').hover();
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 700); await sleep(150); }
}
// Opens a file of the tree, expanding its folder first when the row is not visible.
async function openFile(page, dir, name) {
  if (!await row(page, `${dir}/${name}`).isVisible()) await row(page, dir).click();
  await row(page, `${dir}/${name}`).click();
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
// Key latency: from keydown to the frame that follows it (rAF, then a task), and the main thread's long tasks (> 50 ms).
const armKeys = (page) => page.evaluate(() => {
  window.__keys = []; window.__long = [];
  if (window.__keysOn) return;
  window.__keysOn = true;
  document.addEventListener('keydown', () => { const t = performance.now(); requestAnimationFrame(() => setTimeout(() => window.__keys.push(performance.now() - t), 0)); }, true);
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch { /* no longtask support */ }
});
async function typeMeasured(page, prefix) {
  await armKeys(page);
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('texto digitado durante a medicao de latencia por tecla do editor', { delay: 40 });
  await sleep(500);
  const { keys, long } = await page.evaluate(() => ({ keys: window.__keys, long: window.__long }));
  return { [`${prefix}_key_p50_ms`]: pct(keys, 0.5), [`${prefix}_key_p95_ms`]: pct(keys, 0.95), [`${prefix}_key_max_ms`]: Math.max(...keys), [`${prefix}_long_tasks`]: long.length, [`${prefix}_long_task_max_ms`]: long.length ? Math.max(...long) : 0 };
}
const closePdf = (page) => page.locator('.tab[title="inbox/big.pdf"] .tab-close').click();

async function openTerminals(page, count, project = 'acme') {
  for (let i = 1; i <= count; i++) {
    await page.getByTitle('Novo terminal').first().click();
    await page.getByRole('menuitem', { name: 'Terminal' }).click();
    await page.getByRole('menuitem', { name: /seu shell/ }).click();
    await page.waitForFunction(([id, n]) => window.qa.term.list(id).then((l) => l.length >= n), [project, i], { timeout: 20_000 });
  }
  await sleep(1500);
  return page.evaluate((id) => window.qa.term.list(id).then((l) => l.map((t) => t.id)), project);
}

// ---- scenarios: run(ctx) does the action and returns its own metrics; the runner adds memory and CPU

const SCENARIOS = {
  S0: { title: 'idle, project open', run: async () => { await sleep(10_000); return {}; } },
  S1: { title: 'no project open', project: null, run: async () => { await sleep(10_000); return {}; } },
  S2: { title: 'PDF 25 MB: open, scroll, close', pdf: true, run: async ({ page }) => {
    const open_ms = await openPdf(page);
    await scrollPdf(page);
    await closePdf(page);
    return { open_ms };
  } },
  S3: { title: 'PDF three times (leak)', pdf: true, run: async ({ app, page }) => {
    const opens = [];
    const after = [];
    for (let i = 0; i < 3; i++) {
      opens.push(await openPdf(page));
      await scrollPdf(page);
      await closePdf(page);
      after.push((await stable(app, 1500)).total);
    }
    return { open_ms: median(opens), leak_mb: after[2] - after[0] };
  } },
  S4: { title: 'PDF open + 20 file changes', pdf: true, run: async ({ app, page, acme }) => {
    const open_ms = await openPdf(page);
    await sleep(SETTLE_MS);
    // Counts the file reads the window asks for (reads the handler Electron keeps; null when that is not possible).
    const armed = await app.evaluate(({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      const original = handlers?.get('qa:call');
      if (!original) return false;
      globalThis.mokiReads = 0;
      handlers.set('qa:call', (event, method, args) => { if (method === 'readFile') globalThis.mokiReads += 1; return original(event, method, args); });
      return true;
    });
    for (let i = 0; i < 20; i++) { writeFileSync(join(acme, 'inbox', `mudanca-${i}.txt`), `mudanca ${i}\n`); await sleep(900); }
    await sleep(1500);
    const readfile_calls = armed ? await app.evaluate(() => globalThis.mokiReads) : null;
    return { open_ms, ...(armed ? { readfile_calls } : {}) };
  } },
  S5: { title: '3 terminals with heavy output', terminals: 3, run: async ({ page, ids }) => {
    const t = performance.now();
    const command = "yes 'saida intensa do terminal Moki 0123456789 abcdefghij klmnopqrstuvwxyz' | head -n 150000; echo FIM-$((40+2))\n";
    for (const id of ids) await page.evaluate(([i, c]) => window.qa.term.input(i, c), [id, command]);
    await page.waitForFunction((list) => Promise.all(list.map((i) => window.qa.term.attach(i))).then((all) => all.every((s) => s && s.includes('FIM-42'))), ids, { timeout: 180_000, polling: 1000 });
    await page.locator('.term-pane:not([hidden]) .xterm-rows').getByText('FIM-42').first().waitFor({ timeout: 120_000 });
    await sleep(5000);
    return { output_ms: performance.now() - t };
  } },
  S6: { title: 'tree of 20,000 files: open, search', big: true, run: async ({ page, perf }) => {
    await page.getByTitle('Todos os projetos').click();
    const open_ms = await timed(async () => { await page.locator('.home-project', { hasText: 'Arvore Grande' }).first().click(); await row(page, 'data').waitFor({ timeout: 120_000 }); });
    await row(page, 'data').click();
    await row(page, 'data/g00').click({ timeout: 20_000 }).catch(() => {}); // a folder opened, as a person would
    if (perf.on) await perf.reset(); // the lag below is the one of the two searches only
    const search_ms = await timed(async () => { await page.evaluate(() => window.qa.call('searchExpanded', 'marcador-moki', [])); });
    const rail_ms = await timed(async () => { await page.evaluate(() => window.qa.call('search', 'marcador-moki', [])); });
    const lag = perf.on ? (await perf.read())?.lag : undefined;
    return { open_ms, search_ms, rail_search_ms: rail_ms, ...(lag === undefined ? {} : { loop_lag_max_ms: lag }) };
  } },
  S7: { title: 'Markdown with 3 Excalidraw + 3 Mermaid', run: async ({ page }) => {
    await row(page, 'notes').click();
    const t = performance.now();
    await row(page, 'notes/diagram.md').click(); // the note opens in its formatted editor, which draws the diagrams
    const first = page.waitForFunction(() => document.querySelector('.diagram[data-diagram="excalidraw"] .diagram-picture svg'), null, { timeout: 60_000 }).then(() => performance.now() - t);
    const all = page.waitForFunction(() => { const p = [...document.querySelectorAll('.diagram-picture')]; return p.length === 6 && p.every((x) => x.querySelector('svg')); }, null, { timeout: 60_000 }).then(() => performance.now() - t);
    return { first_excalidraw_ms: await first, open_ms: await all };
  } },
  S8: { title: 'several windows (notebooks + search)', extraProjects: true, run: async ({ app, page }) => {
    const t = performance.now();
    await page.evaluate(() => Promise.all([
      ...['p1', 'p2', 'p3'].map((p) => window.qa.openNoteWindow({ project: p, path: 'notes/n.md', theme: 'dark' })),
      window.qa.openNoteWindow({ loose: 'new', theme: 'dark' }),
      window.qa.openSearchWindow(),
    ]));
    for (let i = 0; i < 100 && app.windows().length < 6; i++) await sleep(200);
    await Promise.all(app.windows().map((w) => w.waitForLoadState('load')));
    await sleep(2000);
    return { open_ms: performance.now() - t, windows: app.windows().length };
  } },
  S9: { title: `polling with 3 idle terminals, ${S9_SECONDS} s`, terminals: 3, run: async ({ page }) => {
    await sleep(S9_SECONDS * 1000);
    const state = await page.evaluate(() => ({ hidden: document.hidden, focus: document.hasFocus() }));
    return { page_hidden: Number(state.hidden), page_focus: Number(state.focus) };
  } },
  S11: { title: 'PDF of 300 light pages: open, scroll to the end', pdf: 'long', run: async ({ app, page }) => {
    const open_ms = await openPdf(page);
    // The scrolling element is the nearest ancestor of the pages that scrolls (the viewer's own class may change).
    const total = await page.evaluate(() => {
      let el = document.querySelector('.pdf-pages');
      while (el && !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      window.__pdfScroller = el;
      return el ? el.scrollHeight - el.clientHeight : 0;
    });
    if (!total) throw new Error('no scrollable PDF container found');
    const canvases = () => page.evaluate(() => document.querySelectorAll('.pdf-pages canvas').length); // the canvas is created inside each .pdf-page
    const marks = [];
    let canvas_peak = 0;
    let next = 0.25;
    for (let y = 0; y < total;) {
      y = Math.min(total, y + 1200);
      await page.evaluate((top) => { window.__pdfScroller.scrollTop = top; }, y);
      await sleep(100);
      canvas_peak = Math.max(canvas_peak, await canvases());
      if (y >= total * next) { marks.push((await snapshot(app)).renderer); next += 0.25; }
    }
    await sleep(1500);
    const canvas_end = await canvases();
    const pages = await page.locator('.pdf-pages .pdf-page').count();
    await closePdf(page);
    await sleep(1000);
    const q1 = marks[0];
    const end = marks.at(-1);
    return { open_ms, pages, canvas_peak, canvas_end, canvas_after_close: await canvases(), renderer_q1_mb: q1, renderer_end_mb: end, renderer_growth_pct: ((end - q1) / q1) * 100 };
  } },
  S12: { title: 'burst of 200 files in runs/ with 3 tabs open',
    setup: (acme) => {
      writeFileSync(join(acme, 'inbox', 'a.md'), `# Com imagens\n\n${[1, 2, 3, 4, 5].map((i) => `![imagem ${i}](${pngDataUrl(64, 64, i)})`).join('\n\n')}\n`);
      writeFileSync(join(acme, 'inbox', 'b.md'), `# Com diagramas\n\n\`\`\`mermaid\n${MERMAIDS[0]}\n\`\`\`\n\n\`\`\`excalidraw\n${EXCALIDRAW}\n\`\`\`\n`);
      writeFileSync(join(acme, 'inbox', 'c.md'), '# Simples\n\nso texto\n');
    },
    run: async ({ app, page, acme, perf }) => {
      if (!perf.ok) throw new Error('S12 needs QA_PERF=1 and an Electron that exposes ipcMain._invokeHandlers');
      for (const name of ['a.md', 'c.md', 'b.md']) { await openFile(page, 'inbox', name); await page.locator(`.tab[title="inbox/${name}"]`).waitFor({ timeout: 30_000 }); }
      await page.waitForFunction(() => document.querySelector('.diagram-picture svg'), null, { timeout: 60_000 }); // the active tab (b.md) has drawn its diagrams
      await sleep(SETTLE_MS);
      mkdirSync(join(acme, 'runs', 'burst'), { recursive: true });
      await perf.reset();
      const first = await snapshot(app);
      for (let i = 0; i < 200; i++) { writeFileSync(join(acme, 'runs', 'burst', `f-${i}.txt`), `arquivo ${i}\n`); await sleep(100); } // about 20 s
      await sleep(2000); // the window's debounce, then the re-reads it causes
      const last = await snapshot(app);
      const hook = await perf.read();
      const reads = ['a.md', 'c.md', 'b.md'].map((name) => hook.reads[`inbox/${name}`] ?? 0);
      // cpu_main_s here is the CPU of the burst only (the tabs' opening is outside it); the tabs' files do not change, so every re-read is waste.
      return { cpu_main_s: last.cpu - first.cpu, burst_files: 200, tab_files_changed: 0, tab_readfile_calls: reads.reduce((a, b) => a + b, 0), readfile_tab_a: reads[0], readfile_tab_c: reads[1], readfile_tab_b: reads[2], readfile_calls: hook.calls.readFile ?? 0 };
    } },
  S13: { title: 'typing in a 300 KB note and .md, 2000-row tree',
    setup: (acme) => {
      writeFileSync(join(acme, 'notes', 'big.md'), bigMarkdown('Nota grande', 3, 140, 300));
      writeFileSync(join(acme, 'inbox', 'big.md'), bigMarkdown('Markdown grande', 3, 140, 300));
      for (let g = 0; g < 20; g++) {
        const dir = join(acme, 'tree', `g${String(g).padStart(2, '0')}`);
        mkdirSync(dir, { recursive: true });
        for (let f = 0; f < 100; f++) writeFileSync(join(dir, `f${String(f).padStart(3, '0')}.txt`), `arquivo ${g}-${f}\n`);
      }
    },
    run: async ({ page }) => {
      await row(page, 'tree').click();
      for (let g = 0; g < 20; g++) await row(page, `tree/g${String(g).padStart(2, '0')}`).click({ timeout: 20_000 });
      const tree_rows = await page.locator('.tree-row').count();
      // The note (notes/ opens in its formatted editor in a dialog).
      await openFile(page, 'notes', 'big.md');
      const note = page.locator('.note-dialog .tiptap-body');
      await note.waitFor({ timeout: 60_000 });
      await note.locator('p').first().click();
      const noteStats = await typeMeasured(page, 'note');
      const close = page.getByRole('button', { name: 'Fechar (Esc)' });
      if (await close.isVisible()) await close.click();
      // The .md of the inbox, in a tab, in edit mode.
      await openFile(page, 'inbox', 'big.md');
      await page.getByRole('button', { name: 'Editar (Ctrl+E)' }).click({ timeout: 60_000 });
      const visual = page.locator('.tiptap-body');
      await visual.waitFor({ timeout: 60_000 });
      await visual.locator('p').first().click();
      return { tree_rows, ...noteStats, ...await typeMeasured(page, 'md') };
    } },
  // The floor: Electron alone, to tell how much of every other number is Moki and how much is the runtime.
  'S-floor': { title: 'bare Electron on about:blank (the floor)', floor: true, project: null, run: async () => { await sleep(10_000); return {}; } },
};

async function runScenario(id) {
  const def = SCENARIOS[id];
  const dirs = def.floor ? null : fixture({
    pdf: def.pdf,
    extra: (root) => {
      def.setup?.(join(root, 'workspace', 'projects', 'acme'));
      if (def.big) bigTree(root);
      if (def.extraProjects) for (const p of ['p1', 'p2', 'p3']) writeFileSync(join(addProject(root, p, `Projeto ${p}`), 'notes', 'n.md'), `# Nota ${p}\n\ntexto\n`);
    },
  });
  let app;
  try {
    const opened = def.floor ? await openFloor() : await openMoki({ QA_ROOT: dirs.root, QA_USER_DATA: dirs.userData, QA_OPEN_PROJECT: def.project === null ? undefined : 'acme' });
    app = opened.app;
    const page = opened.page;
    // The main-process probe (QA_PERF=1): reset zeroes the window, read returns null when it is off.
    const probing = PERF && !def.floor; // the floor has no qa:call channel to count
    const hook = probing ? await app.evaluate(installHook) : { ipc: false };
    const perf = { on: probing, ok: probing && hook.ipc, reset: () => (probing ? app.evaluate(resetHook) : false), read: () => (probing ? app.evaluate(readHook) : null) };
    const ctx = { app, page, acme: dirs?.acme, ids: [], perf };
    if (def.project !== null) await row(page, 'inbox').waitFor({ timeout: 60_000 });
    if (def.terminals) ctx.ids = await openTerminals(page, def.terminals);
    await sleep(SETTLE_MS);
    const before = await stable(app, 500);
    const background = sampler(app);
    await perf.reset();
    const first = await snapshot(app);
    const extra = await def.run(ctx);
    const last = await snapshot(app);
    const probe = await perf.read();
    await background.stop();
    const after = await stable(app);
    const seconds = (last.at - first.at) / 1000;
    const peak = (key) => Math.max(...background.snaps.map((s) => s[key]));
    return {
      base_mb: before.total, peak_mb: Math.max(peak('total'), after.total), stable_mb: after.total,
      renderer_peak_mb: Math.max(peak('renderer'), after.renderer), renderer_stable_mb: after.renderer, main_stable_mb: after.main, gpu_stable_mb: after.gpu,
      // The status bar summed bar_rss_mb (working sets); pss_metrics_mb is the same processes by PSS. Ratio > 1 = how much the bar inflated.
      bar_rss_mb: after.barRssMb, ...(after.pssMetricsMb === null ? {} : { pss_metrics_mb: after.pssMetricsMb, rss_pss_ratio: after.rssPssRatio }),
      by_type: after.byType, ...flatByGroup(after.byType), app_metrics: after.metrics,
      cpu_main_s: last.cpu - first.cpu, ...(linux ? { cpu_main_kids_s: last.cpuKids - first.cpuKids } : {}),
      window_s: seconds,
      ...(probe ? { loop_lag_max_ms: probe.lag, exec_file_sync_calls: probe.exec, ...(probe.ipc ? { ipc_calls_total: probe.total, ipc_bytes: probe.bytes, ipc_by_method: probe.calls } : {}) } : {}),
      ...extra,
    };
  } finally {
    if (app) { await Promise.race([app.close().catch(() => {}), sleep(5000)]); try { app.process().kill('SIGKILL'); } catch { /* gone */ } }
    for (const dir of dirs ? [dirs.root, dirs.userData] : []) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

// ---- main

const ids = Object.keys(SCENARIOS).filter((id) => !ONLY.length || ONLY.includes(id));
const unknown = MATRIX_IDS.filter((id) => !(id in MATRIX));
if (unknown.length) { console.error(`Unknown --matrix id(s): ${unknown.join(', ')}. Known: ${Object.keys(MATRIX).join(', ')}.`); process.exit(2); }
if (ids.some((id) => !SCENARIOS[id].floor) && !existsSync(join(REPO, 'app', 'dist-electron', 'main.mjs'))) { console.error('The app is not built: run "npm run app:build" first.'); process.exit(2); }
const scratch = mkdtempSync(join(tmpdir(), 'moki-mem-pdf-'));
pdfFile = join(scratch, 'big.pdf');
longPdfFile = join(scratch, 'long.pdf');
if (ids.some((id) => SCENARIOS[id].pdf === true)) await makePdf(pdfFile);
if (ids.some((id) => SCENARIOS[id].pdf === 'long')) await makeLongPdf(longPdfFile);
const sizeMb = (file) => (existsSync(file) ? `${(readFileSync(file).length / 1048576).toFixed(1)} MB` : 'not needed');
console.log(`PDF ${sizeMb(pdfFile)}, long PDF ${sizeMb(longPdfFile)}; main-process probe ${PERF ? 'on (QA_PERF=1)' : 'off'}; ${ids.length} scenarios x ${REPS} repetitions; window ${WINDOW.join('x')}; memory = ${linux ? 'PSS' : 'working set'}`);

const git = (...args) => { try { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return ''; } };
const f = (n, d = 0) => (n === undefined || n === null ? '-' : n.toFixed(d));

// One whole run (every scenario x REPS) with the Chromium switches that are in the environment now; writes <label>-<date>.json.
async function battery(label, matrixId) {
  appStderr.clear();
  const rawArgs = process.env.QA_ELECTRON_ARGS; // undefined = not set, '' = set and empty
  const parsedArgs = parseElectronArgs(rawArgs);
  console.log(`\n${matrixId ? `[${matrixId}] ` : ''}QA_ELECTRON_ARGS=${rawArgs === undefined ? '(not set)' : JSON.stringify(rawArgs)} QA_NO_DEFAULT_SWITCHES=${process.env.QA_NO_DEFAULT_SWITCHES ?? '(not set)'}${parsedArgs.rejected.length ? ` ignored: ${parsedArgs.rejected.join(' ')}` : ''}`);
  const results = Object.fromEntries(ids.map((id) => [id, { title: SCENARIOS[id].title, reps: [], errors: [] }]));
  for (let rep = 1; rep <= REPS; rep++) {
    for (const id of ids) {
      process.stdout.write(`rep ${rep}/${REPS} ${id} ${SCENARIOS[id].title} ... `);
      try {
        const r = await runScenario(id);
        results[id].reps.push(r);
        console.log(`ok${r.rss_pss_ratio === undefined ? '' : ` (status bar RSS ${f(r.bar_rss_mb)} MB vs PSS ${f(r.pss_metrics_mb)} MB, x${f(r.rss_pss_ratio, 2)})`}`);
      } catch (e) { results[id].errors.push(String(e instanceof Error ? e.message : e).split('\n').slice(0, 4).join(' | ')); console.log(`FAILED: ${results[id].errors.at(-1)}`); }
    }
  }

  for (const r of Object.values(results)) {
    const keys = [...new Set(r.reps.flatMap((x) => Object.keys(x)))];
    r.median = {}; r.sd = {}; r.cv = {};
    for (const key of keys) {
      const xs = r.reps.map((x) => x[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (!xs.length) continue;
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
      r.median[key] = median(xs); r.sd[key] = sd; r.cv[key] = mean ? sd / Math.abs(mean) : 0;
    }
    r.status = r.reps.length === REPS ? 'ok' : r.reps.length ? 'partial' : 'failed';
  }

  const date = new Date().toISOString().slice(0, 10);
  const meta = {
    label, date, startedAt: new Date().toISOString(), commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').split('\n').filter(Boolean).length,
    platform: process.platform, node: process.version, electron: JSON.parse(readFileSync(join(REPO, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
    reps: REPS, window: WINDOW, memory: linux ? 'PSS (/proc/<pid>/smaps_rollup), whole process tree; by_type has RSS, PSS and USS (Private_Clean + Private_Dirty) in MB' : 'Electron working set',
    display: process.env.DISPLAY, note: 'Xvfb: GPU drawn by software; compare runs of the same machine only.',
    ...(matrixId ? { matrix: matrixId } : {}),
    // The switches this run used. rejected = what desktop/electron-args.ts drops; app_stderr = what the app itself printed about them (best effort).
    electron_args: { raw: rawArgs ?? null, noDefaultSwitches: process.env.QA_NO_DEFAULT_SWITCHES ?? null, accepted: parsedArgs.accepted.map((x) => (x.value === undefined ? `--${x.switch}` : `--${x.switch}=${x.value}`)), rejected: parsedArgs.rejected, app_stderr: [...appStderr] },
  };
  const out = join(REPO, 'build', 'memory');
  mkdirSync(out, { recursive: true });
  const file = join(out, `${label}-${date}.json`);
  writeFileSync(file, `${JSON.stringify({ meta, scenarios: results }, null, 2)}\n`);

  console.log('\n' + ['scenario'.padEnd(9), 'reps'.padStart(4), 'peak MB'.padStart(8), 'stable MB'.padStart(10), 'CV %'.padStart(6), 'renderer MB'.padStart(12), 'open ms'.padStart(8), 'cpu main s'.padStart(11), 'extra'].join(' '));
  for (const [id, r] of Object.entries(results)) {
    const m = r.median;
    const extra = Object.entries(m).filter(([k]) => ['leak_mb', 'first_excalidraw_ms', 'readfile_calls', 'search_ms', 'rail_search_ms', 'output_ms', 'windows', 'cpu_main_kids_s', 'page_hidden', 'page_focus', 'loop_lag_max_ms', 'ipc_calls_total', 'ipc_bytes', 'exec_file_sync_calls', 'canvas_peak', 'canvas_end', 'canvas_after_close', 'renderer_growth_pct', 'tab_readfile_calls', 'tab_files_changed', 'tree_rows', 'note_key_p50_ms', 'note_key_p95_ms', 'note_key_max_ms', 'note_long_tasks', 'md_key_p50_ms', 'md_key_p95_ms', 'md_key_max_ms', 'md_long_tasks'].includes(k)).map(([k, v]) => `${k}=${f(v, 1)}`).join(' ');
    console.log([id.padEnd(9), `${r.reps.length}/${REPS}`.padStart(4), f(m.peak_mb).padStart(8), f(m.stable_mb).padStart(10), f((r.cv.stable_mb ?? NaN) * 100, 1).replace('NaN', '-').padStart(6), f(m.renderer_stable_mb).padStart(12), f(m.open_ms).padStart(8), f(m.cpu_main_s, 2).padStart(11), r.errors.length ? `FAILED x${r.errors.length}: ${r.errors[0]}` : extra].join(' '));
  }
  console.log('\nBy process type, median MB (rss/pss/uss); "bar" = what the status bar used to show (sum of RSS), "x" = bar / PSS of the same processes');
  for (const [id, r] of Object.entries(results)) {
    const m = r.median;
    const types = [...new Set(Object.keys(m).filter((k) => k.startsWith('bt_')).map((k) => k.split('_')[1]))];
    if (!types.length) continue;
    const cells = types.map((t) => `${t} ${['rss', 'pss', 'uss'].map((x) => f(m[`bt_${t}_${x}_mb`])).join('/')}`).join(' | ');
    console.log(`${id.padEnd(8)} ${cells}${m.rss_pss_ratio === undefined ? '' : ` | bar ${f(m.bar_rss_mb)} x${f(m.rss_pss_ratio, 2)}`}`);
  }
  for (const [id, r] of Object.entries(results)) {
    const by = r.reps.at(-1)?.ipc_by_method;
    if (by) console.log(`${id} IPC by method (last repetition): ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'}`);
  }
  console.log(`\n${file}`);
  if (Object.values(results).some((r) => r.status !== 'ok')) process.exitCode = 1;
}

// --matrix: the same run once per Chromium switch set. Each one is exactly its list (QA_NO_DEFAULT_SWITCHES=1), so a future default cannot leak into E0.
if (MATRIX_IDS.length) {
  for (const id of MATRIX_IDS) {
    process.env.QA_ELECTRON_ARGS = MATRIX[id];
    process.env.QA_NO_DEFAULT_SWITCHES = '1';
    await battery(`${LABEL}-${id.toLowerCase()}`, id);
  }
} else {
  await battery(LABEL, null);
}
rmSync(scratch, { recursive: true, force: true });
process.exitCode ??= 0;
