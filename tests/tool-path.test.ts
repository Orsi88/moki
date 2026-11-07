import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixToolPath, mergePath, pathPending, pathReady, shellPath, shellPathAsync, toolDirs } from '../desktop/tool-path.ts';
import { detectTools, detectToolsAsync, which, whichAsync } from '../scripts/lib/core.ts';

const posix = process.platform !== 'win32';
// A folder with an executable script per name, plus what a lookup must not match.
const fixture = (names: string[], mode = 0o755) => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-which-'));
  for (const n of names) { writeFileSync(join(dir, n), '#!/bin/sh\nexit 0\n'); chmodSync(dir + '/' + n, mode); }
  return dir;
};

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

test('which: the first executable file on PATH, resolved in JS (sync and async agree)', { skip: !posix }, async () => {
  const a = fixture(['tool', 'plain'], 0o644); // plain is not executable
  const b = fixture(['tool', 'plain']);
  mkdirSync(join(a, 'folder')); mkdirSync(join(b, 'folder')); // a folder never counts
  const env = { PATH: `${a}:${join(tmpdir(), 'qa-missing-dir')}::${b}` };
  try {
    for (const find of [(c: string) => which(c, env), (c: string) => whichAsync(c, env)]) {
      assert.equal(await find('tool'), join(b, 'tool'), 'skips a file without the execute bit');
      assert.equal(await find('plain'), join(b, 'plain'));
      assert.equal(await find('folder'), null);
      assert.equal(await find('nothing-here'), null);
    }
    assert.equal(which('tool', { PATH: `${b}:${a}` }), join(b, 'tool'), 'the first folder wins');
    assert.equal(which('tool', {}), null, 'no PATH, no match');
    assert.equal(which(join(b, 'tool'), { PATH: '' }), join(b, 'tool'), 'a path is checked as it is');
  } finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});

test('which: Windows adds PATHEXT unless the name already has one (simulated on a POSIX folder)', async () => {
  const dir = fixture(['claude.cmd', 'node.exe', 'script.ps1', 'dflt.CMD']);
  const env = { PATH: dir, PATHEXT: '.com;.exe;.bat;.cmd' }; // lowercase: this folder is on a case-sensitive file system
  try {
    assert.equal(which('claude', env, 'win32'), join(dir, 'claude.cmd'));
    assert.equal(await whichAsync('node', env, 'win32'), join(dir, 'node.exe'));
    assert.equal(which('node.exe', env, 'win32'), join(dir, 'node.exe'), 'a name with an extension is not extended again');
    assert.equal(which('script', env, 'win32'), null, 'an extension outside PATHEXT does not run');
    assert.equal(which('dflt', { PATH: dir }, 'win32'), join(dir, 'dflt.CMD'), 'the default PATHEXT');
    assert.equal(which('claude', { Path: dir, PATHEXT: '.cmd' }, 'win32'), join(dir, 'claude.cmd'), 'Windows spells it Path');
    assert.equal(which('claude', { PATH: `"${dir}"`, PATHEXT: '.cmd' }, 'win32'), join(dir, 'claude.cmd'), 'a quoted folder');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('detectTools: sync and async find the same AI tools through PATH, without starting a process', { skip: !posix }, async () => {
  const dir = fixture(['claude', 'code']);
  const env = { PATH: dir };
  try {
    const found = await detectToolsAsync(env);
    assert.equal(found.claude, true);
    assert.equal(found.vscode, true); // its command is `code`
    assert.equal(found.codex, false);
    assert.equal(found.gemini, false);
    assert.equal(found.chat, true); // no command: always there
    const saved = process.env.PATH;
    process.env.PATH = dir;
    try { assert.deepEqual(detectTools(), found); } finally { process.env.PATH = saved; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PATH: the shell is read asynchronously and the same way as the blocking read, markers and noise included', { skip: !posix }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-shell-'));
  const shell = join(dir, 'fake-shell');
  writeFileSync(shell, "#!/bin/sh\nprintf 'rc noise __MOKI_PATH__/fresh/bin:/usr/bin__MOKI_PATH__ more noise'\n");
  chmodSync(shell, 0o755);
  const saved = { shell: process.env.SHELL };
  try {
    assert.equal(await shellPathAsync(shell), '/fresh/bin:/usr/bin');
    assert.equal(shellPath(shell), '/fresh/bin:/usr/bin');
    assert.equal(await shellPathAsync(join(dir, 'missing-shell')), '', 'a shell that cannot start gives no PATH');

    // fixToolPath: does not block, joins calls made meanwhile, and pathReady waits for it.
    process.env.SHELL = shell;
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
    assert.equal(pathPending(), false);
    await pathReady(); // nothing running: at once
    const first = fixToolPath('linux', env, '/nonexistent-home');
    assert.equal(pathPending(), true);
    assert.equal(fixToolPath('linux', env, '/nonexistent-home'), first, 'a second call shares the read that is running');
    assert.equal(env.PATH, '/usr/bin', 'the PATH changes only when the read ends');
    await pathReady();
    assert.ok(env.PATH?.startsWith('/fresh/bin:/usr/bin'), env.PATH); // then the usual tool folders that exist here
    assert.equal(pathPending(), false);
  } finally {
    if (saved.shell === undefined) delete process.env.SHELL; else process.env.SHELL = saved.shell;
    rmSync(dir, { recursive: true, force: true });
  }
});
