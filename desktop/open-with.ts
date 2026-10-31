// "Open with" for the desktop app: the programs the operating system offers for
// a file, and opening it with one of them. It never changes the system's default
// program; the one the user keeps for a file type is a preference of the app.
// Linux: GIO (.desktop ids, the programs GNOME recommends for the type). macOS:
// Launch Services through JXA. Windows: its own "Open with" dialog, which lists them.
// Paths and program ids only travel as arguments, never through a shell.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { which } from '../scripts/lib/core.ts';
import { openWithType } from './fs-guard.ts';
import { detached } from './launcher.ts';

const run = promisify(execFile);

export interface OpenApp { id: string; name: string; isDefault: boolean } // isDefault: the system's default program
export interface AppChooser {
  dialog: boolean; // the system shows its own dialog (Windows): apps() is empty and open(file, '') shows it
  apps: (file: string) => Promise<OpenApp[]>;
  open: (file: string, app: string) => Promise<void>;
}

// `gio mime <type>` output (LC_ALL=C): the default program on the first line, then the
// registered and the recommended ones, one per tab-indented line. The registered ones are the
// fallback when nothing is recommended (seen for application/pdf). Pure, for testing.
export function parseGioMime(out: string): { def: string; ids: string[] } {
  const def = /^Default application for .*: (\S+)$/m.exec(out)?.[1] ?? '';
  const list = (name: string): string[] => (new RegExp(`^${name} applications:\\n((?:\\t.*\\n?)*)`, 'm').exec(out)?.[1] ?? '')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const recommended = list('Recommended');
  return { def, ids: [...new Set([def, ...(recommended.length ? recommended : list('Registered'))].filter(Boolean))] };
}

const C = { env: { ...process.env, LC_ALL: 'C' } };

// ponytail: ids of programs kept in a subfolder (kde4-foo.desktop = kde4/foo.desktop) are not found; add the lookup if one shows up.
const desktopFile = (id: string): string | undefined => [
  process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':'),
].map((dir) => join(dir, 'applications', id)).find((f) => existsSync(f));

// The name the system menus show, in the user's language when the program has it.
// Only the [Desktop Entry] section: the action sections after it have names too ("New Spreadsheet").
function appName(file: string, id: string): string {
  const lines = (readFileSync(file, 'utf8').split(/^\[/m).find((s) => s.startsWith('Desktop Entry]')) ?? '').split('\n');
  const value = (key: string) => lines.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim();
  const lang = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').split('.')[0];
  return value(`Name[${lang}]`) || value(`Name[${lang.split('_')[0]}]`) || value('Name') || id;
}

const linux: AppChooser = {
  dialog: false,
  apps: async (file) => {
    const type = openWithType(file);
    if (!type || !which('gio')) return [];
    const { def, ids } = parseGioMime((await run('gio', ['mime', type], C)).stdout);
    return ids.flatMap((id) => {
      const path = desktopFile(id);
      return path ? [{ id, name: appName(path, id), isDefault: id === def }] : [];
    });
  },
  open: async (file, app) => {
    const path = desktopFile(app);
    if (!path) throw new Error('Program not found.');
    detached('gio', ['launch', path, file]);
  },
};

// JXA: the programs Launch Services offers for the file, as JSON (macOS 12+, the minimum of this Electron).
const MAC_APPS = `function run([file]) {
  ObjC.import('AppKit');
  const ws = $.NSWorkspace.sharedWorkspace, url = $.NSURL.fileURLWithPath(file);
  const def = ws.URLForApplicationToOpenURL(url);
  return JSON.stringify(ObjC.unwrap(ws.URLsForApplicationsToOpenURL(url)).map((app) => ({
    id: app.path.js, name: $.NSFileManager.defaultManager.displayNameAtPath(app.path).js,
    isDefault: !def.isNil() && def.path.js === app.path.js,
  })));
}`;

const mac: AppChooser = {
  dialog: false,
  apps: async (file) => JSON.parse((await run('osascript', ['-l', 'JavaScript', '-e', MAC_APPS, file])).stdout) as OpenApp[],
  open: async (file, app) => detached('open', ['-a', app, file]),
};

// rundll32 hands the rest of the line to the dialog as the path, so it goes unquoted (spaces included).
const windows: AppChooser = {
  dialog: true,
  apps: async () => [],
  open: async (file) => detached('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', file], { windowsVerbatimArguments: true }),
};

export const appChooser: AppChooser = process.platform === 'win32' ? windows : process.platform === 'darwin' ? mac : linux;
