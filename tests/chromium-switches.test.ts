// Chromium switches decided before the app is ready (desktop/chromium-switches.ts): defaults plus QA_ELECTRON_ARGS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SWITCHES, describeSwitches, resolveSwitches } from '../desktop/chromium-switches.ts';
import { parseElectronArgs } from '../desktop/electron-args.ts';

test('no default switch is on in this release, and none may turn the GPU off', () => {
  assert.deepEqual(DEFAULT_SWITCHES, []);
  const gpuOff = /^--(disable-gpu|disable-software-rasterizer|in-process-gpu)(=|$)/;
  assert.deepEqual(DEFAULT_SWITCHES.filter((s) => gpuOff.test(s)), []);
});

test('without QA_ELECTRON_ARGS nothing is applied, so the GPU is left on', () => {
  const r = resolveSwitches({});
  assert.deepEqual([r.applied, r.accepted, r.rejected, r.defaultsOff], [[], [], [], false]);
});

test('main.ts never turns the GPU off on its own', () => {
  const main = readFileSync(new URL('../desktop/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /disableHardwareAcceleration/);
});

test('with the shipped (empty) defaults nothing is applied unless the user asks, exactly as QA_ELECTRON_ARGS alone', () => {
  for (const env of [{}, { QA_ELECTRON_ARGS: '' }, { QA_ELECTRON_ARGS: '  ' }]) {
    assert.deepEqual(resolveSwitches(env).applied, []);
    assert.deepEqual(resolveSwitches(env).rejected, []);
  }
  const raw = '--disable-gpu --js-flags=--max-old-space-size=512 --no-sandbox';
  const r = resolveSwitches({ QA_ELECTRON_ARGS: raw });
  const old = parseElectronArgs(raw);
  assert.deepEqual(r.applied, old.accepted);
  assert.deepEqual(r.accepted, old.accepted);
  assert.deepEqual(r.rejected, old.rejected);
  assert.equal(r.defaultsOff, false);
});

test('defaults are applied, and the user adds switches with other names', () => {
  const r = resolveSwitches({ QA_ELECTRON_ARGS: '--disable-software-rasterizer' }, ['--disable-gpu']);
  assert.deepEqual(r.applied, [{ switch: 'disable-gpu' }, { switch: 'disable-software-rasterizer' }]);
  assert.deepEqual(resolveSwitches({}, ['--disable-gpu']).applied, [{ switch: 'disable-gpu' }]);
});

test('the value of the user overrides the default with the same name, one entry per name', () => {
  const r = resolveSwitches({ QA_ELECTRON_ARGS: '--js-flags=--max-old-space-size=512' }, ['--js-flags=--max-old-space-size=256', '--disable-gpu']);
  assert.deepEqual(r.applied, [{ switch: 'js-flags', value: '--max-old-space-size=512' }, { switch: 'disable-gpu' }]);
});

test('QA_NO_DEFAULT_SWITCHES=1, or a QA_ELECTRON_ARGS that exists but is blank, turns the defaults off', () => {
  for (const env of [{ QA_NO_DEFAULT_SWITCHES: '1' }, { QA_ELECTRON_ARGS: '' }, { QA_ELECTRON_ARGS: ' \t' }]) {
    const r = resolveSwitches(env, ['--disable-gpu']);
    assert.deepEqual(r.applied, []);
    assert.equal(r.defaultsOff, true);
  }
  // The user's own switches still apply with the defaults off.
  const r = resolveSwitches({ QA_NO_DEFAULT_SWITCHES: '1', QA_ELECTRON_ARGS: '--disable-software-rasterizer' }, ['--disable-gpu']);
  assert.deepEqual(r.applied, [{ switch: 'disable-software-rasterizer' }]);
  // Only the exact value 1 is the escape; unset or another value keeps the defaults.
  assert.equal(resolveSwitches({ QA_NO_DEFAULT_SWITCHES: '0' }, ['--disable-gpu']).applied.length, 1);
  assert.equal(resolveSwitches({}, ['--disable-gpu']).defaultsOff, false);
});

test('a default that is not allowed is rejected and reported, never applied', () => {
  const r = resolveSwitches({}, ['--no-sandbox', 'disable-gpu', '--disable-gpu']);
  assert.deepEqual(r.applied, [{ switch: 'disable-gpu' }]);
  assert.deepEqual(r.rejected, ['--no-sandbox', 'disable-gpu']);
  // With the defaults off their problems are not reported either: they are not used.
  assert.deepEqual(resolveSwitches({ QA_NO_DEFAULT_SWITCHES: '1' }, ['--no-sandbox']).rejected, []);
});

test('--in-process-gpu is allowed; --disable-gpu-compositing and --no-sandbox are not', () => {
  const r = resolveSwitches({ QA_ELECTRON_ARGS: '--in-process-gpu --disable-gpu-compositing --no-sandbox --in-process-gpu=1' });
  assert.deepEqual(r.applied, [{ switch: 'in-process-gpu' }]);
  assert.deepEqual(r.rejected, ['--disable-gpu-compositing', '--no-sandbox', '--in-process-gpu=1']);
});

test('the QA_PERF line lists what was applied and whether the defaults were on', () => {
  assert.equal(describeSwitches(resolveSwitches({ QA_NO_DEFAULT_SWITCHES: '1', QA_ELECTRON_ARGS: '--disable-gpu' })), 'QA_PERF switches: --disable-gpu (defaults: off)');
  assert.equal(describeSwitches(resolveSwitches({}, ['--disable-gpu', '--js-flags=--max-old-space-size=256'])), 'QA_PERF switches: --disable-gpu --js-flags=--max-old-space-size=256 (defaults: on)');
  assert.equal(describeSwitches(resolveSwitches({})), 'QA_PERF switches: (none) (defaults: on)');
});
