import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileGrants, parseRange, servable, type Served } from '../desktop/file-protocol.ts';
import { IMAGE_LIMIT, OFFICE_LIMIT } from '../desktop/fs-guard.ts';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'moki-file-')));
const proj = join(root, 'ws', 'projects', 'acme');
const other = join(root, 'ws', 'projects', 'beta');
const linked = join(root, 'repo'); // a project's linked folder: a second base
const outside = join(root, 'outside');
const BODY = Buffer.from('0123456789'.repeat(10)); // 100 bytes
let workspace = 'ws-1';
const bases: Record<string, string[]> = { acme: [proj, linked], beta: [other] };
const files = createFileGrants({ workspace: () => workspace, bases: (p) => bases[p] ?? null });
const served: Served[] = [];
const get = async (url: string | null, range: string | null = null, method = 'GET') => { const r = await files.serve(method, url ?? 'moki-file://none/', range); served.push(r); return r; };
// A body a test did not read is closed here (the app's Response reads or cancels it), so no file handle is left open.
afterEach(() => { for (const r of served.splice(0)) if (r.body && typeof r.body !== 'string') r.body.destroy(); });

async function read(r: Served): Promise<Buffer> {
  if (r.body === undefined) return Buffer.alloc(0);
  if (typeof r.body === 'string') return Buffer.from(r.body);
  const chunks: Buffer[] = [];
  for await (const c of r.body) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}
const grant = (file: string, project = 'acme', scope = 1) => files.grant(scope, project, file);
const NOT_FOUND = await get('moki-file://' + '0'.repeat(48) + '/').then(async (r) => ({ status: r.status, headers: r.headers, body: (await read(r)).toString() }));

before(() => {
  for (const d of [proj, other, linked, outside]) mkdirSync(d, { recursive: true });
  writeFileSync(join(proj, 'report.pdf'), BODY);
  writeFileSync(join(proj, 'pic.png'), BODY);
  writeFileSync(join(proj, 'notes.txt'), BODY);
  writeFileSync(join(proj, 'run.exe'), BODY);
  writeFileSync(join(linked, 'doc.pdf'), BODY);
  writeFileSync(join(other, 'beta.pdf'), BODY);
  writeFileSync(join(outside, 'secret.pdf'), 'secret');
  symlinkSync(join(outside, 'secret.pdf'), join(proj, 'link.pdf'));
  symlinkSync(outside, join(proj, 'dir'));
  mkdirSync(join(proj, 'folder.pdf'));
  writeFileSync(join(proj, 'big.pdf'), '');
  truncateSync(join(proj, 'big.pdf'), OFFICE_LIMIT + 1); // sparse: costs nothing on disk
  writeFileSync(join(proj, 'big.png'), '');
  truncateSync(join(proj, 'big.png'), IMAGE_LIMIT + 1);
  writeFileSync(join(proj, 'edge.pdf'), '');
  truncateSync(join(proj, 'edge.pdf'), OFFICE_LIMIT);
});
after(() => rmSync(root, { recursive: true, force: true }));

const same404 = async (r: Served, method = 'GET') => {
  assert.deepEqual({ status: r.status, headers: r.headers, body: (await read(r)).toString() }, method === 'HEAD' ? { ...NOT_FOUND, body: '' } : NOT_FOUND);
};

test('moki-file serves the whole file with its type, length and Accept-Ranges, and HEAD answers the same without a body', async () => {
  const url = grant(join(proj, 'report.pdf'));
  assert.match(url ?? '', /^moki-file:\/\/[0-9a-f]{48}\/$/);
  const r = await get(url);
  assert.equal(r.status, 200);
  assert.equal(r.headers['Content-Type'], 'application/pdf');
  assert.equal(r.headers['Content-Length'], '100');
  assert.equal(r.headers['Accept-Ranges'], 'bytes');
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.match(r.headers['Access-Control-Expose-Headers'], /Content-Range/);
  assert.deepEqual(await read(r), BODY);
  const h = await get(url, null, 'HEAD');
  assert.equal(h.status, 200);
  assert.deepEqual(h.headers, r.headers);
  assert.equal(h.body, undefined);
  const png = await get(grant(join(proj, 'pic.png')));
  assert.equal(png.headers['Content-Type'], 'image/png');
  await read(png);
});

test('moki-file answers a single Range with 206 and exactly those bytes', async () => {
  const url = grant(join(proj, 'report.pdf'));
  for (const [range, from, to] of [['bytes=0-9', 0, 9], ['bytes=90-', 90, 99], ['bytes=-10', 90, 99], ['bytes=95-500', 95, 99], ['bytes=-500', 0, 99], ['bytes=5-5', 5, 5]] as const) {
    const r = await get(url, range);
    assert.equal(r.status, 206, range);
    assert.equal(r.headers['Content-Range'], `bytes ${from}-${to}/100`, range);
    assert.equal(r.headers['Content-Length'], String(to - from + 1), range);
    assert.deepEqual(await read(r), BODY.subarray(from, to + 1), range);
  }
  const head = await get(url, 'bytes=10-19', 'HEAD');
  assert.equal(head.status, 206);
  assert.equal(head.headers['Content-Range'], 'bytes 10-19/100');
  assert.equal(head.body, undefined);
});

