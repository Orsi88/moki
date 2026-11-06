// Memory of the desktop app in fixed scenarios, to compare two builds (Linux only: it reads the
// PSS of each process from /proc, so pages shared between Electron's processes count once).
// It starts the built app (npm run app:build first) on a throwaway framework copy and project in
// the system temp folder; nothing is written to workspace/. Output: JSON on the console, in MB.
// Usage: npm run bench:memory
// It opens app windows: on a desktop, run it on a headless display (docs/testing.md).

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import electronPath from 'electron';
import { ROOT } from './lib/repo.mjs';

if (process.platform !== 'linux') {
  console.error('measure-memory reads /proc and runs on Linux only.');
  process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const scratch = mkdtempSync(join(tmpdir(), 'moki-memory-'));

// A framework copy with one project and a 60-page PDF in its inbox.
const root = join(scratch, 'root');
mkdirSync(root);
writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.0.0-bench' }));
for (const dir of ['skills', 'agents', 'activities', 'templates']) cpSync(join(ROOT, dir), join(root, dir), { recursive: true });
const project = join(root, 'workspace', 'projects', 'acme');
cpSync(join(ROOT, 'templates', 'project-context'), project, { recursive: true });
for (const dir of ['inbox', 'runs', 'temporary', 'notes']) mkdirSync(join(project, dir), { recursive: true });
const projectFile = join(project, 'project.json');
writeFileSync(projectFile, JSON.stringify({ ...JSON.parse(readFileSync(projectFile, 'utf8')), project: 'acme', name: 'Acme' }, null, 2));
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let n = 1; n <= 60; n++) {
  const page = pdf.addPage([595, 842]);
  for (let y = 800; y > 40; y -= 14) page.drawText(`Page ${n} line ${y} - the quick brown fox jumps over the lazy dog`, { x: 40, y, size: 10, font });
  page.drawRectangle({ x: 300, y: 300, width: 200, height: 200, color: rgb(0.2 + (n % 5) / 8, 0.4, 0.6) });
}
writeFileSync(join(project, 'inbox', 'big.pdf'), await pdf.save());

// PSS of the app's process tree, in MB, in total and by Chromium process type (browser = main process).
function pss(rootPid) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,args='], { encoding: 'utf8' }).trim().split('\n').map((line) => {
    const [pid, ppid, ...args] = line.trim().split(/\s+/);
    return { pid: Number(pid), ppid: Number(ppid), args: args.join(' ') };
  });
  const tree = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) if (tree.has(r.ppid) && !tree.has(r.pid)) { tree.add(r.pid); grew = true; }
  }
  const byType = {};
  let total = 0;
  for (const r of rows.filter((row) => tree.has(row.pid))) {
    let kb = 0;
    try { kb = Number(/^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${r.pid}/smaps_rollup`, 'utf8'))?.[1] ?? 0); } catch { /* the process ended */ }
    const type = /--type=(\S+)/.exec(r.args)?.[1] ?? 'browser';
    byType[type] = (byType[type] ?? 0) + kb;
    total += kb;
  }
  const mb = (kb) => Math.round(kb / 1024);
  return { total: mb(total), ...Object.fromEntries(Object.entries(byType).map(([type, kb]) => [type, mb(kb)])) };
}

const env = { ...process.env, QA_ROOT: root, QA_USER_DATA: join(scratch, 'user-data'), QA_OPEN_PROJECT: 'acme', QA_FAKE_TOOLS: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const started = Date.now();
const app = await _electron.launch({ executablePath: electronPath, cwd: ROOT, args: [ROOT], env, timeout: 60_000 });
try {
  const pid = app.process().pid;
  const page = await app.firstWindow();
  await page.waitForSelector('.statusbar', { timeout: 30_000 });
  const out = { startupMs: Date.now() - started };
  await sleep(5000);
  out.idle = pss(pid);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('qa:open-in-main', 'acme', 'inbox/big.pdf'));
  await page.waitForSelector('.pdf-page canvas', { timeout: 30_000 });
  await sleep(2000);
  out.pdfOpen = pss(pid);
  // Scrolled to the end, half a screen at a time.
  await page.evaluate(async () => {
    let box = document.querySelector('.pdf-pages');
    while (box && !(box.scrollHeight > box.clientHeight && getComputedStyle(box).overflowY !== 'visible')) box = box.parentElement;
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    for (let y = 0; box && y <= box.scrollHeight; y += box.clientHeight / 2) { box.scrollTop = y; await wait(120); }
  });
  await sleep(3000);
  out.pdfScrolled = pss(pid);
  out.pdfCanvases = await page.evaluate(() => document.querySelectorAll('.pdf-page canvas').length);

  // An AI tool writing files while the PDF is open.
  for (let i = 0; i < 10; i++) { writeFileSync(join(project, 'notes', `n${i}.md`), `# note ${i}\n`); await sleep(700); }
  await sleep(2000);
  out.afterWrites = pss(pid);

  await page.evaluate(() => window.qa.openSearchWindow());
  await page.evaluate(() => window.qa.openNoteWindow({ loose: 'new' }));
  await sleep(6000);
  out.withNoteAndSearch = pss(pid);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await app.close();
  rmSync(scratch, { recursive: true, force: true });
}
