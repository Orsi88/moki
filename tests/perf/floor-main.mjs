// Main process of the S-floor scenario of tests/perf/measure-memory.mjs: a bare Electron with one about:blank
// window and nothing of Moki, to measure the cost of Electron itself. It does not need the app build.
// It applies the switches of QA_ELECTRON_ARGS before 'ready', like desktop/main.ts, so the A/B matrix is
// comparable. The parser is a minimal copy on purpose: Electron's own Node cannot be counted on to load the
// TypeScript of desktop/electron-args.ts. Keep the allow-list in sync with that file.
// ponytail: Moki's default switches (desktop/chromium-switches.ts) are not applied here; they are empty today.
// If that list ever has entries, this file must apply them too, or the floor stops being comparable.

import { app, BrowserWindow } from 'electron';

const NO_VALUE = new Set(['disable-gpu', 'disable-software-rasterizer', 'in-process-gpu']);
const WITH_VALUE = new Set(['enable-features', 'disable-features', 'js-flags']);
const ignored = [];
for (const token of (process.env.QA_ELECTRON_ARGS ?? '').split(/\s+/).filter(Boolean)) {
  const m = /^--([a-z-]+)(?:=([A-Za-z0-9_.,:=+-]+))?$/.exec(token);
  if (m && m[2] === undefined && NO_VALUE.has(m[1])) app.commandLine.appendSwitch(m[1]);
  else if (m && m[2] !== undefined && WITH_VALUE.has(m[1])) app.commandLine.appendSwitch(m[1], m[2]);
  else ignored.push(token.slice(0, 60));
}
if (ignored.length) console.error(`QA_ELECTRON_ARGS: ignored (not allowed): ${ignored.join(' ')}`);

app.on('window-all-closed', () => app.quit());
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1360, height: 860 });
  win.loadURL('about:blank');
});