test('moki-file answers an invalid or unsatisfiable Range with 416 and Content-Range */size', async () => {
  const url = grant(join(proj, 'report.pdf'));
  for (const range of ['bytes=5-2', 'bytes=100-', 'bytes=999-', 'bytes=-0', 'bytes=abc', 'bytes=-', 'bytes=1-2-3', 'bytes=99999999999999999999-']) {
    const r = await get(url, range);
    assert.equal(r.status, 416, range);
    assert.equal(r.headers['Content-Range'], 'bytes */100', range);
    assert.equal(r.body, undefined);
  }
});

test('moki-file ignores a multiple Range or another unit and sends the whole file (a valid reply)', async () => {
  const url = grant(join(proj, 'report.pdf'));
  for (const range of ['bytes=0-1,5-6', 'bytes=0-1, 50-', 'items=0-5', '']) {
    const r = await get(url, range);
    assert.equal(r.status, 200, range);
    assert.deepEqual(await read(r), BODY, range);
  }
});

test('parseRange covers the forms of a single range and an empty file', () => {
  assert.deepEqual(parseRange(null, 10), 'all');
  assert.deepEqual(parseRange('bytes=2-4', 10), { start: 2, end: 4 });
  assert.deepEqual(parseRange(' Bytes = 2 - 4 ', 10), { start: 2, end: 4 });
  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=0-', 10), { start: 0, end: 9 });
  assert.equal(parseRange('bytes=0-0', 0), 'invalid');
  assert.equal(parseRange('bytes=-1', 0), 'invalid');
  assert.equal(parseRange('bytes=10-', 10), 'invalid');
});

test('moki-file serves an empty file whole, without a body', async () => {
  writeFileSync(join(proj, 'empty.pdf'), '');
  const r = await get(grant(join(proj, 'empty.pdf')));
  assert.equal(r.status, 200);
  assert.equal(r.headers['Content-Length'], '0');
  assert.equal(r.body, undefined);
  assert.equal((await get(grant(join(proj, 'empty.pdf')), 'bytes=0-0')).status, 416);
});

test('moki-file refuses to grant anything outside the project: .., absolute paths, symlinks out, other projects', () => {
  assert.equal(grant(join(proj, '..', '..', '..', 'outside', 'secret.pdf')), null);
  assert.equal(grant(join(outside, 'secret.pdf')), null);
  assert.equal(grant('/etc/passwd'), null);
  assert.equal(grant(join(proj, 'link.pdf')), null, 'a symlink to a file outside');
  assert.equal(grant(join(proj, 'dir', 'secret.pdf')), null, 'a symlink to a folder outside');
  assert.equal(grant(join(other, 'beta.pdf'), 'acme'), null, 'a file of another project');
  assert.equal(grant(join(proj, 'report.pdf'), 'nobody'), null, 'a project that does not exist');
  assert.ok(grant(join(linked, 'doc.pdf')), 'the linked folder is part of the project');
  assert.ok(grant(join(proj, '..', 'acme', 'report.pdf')), 'a .. that stays inside resolves to the same file');
});

test('moki-file refuses to grant what is not a PDF or image, not a file, missing or over the size limit', () => {
  for (const name of ['notes.txt', 'run.exe', 'folder.pdf', 'missing.pdf', 'big.pdf', 'big.png']) assert.equal(grant(join(proj, name)), null, name);
  assert.ok(grant(join(proj, 'edge.pdf')), 'exactly at the limit is allowed, as in readFile');
  assert.deepEqual([servable('a.PDF')?.limit, servable('a.svg')?.limit, servable('a.docx')], [OFFICE_LIMIT, IMAGE_LIMIT, null]);
});

test('every request that names no servable file gets the same 404', async () => {
  const live = grant(join(proj, 'report.pdf')) as string;
  const token = live.slice('moki-file://'.length, -1);
  for (const url of [
    'moki-file://' + 'f'.repeat(48) + '/', 'moki-file://abc/', 'moki-file:///', 'moki-file://', 'not a url', 'file:///etc/passwd', 'http://example.com/',
    'moki-file://../etc/passwd', 'moki-file://%2e%2e/%2e%2e/etc/passwd', 'moki-file:///etc/passwd', 'moki-file://..\\..\\windows\\win.ini',
    `moki-file://${token.toUpperCase()}/`, `moki-file://${token}x/`, `moki-file://${token.slice(1)}/`,
  ]) await same404(await get(url), 'GET');
  await same404(await get('moki-file://../x', null, 'HEAD'), 'HEAD');
});

