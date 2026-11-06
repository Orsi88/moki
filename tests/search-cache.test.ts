// The text the expanded search takes out of Word, PDF and spreadsheet files is kept per file version (desktop/search.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recalledText, rememberText } from '../desktop/search.ts';

test('extracted text is reused only for the same version of the file', () => {
  rememberText('/w/a.pdf', '1:10', 'alpha');
  assert.equal(recalledText('/w/a.pdf', '1:10'), 'alpha');
  assert.equal(recalledText('/w/a.pdf', '2:10'), null); // changed since
  assert.equal(recalledText('/w/b.pdf', '1:10'), null);
});

test('the least recently used text leaves first when the limit is passed', () => {
  rememberText('/w/1.docx', 's', 'aaaa', 10);
  rememberText('/w/2.docx', 's', 'bbbb', 10);
  assert.equal(recalledText('/w/1.docx', 's'), 'aaaa'); // 1 is now the most recent
  rememberText('/w/3.docx', 's', 'cccc', 10);
  assert.equal(recalledText('/w/2.docx', 's'), null);
  assert.equal(recalledText('/w/1.docx', 's'), 'aaaa');
  assert.equal(recalledText('/w/3.docx', 's'), 'cccc');
  rememberText('/w/huge.pdf', 's', 'x'.repeat(11), 10); // larger than everything allowed: not kept
  assert.equal(recalledText('/w/huge.pdf', 's'), null);
});
