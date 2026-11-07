// Output of an embedded terminal (desktop/terminals.ts): the kept tail and the grouping sent to the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBatcher, createFlowControl, createTail } from '../desktop/terminals.ts';

test('terminal output tail keeps only the last characters, across chunks', () => {
  const tail = createTail(10);
  tail.push('abcdef');
  assert.equal(tail.text(), 'abcdef');
  tail.push('ghijkl');
  assert.equal(tail.text(), 'cdefghijkl');
  tail.push('x'.repeat(25));
  assert.equal(tail.text(), 'x'.repeat(10));
  tail.push('');
  assert.equal(tail.text(), 'x'.repeat(10));
});

test('terminal output tail keeps the order over many small and large chunks', () => {
  const tail = createTail(20000);
  let all = '';
  for (let i = 0; i < 5000; i++) { const piece = `${i},`; tail.push(piece); all += piece; }
  tail.push('Z'.repeat(9000)); all += 'Z'.repeat(9000);
  assert.equal(tail.text(), all.slice(-20000));
});

test('terminal output batcher groups chunks into one send, in order', async () => {
  const sent: string[] = [];
  const batch = createBatcher((data) => sent.push(data), 5);
  batch.add('a'); batch.add('b'); batch.add('c');
  assert.deepEqual(sent, []);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(sent, ['abc']);
  batch.add('d');
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(sent, ['abc', 'd']);
});

test('terminal output batcher flush sends at once and cancel drops what waits', async () => {
  const sent: string[] = [];
  const batch = createBatcher((data) => sent.push(data), 5);
  batch.add('x'); batch.add('y');
  batch.flush();
  assert.deepEqual(sent, ['xy']);
  batch.flush();
  assert.deepEqual(sent, ['xy']); // nothing waiting: nothing sent
  batch.add('lost');
  batch.cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(sent, ['xy']);
});

function flowRig(stallMs?: number) {
  const calls: string[] = [];
  const flow = createFlowControl({ high: 100, low: 20, stallMs, pause: () => calls.push('pause'), resume: () => calls.push('resume') });
  return { flow, calls };
}

test('terminal flow control pauses once above the high mark and resumes below the low mark', () => {
  const { flow, calls } = flowRig();
  flow.sent(100);
  assert.deepEqual(calls, []);
  flow.sent(1); flow.sent(50);
  assert.deepEqual(calls, ['pause']);
  flow.acked(100); // 51 left: between the marks, still paused (no flapping)
  assert.deepEqual(calls, ['pause']);
  flow.acked(31); // 20 left: not below the low mark yet
  assert.deepEqual(calls, ['pause']);
  flow.acked(1);
  assert.deepEqual(calls, ['pause', 'resume']);
  flow.sent(50); // 69 unconfirmed: between the marks, running, does not pause again
  assert.deepEqual(calls, ['pause', 'resume']);
  flow.dispose();
});

test('terminal flow control never counts below zero and ignores untrusted acks', () => {
  const { flow, calls } = flowRig();
  flow.acked(500);
  flow.acked(NaN); flow.acked(-5); flow.acked(Infinity);
  flow.sent(100); // an excess ack did not leave a credit behind
  assert.deepEqual(calls, []);
  flow.sent(1);
  assert.deepEqual(calls, ['pause']);
  flow.acked(NaN); flow.acked(-1); flow.acked(Infinity); // none of these resumes it
  assert.deepEqual(calls, ['pause']);
  flow.dispose();
});

test('terminal flow control resumes on reset, release and dispose, and stays free afterwards', () => {
  for (const end of ['reset', 'release', 'dispose'] as const) {
    const { flow, calls } = flowRig();
    flow.sent(500);
    assert.deepEqual(calls, ['pause']);
    flow[end]();
    assert.deepEqual(calls, ['pause', 'resume'], end);
    flow[end](); // twice: no second resume
    assert.deepEqual(calls, ['pause', 'resume'], end);
    flow.sent(500);
    // reset counts again; release and dispose leave it free (no window to confirm)
    assert.deepEqual(calls, end === 'reset' ? ['pause', 'resume', 'pause'] : ['pause', 'resume'], end);
    flow.dispose();
  }
});

test('terminal flow control resumes a window that confirms nothing, and counts again after it confirms', async () => {
  const { flow, calls } = flowRig(20);
  flow.sent(500);
  assert.deepEqual(calls, ['pause']);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, ['pause', 'resume']);
  flow.sent(500); // still no window: not paused again
  assert.deepEqual(calls, ['pause', 'resume']);
  flow.acked(1); // a live window again
  flow.sent(500);
  assert.deepEqual(calls, ['pause', 'resume', 'pause']);
  flow.dispose();
});

test('terminal flow control keeps a slow but confirming window paused without the stall timeout', async () => {
  const { flow, calls } = flowRig(60);
  flow.sent(500);
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); flow.acked(10); }
  assert.deepEqual(calls, ['pause']);
  flow.dispose();
});

test('terminal flow control survives a process that cannot pause or resume', () => {
  const flow = createFlowControl({ high: 10, low: 2, pause: () => { throw new Error('no pause'); }, resume: () => { throw new Error('gone'); } });
  assert.doesNotThrow(() => { flow.sent(100); flow.acked(100); flow.reset(); flow.dispose(); });
  let resumed = 0;
  const f2 = createFlowControl({ high: 10, low: 2, pause: () => undefined, resume: () => { resumed++; throw new Error('gone'); } });
  f2.sent(100);
  assert.doesNotThrow(() => f2.dispose());
  assert.equal(resumed, 1);
});
