// Comments inside a Markdown file, invisible to any Markdown viewer: the commented text sits
// between <!--c:ID--> and <!--/c:ID-->, and the comments themselves in one block at the end:
//   <!-- moki-comments
//   [{"id":"k1","author":"ana","at":"2026-11-01T10:00:00.000Z","text":"…","replies":[]}]
//   -->
// "--" never appears in the block (an HTML comment would end there): JSON writes it --.
// The renderer (scripts/lib/markdown.mjs, comments: true) draws the marks; the rest is here. Pure.

// Shared by the PDF palette so the same names and colors stay in sync.
export const COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'red', 'purple'] as const;
export type CommentColor = typeof COLORS[number];
export const SWATCH: Record<CommentColor, string> = { yellow: '#f5d90a', green: '#46c46a', blue: '#4a8ff0', pink: '#f06ab0', orange: '#f59b2a', red: '#e5484d', purple: '#9b6cf0' };
export const isCommentColor = (value: unknown): value is CommentColor => typeof value === 'string' && COLORS.some((color) => color === value);

export interface MdReply { author: string; at: string; text: string }
export interface MdComment extends MdReply { id: string; replies: MdReply[]; color?: CommentColor }

const BLOCK = /\n*<!-- moki-comments\n([\s\S]*?)\n-->\s*$/;
const open = (id: string) => `<!--c:${id}-->`;
const close = (id: string) => `<!--/c:${id}-->`;

const isReply = (v: unknown): v is MdReply => Boolean(v) && typeof v === 'object'
  && typeof (v as MdReply).author === 'string' && typeof (v as MdReply).at === 'string' && typeof (v as MdReply).text === 'string';

// The file's text without the block, and the comments in it (anything malformed is left out).
export function readComments(text: string): { body: string; comments: MdComment[] } {
  const m = BLOCK.exec(text);
  if (!m) return { body: text, comments: [] };
  let list: unknown = [];
  try { list = JSON.parse(m[1]); } catch { /* a broken block: no comments */ }
  const comments = (Array.isArray(list) ? list : []).filter((c): c is MdComment => isReply(c) && typeof (c as MdComment).id === 'string' && /^[a-z0-9]+$/.test((c as MdComment).id))
    .map((c) => ({ id: c.id, author: c.author, at: c.at, text: c.text, replies: Array.isArray(c.replies) ? c.replies.filter(isReply) : [], ...(isCommentColor(c.color) ? { color: c.color } : {}) }));
  return { body: text.slice(0, m.index), comments };
}

function write(body: string, comments: MdComment[]): string {
  const base = body.replace(/\s+$/, '');
  if (!comments.length) return `${base}\n`;
  const json = `[\n${comments.map((c) => JSON.stringify(c)).join(',\n')}\n]`.replace(/-(?=-)/g, '\\u002d');
  return `${base}\n\n<!-- moki-comments\n${json}\n-->\n`;
}

// A new id, not used in this file.
export function newId(comments: MdComment[], seed = Date.now()): string {
  let id = seed.toString(36);
  while (comments.some((c) => c.id === id)) id = (++seed).toString(36);
  return id;
}

// The commented text [start, end) of the body gets the marks; the comment goes to the block.
export function addComment(text: string, start: number, end: number, comment: Omit<MdComment, 'id' | 'replies'>, id?: string): { text: string; id: string } {
  const { body, comments } = readComments(text);
  if (start < 0 || end <= start || end > body.length) throw new Error('Select some text to comment on.');
  const key = id ?? newId(comments);
  const marked = body.slice(0, start) + open(key) + body.slice(start, end) + close(key) + body.slice(end);
  return { text: write(marked, [...comments, { id: key, ...comment, replies: [] }]), id: key };
}

export function replyComment(text: string, id: string, reply: MdReply): string {
  const { body, comments } = readComments(text);
  return write(body, comments.map((c) => (c.id === id ? { ...c, replies: [...c.replies, reply] } : c)));
}

export function editComment(text: string, id: string, value: string): string {
  const { body, comments } = readComments(text);
  return write(body, comments.map((c) => (c.id === id ? { ...c, text: value } : c)));
}

export function colorComment(text: string, id: string, color: CommentColor): string {
  if (!isCommentColor(color)) throw new Error('Invalid comment color.');
  const { body, comments } = readComments(text);
  return write(body, comments.map((c) => (c.id === id ? { ...c, color } : c)));
}

// The marks go away with the comment; the text stays.
export function removeComment(text: string, id: string): string {
  const { body, comments } = readComments(text);
  return write(body.split(open(id)).join('').split(close(id)).join(''), comments.filter((c) => c.id !== id));
}

// Where a piece of the rendered text is in the source: its n-th occurrence (0-based) in the
// body, marks of other comments skipped. null when the source writes it differently (formatting inside).
export function findInSource(text: string, selected: string, nth: number): [number, number] | null {
  const { body } = readComments(text);
  if (!selected) return null;
  // The body without marks, and where each of its characters is in the body.
  const map: number[] = [];
  let plain = '';
  const marks = /<!--\/?c:[a-z0-9]+-->/g;
  let last = 0;
  for (let m = marks.exec(body); m; m = marks.exec(body)) {
    for (let i = last; i < m.index; i++) { plain += body[i]; map.push(i); }
    last = m.index + m[0].length;
  }
  for (let i = last; i < body.length; i++) { plain += body[i]; map.push(i); }
  let at = -1;
  for (let k = 0; k <= nth; k++) { at = plain.indexOf(selected, at + 1); if (at < 0) return null; }
  return [map[at], map[at + selected.length - 1] + 1];
}
