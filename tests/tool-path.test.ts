import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePath, toolDirs } from '../desktop/tool-path.ts';

test('PATH: the fresher PATH and the usual tool folders join the current one, without repeats', () => {
  const exists = (d: string) => d !== '/missing/bin';
  assert.equal(mergePath('darwin', ['/Users/a/.nvm/versions/node/v22/bin:/usr/bin', '/usr/bin:/bin', '/opt/homebrew/bin:/missing/bin'], exists),
    '/Users/a/.nvm/versions/node/v22/bin:/usr/bin:/bin:/opt/homebrew/bin');
  // Windows: case and a trailing slash do not make a folder new; the tool folders only when they exist.
  assert.equal(mergePath('win32', ['C:\\Windows;C:\\Users\\a\\AppData\\Roaming\\npm\\', 'c:\\windows;C:\\Tools', 'C:\\Users\\a\\AppData\\Roaming\\npm;C:\\nope'], (d) => d !== 'C:\\nope'),
    'C:\\Windows;C:\\Users\\a\\AppData\\Roaming\\npm\\;C:\\Tools');
});

test('PATH: npm global and the installers\' folders are among the usual ones', () => {
  const win = toolDirs('win32', 'C:\\Users\\a', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }).map((d) => d.replace(/\//g, '\\'));
  // npm, then the Cursor Agent CLI and Antigravity CLI installers.
  for (const d of ['C:\\Users\\a\\AppData\\Roaming\\npm', 'C:\\Users\\a\\AppData\\Local\\cursor-agent', 'C:\\Users\\a\\AppData\\Local\\agy\\bin']) assert.ok(win.includes(d), d);
  const mac = toolDirs('darwin', '/Users/a', {});
  for (const d of ['/opt/homebrew/bin', '/usr/local/bin', '/Users/a/.local/bin', '/Users/a/.npm-global/bin']) assert.ok(mac.some((x) => x.replace(/\\/g, '/') === d), d);
});
