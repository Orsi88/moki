import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { createDebouncer, flushEdits, onFlushEdits } from '../app/src/debounce.ts';

test('a debouncer runs once, after the last call of a burst', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let runs = 0;
    const d = createDebouncer(() => { runs += 1; }, 150);
    d.call();
    mock.timers.tick(100);
    d.call();
    mock.timers.tick(100);
    assert.equal(runs, 0, 'the second call moved the end of the window');
    mock.timers.tick(50);
    assert.equal(runs, 1);
    mock.timers.tick(1000);
    assert.equal(runs, 1, 'no run without a new call');
  } finally { mock.timers.reset(); }
});

test('flush runs the pending call at once, only once, and does nothing when nothing is pending', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let runs = 0;
    const d = createDebouncer(() => { runs += 1; }, 150);
    d.flush();
    assert.equal(runs, 0, 'nothing pending');
    d.call();
    d.flush();
    assert.equal(runs, 1);
    d.flush();
    mock.timers.tick(1000);
    assert.equal(runs, 1, 'the timer was cleared by the flush');
  } finally { mock.timers.reset(); }
});

test('cancel drops the pending call, and a later call works again', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let runs = 0;
    const d = createDebouncer(() => { runs += 1; }, 150);
    d.call();
    d.cancel();
    d.flush();
    mock.timers.tick(1000);
    assert.equal(runs, 0);
    d.call();
    mock.timers.tick(150);
    assert.equal(runs, 1);
  } finally { mock.timers.reset(); }
});

test('flushEdits flushes every registered editor until it unregisters', () => {
  const calls: string[] = [];
  const offA = onFlushEdits(() => calls.push('a'));
  const offB = onFlushEdits(() => calls.push('b'));
  flushEdits();
  assert.deepEqual(calls, ['a', 'b']);
  offA();
  flushEdits();
  assert.deepEqual(calls, ['a', 'b', 'b']);
  offB();
  flushEdits();
  assert.equal(calls.length, 3);
});
