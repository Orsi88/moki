// Builds the VS Code extension (Moki light) in ide/vscode/dist: the extension host, the
// Moki MCP server (ide/mcp/server.ts) and the tool runner with esbuild, the Moki panel
// (app/companion.html, with Vite, into dist/webview) with the cats and the logo it shows,
// and the same framework files the installer ships (package.json build.extraResources).
// The full desktop UI is not part of it.
// Usage: npm run vscode:build   (npm run vscode:package also makes release/moki-<version>.vsix)

import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './lib/repo.mjs';

const ext = join(ROOT, 'ide', 'vscode');
const out = join(ext, 'dist');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ext, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  console.error(`ide/vscode/package.json has version ${manifest.version}; set it to ${pkg.version} (package.json).`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
// CommonJS for VS Code; import.meta.url (repo.mjs, core.ts) becomes the built file's URL.
const host = {
  bundle: true, platform: 'node', target: 'node20', format: 'cjs', sourcemap: false, logLevel: 'warning', external: ['vscode', 'electron', 'node-pty'],
  define: { 'import.meta.url': '__importMetaUrl' }, banner: { js: 'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
};
await esbuild({ ...host, entryPoints: [join(ext, 'extension.ts')], outfile: join(out, 'extension.cjs'), external: [...host.external, './host.cjs'] });
await esbuild({ ...host, entryPoints: [join(ext, 'host.ts')], outfile: join(out, 'host.cjs') });
// The MCP server runs in its own process (VS Code starts it with ELECTRON_RUN_AS_NODE).
await esbuild({ ...host, entryPoints: [join(ROOT, 'ide', 'mcp', 'server.ts')], outfile: join(out, 'mcp.cjs') });
// Windows terminals start the AI tools through the tool runner (desktop/launcher.ts).
await esbuild({ bundle: true, platform: 'node', target: 'node22', format: 'esm', logLevel: 'warning', entryPoints: [join(ROOT, 'desktop', 'run-tool.ts')], outfile: join(out, 'run-tool.mjs') });
// The Moki panel: the app's look, its own small page.
await viteBuild({ configFile: join(ROOT, 'app', 'vite.companion.config.ts'), logLevel: 'warn' });
cpSync(join(ROOT, 'app', 'public', 'cats'), join(out, 'webview', 'cats'), { recursive: true });
cpSync(join(ROOT, 'app', 'public', 'favicon.svg'), join(out, 'webview', 'favicon.svg'));
cpSync(join(ROOT, 'app', 'public', 'icon.png'), join(out, 'icon.png'));
// Identifies this build, so an installed extension refreshes its framework files once per build.
writeFileSync(join(out, 'build-info.json'), JSON.stringify({ buildId: new Date().toISOString() }));
cpSync(join(ROOT, 'LICENSE'), join(ext, 'LICENSE'));
mkdirSync(join(ROOT, 'release'), { recursive: true });

// The framework copy, from the same list as the installer. The full package.json
// (npm scripts used by the skills) goes in place of build/framework-package.json.
// ponytail: filters are only "<folder>/**" today; a glob matcher if other patterns appear.
for (const { from, to, filter } of pkg.build.extraResources) {
  const base = from === 'build/framework-package.json' ? join(ROOT, 'package.json') : join(ROOT, from);
  const keep = (src) => {
    const rel = relative(base, src).split(sep).join('/');
    return !rel || filter.some((p) => `${rel}/`.startsWith(p.slice(0, -2)));
  };
  cpSync(base, join(out, to), { recursive: true, filter: filter ? keep : undefined });
}

console.log('VS Code extension built: ide/vscode/dist.');
