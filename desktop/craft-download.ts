// Download of an ArtCraft Launcher app (fixed list: CRAFT_APPS in scripts/lib/core.ts) from its GitHub release.
// Runs in the main process. Moki only downloads and verifies; it never installs or runs the file. The asset
// name comes from the release but must match SAFE, and the download URL is built here, never copied from the JSON.
// The SHA-256 comes from GitHub's own `digest` or from the release's SHA256SUMS.txt; with neither, nothing is downloaded.

import { createHash } from 'node:crypto';
import { createWriteStream, readFileSync, renameSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { linuxPackageFamily, pickCraftAssets, type CraftApp } from '../scripts/lib/core.ts';

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const API_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const MAX_BYTES = 1024 ** 3; // 1 GiB; the apps are about 100 MB
const SUMS = 'SHA256SUMS.txt';

type Fetch = typeof fetch;
export interface CraftAsset { name: string; size: number; digest: string }
export interface CraftRelease { tag: string; version: string; page: string; assets: CraftAsset[] }
export interface CraftChoice { release: CraftRelease; asset: CraftAsset; url: string }

const releasesPage = (app: CraftApp) => `https://github.com/${app.repo}/releases`;

async function get(url: string, doFetch: Fetch, onMissing: string, timeout = API_TIMEOUT_MS): Promise<Response> {
  let res: Response;
  try {
    res = await doFetch(url, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === 'TimeoutError'
      ? 'GitHub did not answer in time. Try again in a moment.'
      : 'Could not reach GitHub (api.github.com). Check the internet connection.');
  }
  if (res.status === 404) throw new Error(onMissing);
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is limiting requests from this computer. Try again in a few minutes.');
  if (!res.ok) throw new Error(`GitHub is unavailable right now (${res.status}). Try again in a moment.`);
  return res;
}

export async function latestRelease(app: CraftApp, doFetch: Fetch = fetch): Promise<CraftRelease> {
  const none = `${app.label} has no published release yet. See ${releasesPage(app)}.`;
  const data = await (await get(`https://api.github.com/repos/${app.repo}/releases/latest`, doFetch, none)).json() as { tag_name?: unknown; assets?: Record<string, unknown>[] };
  const tag = typeof data.tag_name === 'string' ? data.tag_name : '';
  if (!SAFE.test(tag) || !Array.isArray(data.assets)) throw new Error(none);
  const assets = data.assets.filter((a) => typeof a.name === 'string' && SAFE.test(a.name)).map((a) => ({
    name: String(a.name), size: Number(a.size) || 0, digest: typeof a.digest === 'string' ? a.digest : '',
  }));
  return { tag, version: tag.replace(/^v/, ''), page: `${releasesPage(app)}/tag/${tag}`, assets };
}

// Package family of this Linux ('rpm', 'deb' or ''), from /etc/os-release or /usr/lib/os-release; '' elsewhere or when unreadable.
export function systemFamily(platform: string): 'rpm' | 'deb' | '' {
  if (platform !== 'linux') return '';
  for (const file of ['/etc/os-release', '/usr/lib/os-release']) {
    try { return linuxPackageFamily(readFileSync(file, 'utf8')); } catch { /* try the next one */ }
  }
  return '';
}

// Every file offered for this system, recommended first, or the error that says there is none.
export function chooseAssets(app: CraftApp, release: CraftRelease, platform: string, arch: string, family: string): CraftChoice[] {
  const assets = pickCraftAssets(app, release.version, release.assets, platform, arch, family);
  if (!assets.length) throw new Error(`${app.label} ${release.tag} has no file for ${platform} ${arch}. See ${release.page}.`);
  return assets.map((asset) => ({ release, asset, url: `https://github.com/${app.repo}/releases/download/${release.tag}/${asset.name}` }));
}

// The offered file named `file` (only names of the list computed for this system), or the first when none is named.
export function chooseAsset(app: CraftApp, release: CraftRelease, platform: string, arch: string, family: string, file?: string): CraftChoice {
  const options = chooseAssets(app, release, platform, arch, family);
  if (file === undefined) return options[0];
  const hit = options.find((o) => o.asset.name === file);
  if (!hit) throw new Error(`${file} is not available for this system in ${release.tag}. Review the download again.`);
  return hit;
}

// GitHub's digest first, then the release's SHA256SUMS.txt. null = nothing vouches for the file.
export async function checksum(app: CraftApp, { release, asset }: CraftChoice, doFetch: Fetch = fetch): Promise<string | null> {
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest);
  if (digest) return digest[1].toLowerCase();
  if (!release.assets.some((a) => a.name === SUMS)) return null;
  const text = await (await get(`https://github.com/${app.repo}/releases/download/${release.tag}/${SUMS}`, doFetch, `${SUMS} not found.`)).text();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64}) [ *]?(.+)$/.exec(line.trim());
    if (m && m[2] === asset.name) return m[1].toLowerCase();
  }
  return null;
}

// Writes <dest>.part while hashing; <dest> exists only when the hash matches.
export async function download(choice: CraftChoice, sha256: string, dest: string, doFetch: Fetch = fetch): Promise<void> {
  const { asset, url } = choice;
  const part = `${dest}.part`;
  const folder = dirname(dest);
  try {
    const res = await get(url, doFetch, `${asset.name} is no longer available.`, DOWNLOAD_TIMEOUT_MS);
    if (!res.body) throw new Error('GitHub sent an empty answer. Try again in a moment.');
    const hash = createHash('sha256');
    const out = createWriteStream(part);
    const failed = new Promise<never>((_, reject) => out.once('error', reject));
    failed.catch(() => {}); // reported by the write below
    let bytes = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) throw new Error(`${asset.name} is larger than ${MAX_BYTES / 1024 ** 3} GB, so it was not downloaded.`);
        hash.update(chunk);
        if (!out.write(chunk)) await Promise.race([once(out, 'drain'), failed]);
      }
      out.end();
      await Promise.race([once(out, 'finish'), failed]);
    } finally { out.destroy(); }
    if (hash.digest('hex') !== sha256) throw new Error(`Integrity check failed for ${asset.name}. The file was removed.`);
    renameSync(part, dest);
  } catch (e) {
    rmSync(part, { force: true });
    throw explain(e, folder);
  }
}

function explain(e: unknown, folder: string): Error {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'EACCES' || code === 'EPERM') return new Error(`Could not save in ${folder}: permission denied. Choose another folder.`);
  if (code === 'ENOENT') return new Error(`Could not save in ${folder}: the folder does not exist. Choose another folder.`);
  if (code === 'ENOSPC') return new Error(`Not enough free space in ${folder}. Free some space or choose another folder.`);
  if (e instanceof Error && e.name === 'TimeoutError') return new Error('The download took too long and was cancelled. Try again.');
  if (e instanceof Error && (e.name === 'AbortError' || e instanceof TypeError || /terminated|aborted|ECONNRESET|socket/i.test(e.message))) {
    return new Error('The connection dropped during the download. Try again.');
  }
  return e instanceof Error ? e : new Error(String(e));
}
