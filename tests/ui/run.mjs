// Runs a command with the Moki window kept off the person's screen (see tests/ui/launch.ts).
// Linux: under Xvfb (xvfb-run); never falls back to the real display. Windows and macOS: runs
// directly with QA_UI_HEADLESS=1. `npm run test:ui` = build, then this with the Playwright CLI.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../../scripts/lib/repo.mjs';

// Runs `node <args>` headless and returns its exit code.
export function runHeadless(nodeArgs) {
  const env = { ...process.env, QA_UI_HEADLESS: '1' };
  delete env.PWDEBUG;
  delete env.DEBUG;
  let command = process.execPath;
  let args = nodeArgs;
  if (process.platform === 'linux') {
    if (spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).error) {
      console.error('xvfb-run was not found. Install Xvfb (Debian/Ubuntu: apt install xvfb; Fedora: dnf install xorg-x11-server-Xvfb). The tests never run on your real screen.');
      return 1;
    }
    env.QA_REAL_DISPLAY = process.env.DISPLAY ?? '';
    delete env.WAYLAND_DISPLAY;
    env.XDG_SESSION_TYPE = 'x11';
    args = ['-a', '-s', '-screen 0 1920x1080x24', command, ...nodeArgs];
    command = 'xvfb-run';
  }
  return spawnSync(command, args, { cwd: ROOT, env, stdio: 'inherit' }).status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  process.exit(runHeadless([cli, 'test', '-c', 'tests/ui/playwright.config.ts', ...process.argv.slice(2)]));
}