test('the path after the token is ignored: it never selects a file', async () => {
  const live = grant(join(proj, 'report.pdf')) as string;
  for (const suffix of ['../../../outside/secret.pdf', '%2e%2e/secret.pdf', '..%5c..%5csecret.pdf', 'pic.png', '?x=/etc/passwd']) {
    const r = await get(live + suffix);
    assert.equal(r.status, 200, suffix);
    assert.deepEqual(await read(r), BODY, suffix);
  }
});

test('only GET and HEAD are served', async () => {
  const url = grant(join(proj, 'report.pdf'));
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const r = await get(url, null, method);
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.Allow, 'GET, HEAD');
    assert.equal(r.body, undefined);
  }
});

test('a symlink put in the file\'s place after the grant stops it being served', async () => {
  writeFileSync(join(proj, 'swap.pdf'), BODY);
  const url = grant(join(proj, 'swap.pdf'));
  assert.equal((await get(url)).status, 200);
  unlinkSync(join(proj, 'swap.pdf'));
  symlinkSync(join(outside, 'secret.pdf'), join(proj, 'swap.pdf'));
  await same404(await get(url));
  unlinkSync(join(proj, 'swap.pdf'));
  await same404(await get(url));
});

test('a file that grew past the limit, became a folder or vanished stops being served', async () => {
  writeFileSync(join(proj, 'grow.png'), BODY);
  const url = grant(join(proj, 'grow.png'));
  assert.equal((await get(url, 'bytes=0-1')).status, 206);
  truncateSync(join(proj, 'grow.png'), IMAGE_LIMIT + 1);
  await same404(await get(url));
  rmSync(join(proj, 'grow.png'));
  await same404(await get(url));
});

test('a grant dies with its window, and does not touch another window\'s', async () => {
  const a = files.grant(10, 'acme', join(proj, 'report.pdf')) as string;
  const b = files.grant(11, 'acme', join(proj, 'report.pdf')) as string;
  assert.notEqual(a, b, 'each window has its own token');
  assert.equal(files.count(10), 1);
  files.revokeScope(10);
  assert.equal(files.count(10), 0);
  await same404(await get(a));
  assert.equal((await get(b)).status, 200);
  files.revokeScope(11);
  await same404(await get(b));
});

test('a window that moves to another project loses what it was given for the others', async () => {
  const a = files.grant(20, 'acme', join(proj, 'report.pdf')) as string;
  const b = files.grant(20, 'beta', join(other, 'beta.pdf')) as string;
  const c = files.grant(21, 'acme', join(proj, 'report.pdf')) as string;
  files.revokeOutside(20, 'beta');
  await same404(await get(a));
  assert.equal((await get(b)).status, 200);
  assert.equal((await get(c)).status, 200, 'another window is not touched');
  files.revokeScope(20);
  files.revokeScope(21);
});

test('a project that disappears, or another workspace being opened, stops every grant', async () => {
  const url = grant(join(proj, 'report.pdf'), 'acme', 30) as string;
  assert.equal((await get(url)).status, 200);
  workspace = 'ws-2';
  await same404(await get(url));
  workspace = 'ws-1';
  assert.equal((await get(url)).status, 200);
  const saved = bases.acme;
  delete bases.acme;
  await same404(await get(url));
  bases.acme = saved;
  files.revokeScope(30);
});

test('the same file and stamp keep one token; a changed file gets a new one; a window holds a bounded number', async () => {
  writeFileSync(join(proj, 'v.pdf'), 'one');
  const first = grant(join(proj, 'v.pdf'), 'acme', 40);
  assert.equal(grant(join(proj, 'v.pdf'), 'acme', 40), first);
  writeFileSync(join(proj, 'v.pdf'), 'three');
  const second = grant(join(proj, 'v.pdf'), 'acme', 40);
  assert.notEqual(second, first);
  assert.equal((await get(second)).status, 200);
  for (let i = 0; i < 100; i++) { writeFileSync(join(proj, 'v.pdf'), 'x'.repeat(i + 10)); grant(join(proj, 'v.pdf'), 'acme', 40); }
  assert.equal(files.count(40), 64, 'the oldest grants are dropped');
  await same404(await get(first));
  files.revokeScope(40);
  assert.equal(files.count(40), 0);
});

test('tokens are 192 random bits in hex and never repeat', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    writeFileSync(join(proj, 't.pdf'), 'y'.repeat(i + 1));
    seen.add(grant(join(proj, 't.pdf'), 'acme', 50) as string);
  }
  assert.equal(seen.size, 50);
  for (const u of seen) assert.match(u, /^moki-file:\/\/[0-9a-f]{48}\/$/);
  files.revokeScope(50);
});
