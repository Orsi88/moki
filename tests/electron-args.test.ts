import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseElectronArgs } from '../desktop/electron-args.ts';

test('QA_ELECTRON_ARGS: unset, empty or blank applies nothing', () => {
  for (const raw of [undefined, '', '   \t ']) assert.deepEqual(parseElectronArgs(raw), { accepted: [], rejected: [] });
});

test('QA_ELECTRON_ARGS: allowed switches are returned without the leading dashes, with extra spaces ignored', () => {
  const r = parseElectronArgs('  --disable-gpu   --disable-software-rasterizer ');
  assert.deepEqual(r.accepted, [{ switch: 'disable-gpu' }, { switch: 'disable-software-rasterizer' }]);
  assert.deepEqual(r.rejected, []);
});

test('QA_ELECTRON_ARGS: switches with a value keep it, including a value that has its own = (--js-flags)', () => {
  const r = parseElectronArgs('--js-flags=--max-old-space-size=512 --enable-features=A,B --disable-features=C');
  assert.deepEqual(r.accepted, [
    { switch: 'js-flags', value: '--max-old-space-size=512' },
    { switch: 'enable-features', value: 'A,B' },
    { switch: 'disable-features', value: 'C' },
  ]);
  assert.deepEqual(r.rejected, []);
});

test('QA_ELECTRON_ARGS: --in-process-gpu is allowed without a value, and not with one', () => {
  assert.deepEqual(parseElectronArgs('--in-process-gpu'), { accepted: [{ switch: 'in-process-gpu' }], rejected: [] });
  assert.deepEqual(parseElectronArgs('--in-process-gpu=1 --disable-gpu-compositing'), { accepted: [], rejected: ['--in-process-gpu=1', '--disable-gpu-compositing'] });
});

test('QA_ELECTRON_ARGS: an injected unsafe switch is dropped and reported while the allowed one stays', () => {
  const r = parseElectronArgs('--disable-gpu --no-sandbox');
  assert.deepEqual(r.accepted, [{ switch: 'disable-gpu' }]);
  assert.deepEqual(r.rejected, ['--no-sandbox']);
  const bad = ['--remote-debugging-port=9222', '--inspect=0.0.0.0', '--user-data-dir=/tmp/x', '--proxy-server=evil:1', '--load-extension=/tmp/e', '--DISABLE-GPU'];
  assert.deepEqual(parseElectronArgs(bad.join(' ')), { accepted: [], rejected: bad });
});

test('QA_ELECTRON_ARGS: a token without -- is rejected', () => {
  assert.deepEqual(parseElectronArgs('disable-gpu -disable-gpu'), { accepted: [], rejected: ['disable-gpu', '-disable-gpu'] });
});

test('QA_ELECTRON_ARGS: a value-less or valued mismatch, an empty value and an unsafe value are rejected', () => {
  const bad = ['--enable-features', '--enable-features=', '--disable-gpu=1', '--js-flags=$(id)', '--js-flags=a;b', '--enable-features=A/../B', '--enable-features="A"'];
  assert.deepEqual(parseElectronArgs(bad.join(' ')), { accepted: [], rejected: bad });
});

test('QA_ELECTRON_ARGS: a token over the size limit and tokens past the count limit are rejected', () => {
  const long = `--enable-features=${'A'.repeat(300)}`;
  assert.equal(parseElectronArgs(long).accepted.length, 0);
  assert.equal(parseElectronArgs(long).rejected.length, 1);
  assert.ok(parseElectronArgs(long).rejected[0].length <= 60);
  const many = parseElectronArgs(Array(25).fill('--disable-gpu').join(' '));
  assert.equal(many.accepted.length, 20);
  assert.equal(many.rejected.length, 5);
});
