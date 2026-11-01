import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addComment, editComment, findInSource, readComments, removeComment, replyComment } from '../app/src/md-comments.ts';
import { markdownToHtml } from '../scripts/lib/markdown.mjs';

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
