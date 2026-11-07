// The moki-file:// protocol: how the app shows a PDF or an image without its bytes crossing the IPC or living in the
// renderer. A call from the UI to readFile gets a capability URL, moki-file://<token>/ (a random 192-bit token the main
// process mapped to one file it had already resolved inside the project); pdf.js, <img> and the native PDF viewer then
// read that URL, with Range, straight from disk.
//
// Why a capability and not a path: protocol.handle gets only the Request, no frame, so the sender cannot be checked as
// qa:call does (trusted(event)). The token is the proof: it is handed over IPC to the window that asked, only for a
// file its project/workspace allows, and it dies with that window (revokeScope), with the project (revokeOutside) or
// with the workspace (checked on every request). A window cannot use a token it was not given because it cannot guess it.
//
// Pure of Electron (main.ts wires it): GET/HEAD only, PDF and the image types only, within the size limits readFile
// has (desktop/fs-guard.ts), no directory listing, the real path re-resolved on every request, and one 404 for every way
// a request can fail to name a servable file.

import { randomBytes } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import type { Readable } from 'node:stream';
import { IMAGE_LIMIT, IMAGE_TYPES, OFFICE_LIMIT, resolveInside } from './fs-guard.ts';

export const FILE_SCHEME = 'moki-file';
const TOKEN = /^[0-9a-f]{48}$/; // hex only: a standard scheme lowercases the host
const MAX_PER_SCOPE = 64; // grants one window keeps; the oldest goes first

export interface Served { status: number; headers: Record<string, string>; body?: Readable | string }
export interface FileGrantDeps {
  workspace: () => string; // the active workspace's folder
  bases: (project: string) => string[] | null; // folders a project's files may live in (its folder, its linked folder); null: no such project
}

// The type and size limit of what may be served (the PDF/image rules of readFile), by extension.
export function servable(file: string): { type: string; limit: number } | null {
  const ext = extname(file).toLowerCase();
  if (ext === '.pdf') return { type: 'application/pdf', limit: OFFICE_LIMIT };
  return IMAGE_TYPES[ext] ? { type: IMAGE_TYPES[ext], limit: IMAGE_LIMIT } : null;
}

