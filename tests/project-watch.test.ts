import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
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
