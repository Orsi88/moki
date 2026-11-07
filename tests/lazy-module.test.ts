import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { lazyHeavy, loadOnce } from '../app/src/lazy-module.ts';

test('a lazy module runs its import once and caches the module', async () => {
  let runs = 0;
  const lazy = loadOnce(async () => { runs += 1; return { name: 'mod' }; });
  assert.equal(runs, 0, 'nothing is imported before the first load');
  assert.equal(lazy.peek(), undefined);
  const first = await lazy.load();
  assert.equal(await lazy.load(), first);
  assert.equal(runs, 1);
  assert.equal(lazy.peek(), first, 'peek gives the loaded module without waiting');
});

test('concurrent loads share the same import', async () => {
  let runs = 0;
  let release!: (m: string) => void;
  const lazy = loadOnce(() => { runs += 1; return new Promise<string>((resolve) => { release = resolve; }); });
  const both = Promise.all([lazy.load(), lazy.load()]);
  assert.equal(runs, 1);
  release('ok');
  assert.deepEqual(await both, ['ok', 'ok']);
});

test('a failed import is forgotten, so the next load tries again', async () => {
  let runs = 0;
  const lazy = loadOnce(async () => { runs += 1; if (runs === 1) throw new Error('chunk failed'); return 'loaded'; });
  await assert.rejects(lazy.load(), /chunk failed/);
  assert.equal(lazy.peek(), undefined);
  assert.equal(await lazy.load(), 'loaded');
  assert.equal(runs, 2);
});

test('warm starts the import early, does not run it again on load and swallows a failure', async () => {
  let runs = 0;
  const lazy = loadOnce(async () => { runs += 1; return 'm'; });
  lazy.warm();
  lazy.warm();
  assert.equal(runs, 1);
  assert.equal(await lazy.load(), 'm');
  assert.equal(runs, 1);

  let tries = 0;
  const flaky = loadOnce(async () => { tries += 1; if (tries === 1) throw new Error('offline'); return 'back'; });
  flaky.warm(); // must not leave an unhandled rejection
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await flaky.load(), 'back');
});

test('lazyHeavy imports at once only when the lazy switch is off (eager)', () => {
  let runs = 0;
  const importer = async () => { runs += 1; return 1; };
  lazyHeavy(importer, false);
  assert.equal(runs, 0);
  lazyHeavy(importer, true);
  assert.equal(runs, 1);
});
