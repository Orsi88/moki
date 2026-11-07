// Entry point of the desktop app. When installed (packaged), it prepares the
// framework folder in Documents/Moki and points QA_ROOT to it before
// the rest of the app loads. From a cloned repository it uses the repository.

import { app } from 'electron';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkTarget, syncFramework } from './framework.ts';
import { fixToolPath } from './tool-path.ts';

if (app.isPackaged) {
  const here = dirname(fileURLToPath(import.meta.url));
  const target = frameworkTarget(app.getPath('documents'));
  let buildId = app.getVersion();
  try { buildId = (JSON.parse(readFileSync(join(here, 'build-info.json'), 'utf8')) as { buildId: string }).buildId; } catch { /* use the version */ }
  syncFramework(join(process.resourcesPath, 'framework'), target, buildId);
  process.env.QA_ROOT = target;
}

// main.mjs is a separate built file next to this one; it must load after QA_ROOT is set.
const mainEntry = './main.mjs';
await import(mainEntry);

// Started from the app menu, the app does not get the terminal's PATH, so AI tools would look missing (desktop/tool-path.ts).
// Read in the background, after the app's code is loaded: detection and installs wait for it (pathReady), the window does not.
if (app.isPackaged) void fixToolPath();
