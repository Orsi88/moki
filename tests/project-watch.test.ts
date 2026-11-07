import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, mock, test } from 'node:test';
import { watchProject } from '../desktop/project-watch.ts';

const root = mkdtempSync(join(tmpdir(), 'qa-watch-'));
after(() => rmSync(root, { recursive: true, force: true }));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('a change in a nested folder is reported once per burst, and an ignored folder is not watched', async () => {
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'dist'));
  let hits = 0;
  const stop = watchProject(root, () => { hits += 1; }, { ignore: ['dist'], maxDepth: 2, maxDirs: 20 });
  writeFileSync(join(root, 'src', 'a.txt'), 'one');
  writeFileSync(join(root, 'src', 'b.txt'), 'two');
  await wait(700);
  assert.equal(hits, 1);
  writeFileSync(join(root, 'dist', 'built.js'), 'skip');
  await wait(700);
  assert.equal(hits, 1, 'a file inside an ignored folder does not count');
  stop();
  writeFileSync(join(root, 'src', 'c.txt'), 'after');
  await wait(700);
  assert.equal(hits, 1, 'stopping the watch ends the reports');
});

test('past maxDirs the extra folders are silently left unwatched, with no error', async () => {
  const big = mkdtempSync(join(tmpdir(), 'qa-watch-cap-'));
  const names = ['a', 'b', 'c', 'd'];
  for (const name of names) mkdirSync(join(big, name));
  let hits = 0;
  const stop = watchProject(big, () => { hits += 1; }, { maxDirs: 2 }); // the root and one subfolder
  let reporting = 0;
  for (const name of names) {
    const before = hits;
    writeFileSync(join(big, name, 'x.txt'), name);
    await wait(700);
    if (hits > before) reporting += 1;
  }
  stop();
  rmSync(big, { recursive: true, force: true });
  assert.equal(reporting, 1, 'only the one subfolder inside the cap reports; the others are not watched');
});

test('only a rename re-scans a folder; a plain change just reports', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-watch-evt-'));
  const reads = mock.method(fs, 'readdirSync');
  syncBuiltinESMExports();
  let hits = 0;
  const stop = watchProject(dir, () => { hits += 1; }, { burstMs: 50 });
  try {
    writeFileSync(join(dir, 'f.txt'), 'one'); // creating a file is a rename event
    await wait(300);
    const afterCreate = reads.mock.callCount();
    assert.ok(afterCreate >= 2, 'the creation re-scanned the folder');
    const before = hits;
    writeFileSync(join(dir, 'f.txt'), 'two'); // rewriting it is a change event
    await wait(300);
    assert.ok(hits > before, 'a change is still reported');
    assert.equal(reads.mock.callCount(), afterCreate, 'a change does not re-scan');
  } finally {
    stop();
    reads.mock.restore();
    syncBuiltinESMExports();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a subfolder created after the start is watched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-watch-new-'));
  let hits = 0;
  const stop = watchProject(dir, () => { hits += 1; }, { burstMs: 50 });
  try {
    mkdirSync(join(dir, 'late'));
    await wait(300);
    const before = hits;
    writeFileSync(join(dir, 'late', 'x.txt'), 'x');
    await wait(300);
    assert.ok(hits > before, 'a file in the new subfolder is reported');
  } finally {
    stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a folder created after the start still respects maxDirs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-watch-newcap-'));
  mkdirSync(join(dir, 'a'));
  let hits = 0;
  const stop = watchProject(dir, () => { hits += 1; }, { burstMs: 50, maxDirs: 2 }); // the root and a
  try {
    mkdirSync(join(dir, 'b'));
    await wait(300);
    const before = hits;
    writeFileSync(join(dir, 'b', 'x.txt'), 'x');
    await wait(300);
    assert.equal(hits, before, 'the folder past the cap is not watched');
  } finally {
    stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('continuous changes are reported within maxWaitMs instead of being postponed forever', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-watch-max-'));
  let hits = 0;
  const stop = watchProject(dir, () => { hits += 1; }, { burstMs: 200, maxWaitMs: 500 });
  try {
    const started = Date.now();
    let n = 0;
    // A write every 50 ms keeps the 200 ms quiet window from ever closing.
    while (Date.now() - started < 900) {
      writeFileSync(join(dir, 'log.txt'), String(n++));
      await wait(50);
    }
    assert.ok(hits >= 1, 'reported while the writes were still going');
    assert.ok(hits <= 2, 'still debounced, not once per write');
  } finally {
    stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a symlinked folder is not followed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-watch-link-'));
  const outside = mkdtempSync(join(tmpdir(), 'qa-watch-out-'));
  symlinkSync(outside, join(dir, 'link'), 'dir');
  let hits = 0;
  const stop = watchProject(dir, () => { hits += 1; }, { burstMs: 50 });
  try {
    writeFileSync(join(outside, 'x.txt'), 'x');
    await wait(300);
    assert.equal(hits, 0, 'a change behind the link is not reported');
  } finally {
    stop();
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
