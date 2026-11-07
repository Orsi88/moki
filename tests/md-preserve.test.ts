import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readComments } from '../app/src/md-comments.ts';
import { preserveSource, splitSource } from '../app/src/md-preserve.ts';

const split = (text: string) => splitSource(text, readComments(text).body);

test('md-preserve: an edit rewrites only its stretch; Windows line endings and original spacing stay', () => {
  const source = '# Título\r\n\r\nTexto.\r\n\r\n## Regras\r\n- Primeira\r\n- Segunda';
  const before = '# Título\n\nTexto.\n\n## Regras\n\n- Primeira\n- Segunda'; // the editor writes a blank line after a heading
  const after = before.replace('- Segunda', '- Segunda revisada');
  assert.equal(preserveSource(before, after, source, '\r\n'), source.replace('- Segunda', '- Segunda revisada'));
  assert.equal(preserveSource('a', 'b', 'not the same text', '\n'), null); // the source does not match what was drawn: no patch
});

test('md-preserve: the file is split into the drawn text, its tail (blank lines, comment block) and its line ending', () => {
  const block = '<!-- moki-comments\n[]\n-->\n';
  const parts = split(`Um\r\nDois\r\n\r\n${block}`);
  assert.equal(parts.core, 'Um\r\nDois');
  assert.equal(parts.newline, '\r\n');
  assert.equal(parts.core + parts.tail, `Um\r\nDois\r\n\r\n${block}`);
  assert.equal(split('Um\nDois\r\n').newline, '\n'); // mixed endings count as LF
});
