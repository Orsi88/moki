// The one place that starts Moki for a UI test or the memory battery. Electron has no
// headless mode, so on Linux the window lives on a virtual X display (Xvfb, started by
// tests/ui/run.mjs) and never reaches the person's screen. This refuses to start anywhere else.

import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { createRequire } from 'node:module';
import { ROOT } from '../../scripts/lib/repo.mjs';

const electronPath = createRequire(import.meta.url)('electron') as string;

// extra: environment for the app; an undefined value removes the variable.
export async function launchMoki(extra: Record<string, string | undefined> = {}): Promise<ElectronApplication> {
  if (process.env.QA_UI_HEADLESS !== '1') throw new Error('Run the UI tests through "npm run test:ui" (headless): QA_UI_HEADLESS=1 is not set.');
  const linux = process.platform === 'linux';
  if (linux) {
    if (!process.env.DISPLAY) throw new Error('No virtual display: run through "npm run test:ui" (Xvfb).');
    if (process.env.DISPLAY === process.env.QA_REAL_DISPLAY) throw new Error(`DISPLAY=${process.env.DISPLAY} is the real screen: the window would show. Run through "npm run test:ui" (Xvfb).`);
    if (process.env.WAYLAND_DISPLAY) throw new Error('WAYLAND_DISPLAY is set: the window could show on the real screen. Run through "npm run test:ui" (Xvfb).');
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  delete env.QA_SCREENSHOT;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PWDEBUG;
  for (const [key, value] of Object.entries(extra)) { if (value === undefined) delete env[key]; else env[key] = value; }
  return electron.launch({ executablePath: electronPath, cwd: ROOT, args: linux ? ['--ozone-platform=x11', ROOT] : [ROOT], env, timeout: 60_000 });
}
