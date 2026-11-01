// The PATH the desktop app uses to find the AI tools (claude, codex, gemini…). Started from
// the app menu, the app does not get the PATH of the user's terminal:
// - macOS/Linux give it a minimal PATH; a login shell (-l) adds ~/.zprofile but not ~/.zshrc,
//   where nvm and npm's global folder are usually set, so the PATH comes from an interactive
//   login shell (-il), read between markers because rc files may print things;
// - Windows keeps the PATH of the moment the app (or the program that opened it) started, so a
//   tool installed later looks missing: the current user and machine PATH are read again.
// Then the folders where these tools usually install are added when they exist.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MARK = '__MOKI_PATH__';

// The PATH of the user's shell, as an interactive login shell sees it ('' when it fails).
export function shellPath(shell = process.env.SHELL || '/bin/bash'): string {
  try {
    const out = execFileSync(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(MARK)[1] ?? '';
  } catch { return ''; }
}

// %VAR% expanded with this process's environment (Windows registry values keep them).
const expand = (value: string, env: NodeJS.ProcessEnv) => value.replace(/%([^%]+)%/g, (all, name: string) => env[name] ?? env[name.toUpperCase()] ?? all);

// The Path value of a registry key ('' when missing).
function registryPath(key: string): string {
  try {
    const out = execFileSync('reg', ['query', key, '/v', 'Path'], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const line = out.split(/\r?\n/).find((l) => /^\s+Path\s+REG_/i.test(l));
    return line ? line.replace(/^\s+Path\s+REG_\w+\s+/i, '').trim() : '';
  } catch { return ''; }
}

// The machine and user PATH as Windows has them now.
export function windowsPath(env: NodeJS.ProcessEnv = process.env): string {
  const machine = registryPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
  const user = registryPath('HKCU\\Environment');
  return [machine, user].filter(Boolean).map((p) => expand(p, env)).join(';');
}

// Folders where the AI tools' installers and npm put their commands, per system.
export function toolDirs(platform: NodeJS.Platform, home: string, env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    return [join(appData, 'npm'), join(home, '.local', 'bin'), join(local, 'Programs', 'cursor', 'resources', 'app', 'bin'),
      join(home, '.bun', 'bin'), join(local, 'Volta', 'bin'), join(home, 'scoop', 'shims')];
  }
  const nvm = join(home, '.nvm', 'versions', 'node');
  let nvmBins: string[] = [];
  try { nvmBins = readdirSync(nvm).sort().reverse().map((v) => join(nvm, v, 'bin')); } catch { /* no nvm */ }
  return ['/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'), join(home, '.npm-global', 'bin'), join(home, '.volta', 'bin'),
    join(home, '.bun', 'bin'), join(home, '.cargo', 'bin'), ...nvmBins];
}

// The current PATH, then the fresher one, then the usual tool folders that exist; no folder twice.
export function mergePath(platform: NodeJS.Platform, parts: string[], exists: (dir: string) => boolean = existsSync): string {
  const sep = platform === 'win32' ? ';' : ':';
  const key = (d: string) => (platform === 'win32' ? d.replace(/[\\/]+$/, '').toLowerCase() : d.replace(/\/+$/, ''));
  const seen = new Set<string>();
  const out: string[] = [];
  parts.forEach((part, i) => {
    for (const dir of part.split(sep).map((d) => d.trim()).filter(Boolean)) {
      if (seen.has(key(dir)) || (i === parts.length - 1 && !exists(dir))) continue; // the usual folders only when they exist
      seen.add(key(dir));
      out.push(dir);
    }
  });
  return out.join(sep);
}

// Sets process.env.PATH so the app finds the AI tools the user's terminal finds.
export function fixToolPath(platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = env.HOME ?? env.USERPROFILE ?? ''): void {
  const fresh = platform === 'win32' ? windowsPath(env) : shellPath();
  const current = env.PATH ?? '';
  const sep = platform === 'win32' ? ';' : ':';
  // On macOS/Linux the shell's PATH comes first (it is what the terminal uses); on Windows the current one does.
  const parts = platform === 'win32' ? [current, fresh] : [fresh, current];
  const merged = mergePath(platform, [...parts, toolDirs(platform, home, env).join(sep)]);
  env.PATH = merged; // on Windows process.env is case-insensitive: this is Path too
}
