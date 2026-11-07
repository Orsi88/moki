import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { searchWorkspace, searchWorkspaceExpanded, yielder } from '../desktop/search.ts';

// The expanded search walks every file (async), reads a PDF through a lazily imported pdf.js,
// and does not follow symbolic links.
test('expanded search: finds by name and content, reads a PDF, does not follow symlinks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-search-'));
  const outside = mkdtempSync(join(tmpdir(), 'qa-search-out-'));
  try {
    const inbox = join(root, 'workspace', 'projects', 'acme', 'inbox');
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, '..', 'project.json'), JSON.stringify({ id: 'acme', name: 'Acme' }));
    writeFileSync(join(inbox, 'renewal.md'), '# Story\n\nThe user renews the quasarneedle.');
    writeFileSync(join(inbox, 'picture.png'), 'not an image');
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('pdfneedle');
    writeFileSync(join(inbox, 'doc.pdf'), await pdf.save());
    mkdirSync(join(outside, 'sub'));
    writeFileSync(join(outside, 'sub', 'secret.md'), 'quasarneedle');
    symlinkSync(outside, join(inbox, 'link'), 'dir');
    symlinkSync(join(outside, 'sub', 'secret.md'), join(inbox, 'secret-link.md'));

    const paths = async (q: string) => (await searchWorkspaceExpanded(root, q)).files.map((f) => f.path);
    assert.deepEqual(await paths('arquivo: picture'), ['inbox/picture.png'], 'any file by name');
    assert.deepEqual(await paths('conteudo: quasarneedle'), ['inbox/renewal.md'], 'by content; the symlinked copies are skipped');
    assert.deepEqual(await paths('conteudo: pdfneedle'), ['inbox/doc.pdf'], 'PDF text');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// A text file is read up to 1 MB: exactly at the limit it is searched; above it the rail search
// ignores the file, and the expanded search lists it only by name.
test('search: file size limit is kept (at the limit, above it)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-search-limit-'));
  try {
    const inbox = join(root, 'workspace', 'projects', 'acme', 'inbox');
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, '..', 'project.json'), JSON.stringify({ id: 'acme', name: 'Acme' }));
    const fill = (needle: string, size: number) => Buffer.concat([Buffer.from(`${needle}\n`), Buffer.alloc(size - needle.length - 1, 'x')]);
    writeFileSync(join(inbox, 'at-limit.md'), fill('limitneedle', 1_000_000));
    writeFileSync(join(inbox, 'over-limit.md'), fill('limitneedle', 1_000_001));
    writeFileSync(join(inbox, 'over-limit-name.md'), fill('other', 1_000_001));

    const rail = async (q: string) => (await searchWorkspace(root, q)).files.map((f) => f.path);
    const expanded = async (q: string) => (await searchWorkspaceExpanded(root, q)).files.map((f) => f.path);
    assert.deepEqual(await rail('limitneedle'), ['inbox/at-limit.md']);
    assert.deepEqual(await rail('over-limit-name'), [], 'the rail search ignores a file above the limit, even by name');
    assert.deepEqual(await expanded('conteudo: limitneedle'), ['inbox/at-limit.md']);
    assert.deepEqual(await expanded('arquivo: over-limit-name'), ['inbox/over-limit-name.md'], 'the expanded search still lists it by name');
    assert.deepEqual(await expanded('over-limit'), ['inbox/over-limit-name.md', 'inbox/over-limit.md']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// While it reads many files the search gives the event loop back: a timer-like marker keeps running.
test('search: the event loop is not held while many files are read', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-search-yield-'));
  try {
    const inbox = join(root, 'workspace', 'projects', 'acme', 'inbox');
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, '..', 'project.json'), JSON.stringify({ id: 'acme', name: 'Acme' }));
    for (let i = 0; i < 4000; i++) writeFileSync(join(inbox, `f${i}.md`), `line ${i}\n${'filler '.repeat(400)}`);
    for (const run of [() => searchWorkspaceExpanded(root, 'conteudo: absent-needle'), () => searchWorkspace(root, 'absent-needle')]) {
      let last = performance.now();
      let worst = 0;
      let stop = false;
      const tick = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; if (!stop) setImmediate(tick); };
      setImmediate(tick);
      const start = performance.now();
      assert.equal((await run()).files.length, 0);
      await new Promise((resolve) => setImmediate(resolve)); // a tick after the end records a gap that ran to the end
      stop = true;
      const total = performance.now() - start;
      assert.ok(worst < total / 2, `longest gap ${worst.toFixed(0)} ms of ${total.toFixed(0)} ms`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('search: the yielder gives the event loop a turn only after its slice of work', async () => {
  let turns = 0;
  const mark = () => { turns++; };
  const idle = yielder(60_000);
  setImmediate(mark);
  await idle();
  assert.equal(turns, 0, 'inside the slice there is no pause');
  const always = yielder(0);
  await always();
  assert.equal(turns, 1, 'past the slice the pending immediates run before it continues');
});
