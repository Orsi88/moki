// Runs inside the NEW terminal window opened by the desktop app (Windows): reads
// the launch request from a UTF-8 JSON file and starts the AI tool with the
// prompt as a real Unicode argument. This avoids cmd.exe decoding batch files
// in the legacy code page, which corrupted accents (ç, ã, é...).
//
// Usage (internal): <node or Electron as Node> run-tool <request.json>

import { openSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { TOOLS, installPlan, isTool, which, type ToolKey } from '../scripts/lib/core.ts';
import { fixToolPathSync } from './tool-path.ts';

interface LaunchFile { command: string; args: string[]; cwd: string; title: string; tool?: string }

// Quoting for cmd.exe when the tool is a .cmd/.bat shim: inside "..." the
// metacharacters & | < > ^ are literal; " and % are neutralized.
export const cmdQuote = (a: string): string => `"${a.replace(/"/g, "'").replace(/%/g, ' percent')}"`;

function waitForKey(message: string): void {
  console.error(`\n${message}\nPress Enter to close this window.`);
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
  process.stdin.once('end', () => process.exit(1)); // input closed: nothing to wait for
}

function consoleStdio(): 'inherit' | number[] {
  if (process.platform !== 'win32') return 'inherit';
  try {
    const out = openSync('CONOUT$', 'r+');
    return [openSync('CONIN$', 'r+'), out, out];
  } catch { return 'inherit'; }
}

function main(): void {
  const file = process.argv[2];
  const req = JSON.parse(readFileSync(file, 'utf8')) as LaunchFile;
  rmSync(file, { force: true }); // contains the prompt; no need to keep it
  process.title = req.title;
  process.on('SIGINT', () => { /* Ctrl+C belongs to the tool; wait for it to exit */ });
  process.stdout.write(`\x1b]0;${req.title}\x07`);

  const path = which(req.command);
  if (path) start(req, path);
  else if (req.tool && isTool(req.tool) && TOOLS[req.tool].install) offerInstall(req, req.tool);
  else waitForKey(`"${req.command}" was not found. Is it installed?`);
}

// The tool is missing: show how to install it and, only when the user types y, run the
// fixed vendor command of the TOOLS table. Nothing here comes from user text.
function offerInstall(req: LaunchFile, tool: ToolKey): void {
  const { label, install } = TOOLS[tool];
  console.log(`\n${label} is not installed.\nInstallation instructions: ${install!.docs}`);
  const plan = installPlan(tool);
  if (!plan) { waitForKey('Moki cannot install it automatically. Follow the instructions above.'); return; }
  console.log(`Moki will run: ${plan.shown}`);
  process.stdout.write(`Install ${label}? [y/N] `);
  process.stdin.resume();
  process.stdin.once('data', (d) => {
    process.stdin.pause();
    if (!/^\s*y(es)?\s*$/i.test(String(d))) { waitForKey('Not installed. Close this tab, or open another AI from the + menu.'); return; }
    const r = spawnSync(plan.file, plan.args, { stdio: consoleStdio() });
    if (r.status !== 0) { waitForKey(`The installer failed (exit ${r.status ?? r.error?.message ?? 'unknown'}). Try the instructions above.`); return; }
    fixToolPathSync();
    const path = which(req.command);
    if (path) start(req, path);
    else waitForKey(`Installed, but "${req.command}" is not on this app's PATH yet. Restart Moki and open it again.`);
  });
}

function start(req: LaunchFile, path: string): void {
  // Native executables get the arguments as-is; shims go through cmd.exe,
  // which converts arguments with the console code page — switch this
  // window's console to UTF-8 first so accents survive.
  const isShim = /\.(cmd|bat)$/i.test(path);
  if (isShim) spawnSync('chcp.com', ['65001'], { stdio: 'ignore' });
  // Hand the tool this window's console itself. When this runner is the app's
  // own executable (Electron in Node mode) its standard streams are not the
  // console, and interactive tools would start with no keyboard or screen.
  const stdio = consoleStdio();
  const child = isShim
    ? spawn(`${req.command} ${req.args.map(cmdQuote).join(' ')}`, { cwd: req.cwd, stdio, shell: true })
    : spawn(path, req.args, { cwd: req.cwd, stdio });
  child.on('error', (e) => waitForKey(`Could not start ${req.command}: ${e.message}`));
  child.on('exit', (code) => process.exit(code ?? 0));
}

const invokedDirectly = (() => {
  try { return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; }
})();
if (invokedDirectly) main();
