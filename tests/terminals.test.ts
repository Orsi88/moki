// The end of a terminal's output that a tab draws again when it comes back (desktop/terminals.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outputTail } from '../desktop/terminals.ts';

test('a terminal keeps only the end of its output, at least the size asked for', () => {
  const tail = outputTail(10);
  assert.equal(tail.text(), '');
  for (const chunk of ['abc', 'defg', 'hij', 'klmno']) tail.push(chunk);
  assert.equal(tail.text(), 'fghijklmno');
  tail.push('p');
  assert.equal(tail.text(), 'ghijklmnop');
  const big = outputTail(4);
  big.push('0123456789'); // one chunk longer than the limit is cut when read
  assert.equal(big.text(), '6789');
});

test('the output kept is the same as cutting the whole output', () => {
  const tail = outputTail(1000);
  let all = '';
  for (let i = 0; i < 5000; i++) {
    const chunk = `line ${i}\r\n`.repeat((i % 7) + 1);
    tail.push(chunk);
    all += chunk;
    if (i % 997 === 0) assert.equal(tail.text(), all.slice(-1000));
  }
  assert.equal(tail.text(), all.slice(-1000));
});
