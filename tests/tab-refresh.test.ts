import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { needsReread, stampOf } from '../app/src/tab-refresh.ts';
import { throttle } from '../app/src/throttle.ts';

test('an open tab is read again only when its file size or modification time changed', () => {
  const seen = { size: 10, mtime: 1000 };
  assert.equal(needsReread(seen, { size: 10, mtime: 1000 }), false);
  assert.equal(needsReread(seen, { size: 11, mtime: 1000 }), true);
  assert.equal(needsReread(seen, { size: 10, mtime: 1001 }), true);
});

test('a tab without a known stamp, or a file missing from the tree, is read again (the safe side)', () => {
  assert.equal(needsReread(undefined, { size: 1, mtime: 1 }), true);
  assert.equal(needsReread({ size: 1, mtime: 1 }, null), true);
  assert.equal(needsReread({ size: 1, mtime: 1 }, undefined), true);
  assert.equal(needsReread({ size: 1 }, { size: 1, mtime: 1 }), true);
});

test('an image or PDF tab takes its stamp from its content, any other tab from the tree stamp it kept', () => {
  const image = { kind: 'image', path: 'a.png', size: 7, mtime: 5 } as const;
  assert.deepEqual(stampOf(image, { size: 1, mtime: 1 }), { size: 7, mtime: 5 });
  const pdf = { kind: 'pdf', path: 'a.pdf', size: 9, mtime: 6 } as const;
  assert.deepEqual(stampOf(pdf, { size: 1, mtime: 1 }), { size: 9, mtime: 6 });
  const text = { kind: 'text', path: 'a.txt', text: 'x', editable: true } as const;
  assert.deepEqual(stampOf(text, { size: 1, mtime: 2 }), { size: 1, mtime: 2 });
  assert.equal(stampOf(text), undefined);
});

test('a PDF tab keeps no bytes: its stamp is the size and time of the stat taken before its URL was granted', () => {
  const pdf = { kind: 'pdf', path: 'a.pdf', size: 7, mtime: 5 } as const;
  const seen = stampOf(pdf, { size: 1, mtime: 1 });
  assert.deepEqual(seen, { size: 7, mtime: 5 });
  assert.equal(needsReread(seen, { size: 7, mtime: 5 }), false, 'unchanged on disk: no read, no new URL');
  assert.equal(needsReread(seen, { size: 8, mtime: 5 }), true);
  assert.equal(needsReread(seen, { size: 7, mtime: 6 }), true);
});

test('throttle calls at once, then collapses a burst into one call at the end of the window', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    let calls = 0;
    const fn = throttle(() => { calls += 1; }, 5000);
    fn();
    assert.equal(calls, 1);
    fn(); fn(); fn();
    assert.equal(calls, 1);
    mock.timers.tick(4999);
    assert.equal(calls, 1);
    mock.timers.tick(1);
    assert.equal(calls, 2);
    mock.timers.tick(5000);
    assert.equal(calls, 2, 'no call without a new change');
    fn();
    assert.equal(calls, 3);
    fn();
    fn.cancel();
    mock.timers.tick(10000);
    assert.equal(calls, 3, 'cancel drops the pending call');
  } finally { mock.timers.reset(); }
});