// What a Range header asks of a file of `size` bytes. A single range (a-b, a-, -n) is honoured. 'all': no Range, another
// unit, or several ranges (ignored, not answered: the whole file is a valid reply and pdf.js asks one range at a time).
// 'invalid': malformed or beyond the end (the caller answers 416).
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'all' | 'invalid' {
  if (!header) return 'all';
  const m = /^\s*bytes\s*=(.*)$/i.exec(header);
  if (!m || m[1].includes(',')) return 'all';
  const spec = /^\s*(\d{0,15})\s*-\s*(\d{0,15})\s*$/.exec(m[1]);
  if (!spec || (!spec[1] && !spec[2])) return 'invalid';
  if (!spec[1]) { // the last n bytes
    const n = Number(spec[2]);
    return n === 0 || size === 0 ? 'invalid' : { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(spec[1]);
  const end = spec[2] ? Number(spec[2]) : size - 1;
  return start >= size || end < start ? 'invalid' : { start, end: Math.min(end, size - 1) };
}

interface Grant { scope: number; project: string; workspace: string; file: string; key: string }

export function createFileGrants(deps: FileGrantDeps) {
  const grants = new Map<string, Grant>(); // token -> grant
  const scopes = new Map<number, Map<string, string>>(); // scope (a window) -> key (file and stamp) -> token, oldest first

  // Real path inside one of the project's folders (symlinks followed, as resolveInside does for every path of the app).
  const confined = (project: string, file: string): boolean => (deps.bases(project) ?? []).some((base) => {
    try { return resolveInside(base, relative(realpathSync(base), file)) === file; } catch { return false; }
  });
  const drop = (token: string) => {
    const g = grants.get(token);
    grants.delete(token);
    if (g) scopes.get(g.scope)?.delete(g.key);
  };

  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    'Cache-Control': 'no-store', // the file can change under the same URL's life
    'X-Content-Type-Options': 'nosniff',
    // The page is file:// (opaque origin) and pdf.js reads from a worker: CORS must allow it, and expose what it reads. The token is the secret.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length',
    ...extra,
  });
  const notFound = (method: string): Served => ({ status: 404, headers: headers({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': '9' }), body: method === 'HEAD' ? undefined : 'Not found' });

  return {
    // The URL for `file` (a path the service resolved) for one window, or null when it is not servable: not inside the
    // project, not a PDF/image, not a file, or over the limit. The same file with the same size and time keeps its URL.
    grant(scope: number, project: string, file: string): string | null {
      const kind = servable(file);
      if (!kind) return null;
      let real: string;
      let key: string;
      try {
        real = realpathSync(file);
        if (!confined(project, real)) return null;
        const stat = statSync(real);
        if (!stat.isFile() || stat.size > kind.limit) return null;
        key = `${project}\0${real}\0${stat.size}\0${stat.mtimeMs}`;
      } catch { return null; }
      const mine = scopes.get(scope) ?? new Map<string, string>();
      scopes.set(scope, mine);
      let token = mine.get(key);
      if (!token) {
        token = randomBytes(24).toString('hex');
        grants.set(token, { scope, project, workspace: deps.workspace(), file: real, key });
        mine.set(key, token);
        if (mine.size > MAX_PER_SCOPE) drop(mine.values().next().value as string);
      }
      return `${FILE_SCHEME}://${token}/`;
    },

    // The window closed: every URL it was given stops working.
    revokeScope(scope: number): void { for (const token of [...(scopes.get(scope)?.values() ?? [])]) drop(token); scopes.delete(scope); },
    // The window moved to another project: what it was given for the others stops working.
    revokeOutside(scope: number, keep: string): void {
      for (const token of [...(scopes.get(scope)?.values() ?? [])]) if (grants.get(token)?.project !== keep) drop(token);
    },
    count: (scope?: number): number => (scope === undefined ? grants.size : scopes.get(scope)?.size ?? 0),

    // One request. `range` is the Range header, if any. Nothing but GET and HEAD, and one 404 for every other failure.
    // ponytail: the real path is checked, then the file opened: a swap in between is a race this does not close (a file
    // inside the project folder is the user's own; the open file's size is what is served).
    async serve(method: string, url: string, range: string | null): Promise<Served> {
      if (method !== 'GET' && method !== 'HEAD') return { status: 405, headers: headers({ Allow: 'GET, HEAD', 'Content-Length': '0' }) };
      let token = '';
      try { const u = new URL(url); if (u.protocol === `${FILE_SCHEME}:`) token = u.hostname; } catch { /* not a URL */ }
      const g = TOKEN.test(token) ? grants.get(token) : undefined;
      const kind = g && servable(g.file);
      if (!g || !kind || g.workspace !== deps.workspace()) return notFound(method);
      let real: string;
      try { real = realpathSync(g.file); } catch { return notFound(method); }
      if (real !== g.file || !confined(g.project, real)) return notFound(method);
      const file = await open(real, 'r').catch(() => null);
      if (!file) return notFound(method);
      try {
        const { size, isFile } = await file.stat().then((s) => ({ size: s.size, isFile: s.isFile() }));
        if (!isFile || size > kind.limit) { await file.close(); return notFound(method); }
        const r = parseRange(range, size);
        if (r === 'invalid') { await file.close(); return { status: 416, headers: headers({ 'Content-Range': `bytes */${size}`, 'Content-Length': '0' }) }; }
        const part = r === 'all' ? null : r;
        const length = part ? part.end - part.start + 1 : size;
        const h = headers({ 'Content-Type': kind.type, 'Content-Length': String(length), 'Accept-Ranges': 'bytes', ...(part ? { 'Content-Range': `bytes ${part.start}-${part.end}/${size}` } : {}) });
        if (method === 'HEAD' || length === 0) { await file.close(); return { status: part ? 206 : 200, headers: h }; }
        return { status: part ? 206 : 200, headers: h, body: file.createReadStream({ start: part?.start ?? 0, end: part?.end ?? size - 1 }) }; // closes the file when done or cancelled
      } catch { await file.close().catch(() => {}); return notFound(method); }
    },
  };
}
