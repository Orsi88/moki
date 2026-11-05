// "My AIs" in Settings: what Moki can tell about each AI tool (version) and the Moki
// extension in the editors that take it (TOOLS mokiExtension). The .vsix is the one of
// the app's own version: in a checkout, release/moki-<version>.vsix when it was built;
// otherwise the asset of the Moki release, downloaded only when GitHub vouches for its
// SHA-256 (desktop/craft-download.ts). Commands come from the TOOLS table and arguments
// are fixed or a path Moki made: no user text reaches a command line.

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { MOKI_EXTENSION_ID, TOOLS, type ToolKey } from '../scripts/lib/core.ts';
import { checksum, download, releaseByTag } from './craft-download.ts';

export const MOKI_RELEASES = { id: 'moki', label: 'Moki', repo: 'Orsi88/moki' };
const VERSION_TIMEOUT_MS = 5000;
const INSTALL_TIMEOUT_MS = 120_000;

// Runs a command and resolves its output (null when it fails or times out). Tests pass a fake.
export type RunCommand = (command: string, args: string[], timeout: number) => Promise<string | null>;

// Windows: the tools are .cmd shims or extensionless scripts, which only the shell starts; the
// command is a fixed name and each argument is quoted (paths Moki made, never containing ").
export const runCommand: RunCommand = (command, args, timeout) => new Promise((done) => {
  const win = process.platform === 'win32';
  const file = win ? [command, ...args.map((a) => `"${a}"`)].join(' ') : command;
  execFile(file, win ? [] : args, { timeout, windowsHide: true, shell: win, encoding: 'utf8' }, (error, stdout) => done(error ? null : stdout));
});

// First line of `<tool> --version`, '' when the tool does not say.
export async function toolVersion(tool: ToolKey, run: RunCommand = runCommand): Promise<string> {
  const command = TOOLS[tool].command;
  if (!command) return '';
  const out = await run(command, ['--version'], VERSION_TIMEOUT_MS);
  return (out ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 80) ?? '';
}

// The Moki extension's version installed in the editor, '' when it is not installed.
export async function extensionVersion(tool: ToolKey, run: RunCommand = runCommand): Promise<string> {
  const command = TOOLS[tool].command;
  if (!command || !TOOLS[tool].mokiExtension) return '';
  const out = await run(command, ['--list-extensions', '--show-versions'], VERSION_TIMEOUT_MS * 2);
  const line = (out ?? '').split(/\r?\n/).find((l) => l.trim().toLowerCase().startsWith(`${MOKI_EXTENSION_ID}@`));
  return line ? line.trim().slice(MOKI_EXTENSION_ID.length + 1) : '';
}

// The .vsix to install and whether it is a temporary download (to remove afterwards).
export async function mokiVsix(root: string, version: string, tmp: string, doFetch: typeof fetch = fetch): Promise<{ file: string; temporary: boolean }> {
  const name = `moki-${version}.vsix`;
  const built = join(root, 'release', name);
  if (existsSync(built)) return { file: built, temporary: false };
  const release = await releaseByTag(MOKI_RELEASES, `v${version}`, doFetch);
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) throw new Error(`The Moki ${release.tag} release has no ${name}. See ${release.page}.`);
  const choice = { release, asset, url: `https://github.com/${MOKI_RELEASES.repo}/releases/download/${release.tag}/${name}` };
  const sha256 = await checksum(MOKI_RELEASES, choice, doFetch);
  if (!sha256) throw new Error(`The Moki ${release.tag} release publishes no SHA-256 for ${name}, and Moki does not install a file nothing vouches for.`);
  const file = join(tmp, name);
  await download(choice, sha256, file, doFetch);
  return { file, temporary: true };
}

// `<editor> --install-extension <file> --force`; the temporary download is removed either way.
export async function installExtension(tool: ToolKey, vsix: { file: string; temporary: boolean }, run: RunCommand = runCommand): Promise<void> {
  const { command, label } = TOOLS[tool];
  try {
    if (!command || !TOOLS[tool].mokiExtension) throw new Error(`${label} does not take the Moki extension.`);
    const out = await run(command, ['--install-extension', vsix.file, '--force'], INSTALL_TIMEOUT_MS);
    if (out === null) throw new Error(`${label} could not install the Moki extension. Try again, or install the .vsix of https://github.com/${MOKI_RELEASES.repo}/releases by hand.`);
  } finally {
    if (vsix.temporary) rmSync(vsix.file, { force: true });
  }
}
