import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Worker } from 'node:worker_threads';
import { zip } from '../scripts/lib/zip.mjs';
import { parseOffice, type OfficeKind, type OfficeParsed } from '../desktop/parse-office.ts';
import { createParseClient } from '../desktop/parse-pool.ts';

const WORKER = new URL('../desktop/parse-worker.ts', import.meta.url);

const docx = (paragraphs = 3) => zip([['word/document.xml', `<w:document xmlns:w="x"><w:body>${
  Array.from({ length: paragraphs }, (_, i) => `<w:p><w:pPr><w:pStyle w:val="${i ? '' : 'Heading1'}"/></w:pPr><w:r><w:t>Paragraph ${i} with Renovação &amp; text</w:t></w:r></w:p>`).join('')
}</w:body></w:document>`]]);

const xlsx = (rows = 3) => zip([
  ['xl/workbook.xml', '<workbook><sheets><sheet name="Big" r:id="rId1"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml', `<sheetData>${
    Array.from({ length: rows }, (_, r) => `<row r="${r + 1}">${Array.from({ length: 6 }, (_, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}"${c % 2 ? '><v>' + (r * c + 0.5) + '</v>' : ' t="inlineStr"><is><t>cell ' + r + ':' + c + '</t></is>'}</c>`).join('')}</row>`).join('')
  }</sheetData>`],
]);

// A worker that never answers, answers with garbage, or crashes: the client must fall back to the inline parse.
class FakeWorker extends EventEmitter {
  terminated = false;
  onPost: (w: FakeWorker, m: { id: number }) => void;
  constructor(onPost: (w: FakeWorker, m: { id: number }) => void) { super(); this.onPost = onPost; }
  postMessage(m: { id: number }) { this.onPost(this, m); }
  terminate() { this.terminated = true; return Promise.resolve(0); }
  unref() {}
}
const fake = (onPost: (w: FakeWorker, m: { id: number }) => void) => {
  const made: FakeWorker[] = [];
  return { made, spawn: () => { const w = new FakeWorker(onPost); made.push(w); return w as unknown as Worker; } };
};
const counted = () => { const calls: OfficeKind[] = []; return { calls, inline: (k: OfficeKind, d: Uint8Array): OfficeParsed => { calls.push(k); return parseOffice(k, d); } }; };

test('parse worker: the worker parses a Word file and a spreadsheet exactly as the inline parse does', async () => {
  const client = createParseClient({ workerPath: WORKER });
  try {
    for (const [kind, data] of [['docx', docx()], ['xlsx', xlsx()]] as const) {
      assert.deepEqual(await client.parse(kind, data), parseOffice(kind, data));
    }
    assert.ok(client.alive(), 'the worker is kept for the next file');
    const sheet = (await client.parse('xlsx', xlsx(2100)) as { sheets: { rows: unknown[]; truncated: boolean }[] }).sheets[0];
    assert.equal(sheet.rows.length, 2000); // cut to the rows the app shows, in the worker
    assert.equal(sheet.truncated, true);
  } finally { client.close(); }
});

test('parse worker: a corrupt file is the file\'s error, thrown as it is and not parsed twice', async () => {
  const { calls, inline } = counted();
  const client = createParseClient({ workerPath: WORKER, inline });
  try {
    await assert.rejects(client.parse('docx', zip([['other.xml', '<x/>']])), /Not a Word document/);
    assert.deepEqual(calls, []);
    assert.equal((await client.parse('docx', docx())).kind, 'docx'); // and the worker still serves the next one
  } finally { client.close(); }
});

test('parse worker: a worker that cannot start, crashes, answers garbage or never answers falls back to the inline parse', async () => {
  const data = docx();
  const expected = parseOffice('docx', data);
  const cases: [string, { spawn: () => Worker }][] = [
    ['constructor throws', { spawn: () => { throw new Error('no worker'); } }],
    ['crash', fake((w) => { setImmediate(() => w.emit('error', new Error('boom'))); })],
    ['exit', fake((w) => { setImmediate(() => w.emit('exit', 1)); })],
    ['invalid message', fake((w) => { setImmediate(() => w.emit('message', 'garbage')); })],
    ['wrong id', fake((w, m) => { setImmediate(() => w.emit('message', { id: m.id + 1, result: expected })); })],
    ['invalid result', fake((w, m) => { setImmediate(() => w.emit('message', { id: m.id, result: { kind: 'pdf' } })); })],
  ];
  for (const [name, { spawn }] of cases) {
    const { calls, inline } = counted();
    const client = createParseClient({ workerPath: 'x', spawn, inline, timeoutMs: 5000 });
    assert.deepEqual(await client.parse('docx', data), expected, name);
    assert.deepEqual(calls, ['docx'], name);
    assert.equal(client.alive(), false, name);
  }
  // A path that does not exist: the real Worker reports the error asynchronously.
  const { calls, inline } = counted();
  const client = createParseClient({ workerPath: new URL('../desktop/no-such-worker.ts', import.meta.url), inline });
  assert.deepEqual(await client.parse('docx', data), expected);
  assert.deepEqual(calls, ['docx']);
});

test('parse worker: no answer in time ends the worker and parses inline; after repeated failures the worker is not tried again', async () => {
  const { calls, inline } = counted();
  const silent = fake(() => {});
  const client = createParseClient({ workerPath: 'x', spawn: silent.spawn, inline, timeoutMs: 20 });
  const data = docx();
  for (let i = 0; i < 4; i++) assert.equal((await client.parse('docx', data)).kind, 'docx');
  assert.equal(calls.length, 4);
  assert.equal(silent.made.length, 3, 'three workers were tried, the fourth file went straight to inline');
  assert.ok(silent.made.every((w) => w.terminated));
});

test('parse worker: an idle worker is ended and the next file starts a new one', async () => {
  const client = createParseClient({ workerPath: WORKER, idleMs: 40 });
  try {
    await client.parse('docx', docx());
    assert.ok(client.alive());
    await sleep(200);
    assert.equal(client.alive(), false);
    assert.equal((await client.parse('docx', docx())).kind, 'docx');
    assert.ok(client.alive());
  } finally { client.close(); }
});

test('parse worker: files wait their turn and each gets its own answer', async () => {
  const client = createParseClient({ workerPath: WORKER });
  try {
    const files = [docx(1), xlsx(5), docx(7), xlsx(9)];
    const kinds: OfficeKind[] = ['docx', 'xlsx', 'docx', 'xlsx'];
    const results = await Promise.all(files.map((f, i) => client.parse(kinds[i], f)));
    results.forEach((r, i) => assert.deepEqual(r, parseOffice(kinds[i], files[i])));
  } finally { client.close(); }
});

// The point of the worker: the main thread keeps turning while a big file is parsed.
test('parse worker: a big file does not block the event loop (inline does)', async () => {
  const big = xlsx(3000);
  // The longest gap between two 10 ms ticks while `work` runs.
  const worstGap = async (work: () => Promise<unknown>) => {
    let last = performance.now(); let worst = 0;
    const tick = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; }, 10);
    await work();
    await sleep(30); // a blocked loop shows up in the first tick after it is free again
    clearInterval(tick);
    return worst;
  };
  const client = createParseClient({ workerPath: WORKER, timeoutMs: 60_000 });
  try {
    await client.parse('docx', docx()); // start the worker first: its start-up is not what is measured
    const inline = await worstGap(async () => { await sleep(0); parseOffice('xlsx', big); });
    const offloaded = await worstGap(() => client.parse('xlsx', big));
    // Generous: inline blocks for the whole parse, the worker only for the copy of the file in and the cut result out.
    assert.ok(offloaded < inline / 2, `worker gap ${offloaded.toFixed(0)} ms vs inline gap ${inline.toFixed(0)} ms`);
  } finally { client.close(); }
});
