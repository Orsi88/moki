import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightParts } from '../app/src/code-highlight.ts';

test('highlighting a line keeps every character and marks the words', () => {
  const parts = highlightParts('const n = 1;\n', 'javascript');
  assert.equal(parts.map((part) => part.text).join(''), 'const n = 1;\n');
  assert.equal(parts.find((part) => part.text === 'const')?.kind, 'key');
  assert.equal(parts.find((part) => part.text === '1')?.kind, 'num');
});

test('a string and a python comment are marked and the text still joins', () => {
  const source = 'name = "ada"  # quem\n';
  const parts = highlightParts(source, 'python');
  assert.equal(parts.map((part) => part.text).join(''), source);
  assert.equal(parts.find((part) => part.text.startsWith('"'))?.kind, 'str');
  assert.equal(parts.find((part) => part.text.startsWith('#'))?.kind, 'cmt');
});
