// Builds the desktop app: the UI with Vite (app/dist) and the Electron main
// process, preload bridge and tool runner with esbuild (app/dist-electron).
// Usage: npm run app:build

import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/repo.mjs';

const out = join(ROOT, 'app', 'dist-electron');
rmSync(out, { recursive: true, force: true });

await viteBuild({ configFile: join(ROOT, 'app', 'vite.config.ts'), logLevel: 'warn' });

// node-pty is native: it is not bundled but shipped as a module next to the app.
// pdf.js tries to load the native @napi-rs/canvas at import; inside Electron 43 it crashes the
// process (SIGTRAP). Moki only reads annotations and text, so pdf.js runs without it.
const noCanvas = { name: 'no-napi-canvas', setup: (b) => b.onLoad({ filter: /pdfjs-dist[\\/].*pdf\.mjs$/ }, (a) => ({ contents: readFileSync(a.path, 'utf8').replaceAll('require("@napi-rs/canvas")', 'require("moki-no-canvas")'), loader: 'js' })) };
const common = { plugins: [noCanvas], bundle: true, platform: 'node', target: 'node22', sourcemap: false, logLevel: 'warning', external: ['electron', 'node-pty'] };
await esbuild({ ...common, entryPoints: [join(ROOT, 'desktop', 'boot.ts')], outfile: join(out, 'boot.mjs'), format: 'esm', external: ['electron', './main.mjs'] });
await esbuild({ ...common, entryPoints: [join(ROOT, 'desktop', 'main.ts')], outfile: join(out, 'main.mjs'), format: 'esm' });
await esbuild({ ...common, entryPoints: [join(ROOT, 'desktop', 'preload.ts')], outfile: join(out, 'preload.cjs'), format: 'cjs' });
await esbuild({ ...common, entryPoints: [join(ROOT, 'desktop', 'run-tool.ts')], outfile: join(out, 'run-tool.mjs'), format: 'esm' });
// Moki's MCP server for the AI tools the app starts (desktop/service.ts mokiServer).
await esbuild({ ...common, entryPoints: [join(ROOT, 'ide', 'mcp', 'server.ts')], outfile: join(out, 'mcp.mjs'), format: 'esm' });
// One picture of each diagram in an exported PDF. The installed framework has no
// node_modules, so the browser bundle ships next to scripts/lib/diagram-images.mjs.
await esbuild({
  entryPoints: [join(ROOT, 'scripts', 'lib', 'diagram-frame.mjs')],
  bundle: true, format: 'iife', platform: 'browser', legalComments: 'none', logLevel: 'warning',
  outfile: join(ROOT, 'scripts', 'lib', 'diagram-frame.iife.js'),
});

// Identifies this build, so an installed app refreshes its framework files once per build.
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'build-info.json'), JSON.stringify({ buildId: new Date().toISOString() }));

// Staging folder for the installer (electron-builder two-package.json layout):
// only the built app and a minimal package.json, no development files.
const stage = join(ROOT, 'build', 'app');
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'app'), { recursive: true });
cpSync(join(ROOT, 'app', 'dist'), join(stage, 'app', 'dist'), { recursive: true });
cpSync(out, join(stage, 'app', 'dist-electron'), { recursive: true });
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const hasPty = existsSync(join(ROOT, 'node_modules', 'node-pty', 'package.json'));
writeFileSync(join(stage, 'package.json'), JSON.stringify({
  name: pkg.name, productName: 'Moki', version: pkg.version, description: pkg.description,
  author: pkg.author, license: pkg.license, type: 'module', main: 'app/dist-electron/boot.mjs',
  optionalDependencies: hasPty ? pkg.optionalDependencies : undefined,
}, null, 2));
// node-pty (terminal tabs) with its binaries: prebuilt for Windows/macOS, built by npm install
// on Linux (needs a C++ compiler). N-API, so no rebuild for Electron. Sources and debug symbols
// are left out. Without it the app opens the AI tools in external terminal windows.
if (hasPty) {
  for (const mod of ['node-pty', 'node-addon-api']) {
    cpSync(join(ROOT, 'node_modules', mod), join(stage, 'node_modules', mod), {
      recursive: true,
      filter: (src) => !/([\\/](src|deps|third_party|obj\.target|\.deps)|\.pdb)$/.test(src),
    });
  }
} else {
  console.warn('node-pty is not installed: this build opens the AI tools in external terminal windows instead of tabs.');
}

// The framework copy shipped with the installer gets the full package.json (npm scripts
// used by the skills). A different file name avoids clashing with the app's own one.
cpSync(join(ROOT, 'package.json'), join(ROOT, 'build', 'framework-package.json'));

console.log('Desktop app built: app/dist (UI), app/dist-electron (main process) and build/app (installer staging).');
