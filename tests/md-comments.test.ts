import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { addComment, colorComment, editComment, encodeCommentMarks, findInSource, readComments, removeComment, replyComment, restoreComments } from '../app/src/md-comments.ts';
import { MdCommentMark } from '../app/src/md-comment-mark.ts';
import { markdownToHtml } from '../scripts/lib/markdown.mjs';

// The same path the formatted editor uses: marks in, markdown out, comment list put back.
const roundTrip = (fileText: string, edit?: (markdown: string) => string) => {
  const read = readComments(fileText);
  const manager = new MarkdownManager({ extensions: [StarterKit, Table, TableRow, TableHeader, TableCell, MdCommentMark] });
  const markdown = manager.serialize(manager.parse(encodeCommentMarks(read.body)));
  return restoreComments(edit ? edit(markdown) : markdown, read.comments);
};

const at = '2026-11-01T10:00:00.000Z';

test('a comment marks its text and goes to the block at the end; any Markdown viewer hides both', () => {
  const src = '# Login\n\nThe password expires in 30 days.\n';
  const [s, e] = findInSource(src, 'expires in 30 days', 0) ?? [0, 0];
  const { text, id } = addComment(src, s, e, { author: 'ana', at, text: 'And when it -- expires?' }, 'k1');
  assert.equal(id, 'k1');
  assert.match(text, /The password <!--c:k1-->expires in 30 days<!--\/c:k1-->\./);
  assert.match(text, /\n<!-- moki-comments\n\[\n\{"id":"k1"[^\n]*\}\n\]\n-->\n$/);
  assert.doesNotMatch(text.slice(text.indexOf('moki-comments')), /--[^>]/); // "--" would end the HTML comment
  assert.deepEqual(readComments(text).comments, [{ id: 'k1', author: 'ana', at, text: 'And when it -- expires?', replies: [] }]);

  // In Moki the text is marked; in a generated report, nothing shows.
  assert.match(markdownToHtml(text, { comments: true }), /<p>The password <mark class="md-comment" data-c="k1">expires in 30 days<\/mark>\.<\/p>/);
  assert.doesNotMatch(markdownToHtml(text, { comments: true }), /moki-comments|&lt;!--/);
  assert.equal(markdownToHtml(text), '<h1>Login</h1>\n<p>The password expires in 30 days.</p>');
});

test('replies, edits and deletes keep the file\'s own text', () => {
  const src = 'One two one two.\n';
  const second = findInSource(src, 'one', 0);
  assert.deepEqual(second, [8, 11]); // "One" differs in case: the first "one" is the third word
  let { text } = addComment(src, 8, 11, { author: 'ana', at, text: 'first' }, 'a');
  // An occurrence is counted without the marks of other comments.
  assert.deepEqual(findInSource(text, 'two', 1), [text.indexOf('two.'), text.indexOf('two.') + 3]);
  ({ text } = addComment(text, text.indexOf('two.'), text.indexOf('two.') + 3, { author: 'bia', at, text: 'second' }, 'b'));
  text = replyComment(text, 'a', { author: 'bia', at, text: 'ok' });
  text = editComment(text, 'b', 'changed');
  assert.deepEqual(readComments(text).comments.map((c) => [c.id, c.text, c.replies.length]), [['a', 'first', 1], ['b', 'changed', 0]]);
  text = removeComment(text, 'a');
  assert.equal(readComments(text).body.trim(), 'One two one <!--c:b-->two<!--/c:b-->.');
  assert.equal(removeComment(text, 'b'), src);
  assert.equal(findInSource(src, 'two **one**', 0), null);
});

test('comment colors persist across edits and replies, with old comments unchanged', () => {
  let { text } = addComment('Hello world.\n', 0, 5, { author: 'ana', at, text: 'first' }, 'a');
  assert.equal(readComments(text).comments[0].color, undefined);
  text = colorComment(text, 'a', 'green');
  text = replyComment(text, 'a', { author: 'bia', at, text: 'reply' });
  text = editComment(text, 'a', 'updated');
  assert.deepEqual(readComments(text).comments[0], { id: 'a', author: 'ana', at, text: 'updated', replies: [{ author: 'bia', at, text: 'reply' }], color: 'green' });
  assert.equal(markdownToHtml(text), '<p>Hello world.</p>');
  assert.equal(removeComment(text, 'a'), 'Hello world.\n');
});

test('the formatted editor keeps a comment when the text around it changes', () => {
  const src = 'The password expires in 30 days.\n';
  const { text } = addComment(src, 13, 20, { author: 'ana', at, text: 'soon' }, 'k1');
  const kept = roundTrip(text, (markdown) => markdown.replace('expires', 'expired'));
  assert.match(kept, /<!--c:k1-->expired<!--\/c:k1-->/);
  assert.equal(readComments(kept).comments[0].text, 'soon');
  const gone = roundTrip(text, (markdown) => markdown.replace(/<!--c:k1-->expired<!--\/c:k1-->|<!--c:k1-->expires<!--\/c:k1-->/, 'expires'));
  assert.equal(readComments(gone).comments.length, 0);
  const tableSrc = '| A | B |\n| --- | --- |\n| one | two |\n';
  const one = tableSrc.indexOf('one');
  const table = addComment(tableSrc, one, one + 3, { author: 'ana', at, text: 'cell' }, 'c1').text;
  const tableKept = roundTrip(table, (markdown) => markdown.replace('one', 'uno'));
  assert.match(tableKept, /<!--c:c1-->uno<!--\/c:c1-->/);
  assert.equal(readComments(tableKept).comments[0].text, 'cell');
});
