// The comment marks of a Markdown file (<!--c:id-->…<!--/c:id-->) as a mark the
// formatted editor keeps while the text around them changes. The comment list
// itself stays in the block at the end of the file; this only keeps the anchor.

import { Mark, type MarkdownToken } from '@tiptap/core';

// The same private-use characters encodeCommentMarks writes (app/src/md-comments.ts).
const OPEN = '\uE200';
const MID = '\uE201';
const CLOSE = '\uE202';
const END = '\uE203';

const token = new RegExp(`^${OPEN}([a-z0-9]+)${MID}([\\s\\S]*?)${CLOSE}\\1${END}`);

export const MdCommentMark = Mark.create({
  name: 'mdComment',
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-md-comment]', getAttrs: (element) => ({ id: element.getAttribute('data-md-comment') }) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { 'data-md-comment': HTMLAttributes.id }, 0];
  },

  markdownTokenName: 'mdComment',

  markdownTokenizer: {
    name: 'mdComment',
    level: 'inline',
    start: (src) => src.indexOf(OPEN),
    tokenize(src, _tokens, lexer) {
      const match = token.exec(src);
      if (!match) return undefined;
      return {
        type: 'mdComment',
        raw: match[0],
        id: match[1],
        tokens: lexer.inlineTokens(match[2]),
      } as MarkdownToken;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.applyMark('mdComment', helpers.parseInline(token.tokens || []), { id: String(token.id ?? '') });
  },

  renderMarkdown(node, helpers) {
    const id = String(node.attrs?.id ?? '');
    return `<!--c:${id}-->${helpers.renderChildren(node)}<!--/c:${id}-->`;
  },
});
