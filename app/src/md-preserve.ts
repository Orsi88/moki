// Keeps the file's own text when the formatted editor changes it: only the edited stretch is rewritten, so
// untouched source (Windows line endings, spacing the editor would normalize) stays as it was. Pure.

// A file split the way the editor sees it: the text it draws, what follows (trailing newlines, the comment block) and its line ending.
// `body` is the file's text without its comment block (readComments).
export function splitSource(text: string, body: string): { core: string; tail: string; newline: string } {
  const trailing = /[\r\n]*$/.exec(body)?.[0] ?? ''; // a lone \r can end the body when the comment block follows CRLF blank lines
  return { core: body.slice(0, body.length - trailing.length), tail: trailing + text.slice(body.length), newline: body.includes('\r\n') && !/(?<!\r)\n/.test(body) ? '\r\n' : '\n' };
}

// Map rendered Markdown offsets back to the original, allowing different whitespace
// between identical tokens. This keeps untouched source (including CRLF) verbatim.
export function sourceOffsets(rendered: string, source: string): number[] | null {
  const offsets = [0];
  let a = 0;
  let b = 0;
  while (a < rendered.length && b < source.length) {
    if (/\s/.test(rendered[a]) && /\s/.test(source[b])) {
      const startA = a; const startB = b;
      while (a < rendered.length && /\s/.test(rendered[a])) a++;
      while (b < source.length && /\s/.test(source[b])) b++;
      const boundaries = [startB];
      for (let at = startB; at < b;) {
        at += source[at] === '\r' && source[at + 1] === '\n' ? 2 : 1;
        boundaries.push(at);
      }
      for (let i = 1; i <= a - startA; i++) offsets[startA + i] = boundaries[Math.floor(i * (boundaries.length - 1) / (a - startA))];
    } else {
      if (rendered[a] !== source[b]) return null;
      offsets[++a] = ++b;
    }
  }
  return a === rendered.length && b === source.length ? offsets : null;
}

export function preserveSource(before: string, after: string, source: string, newline: string): string | null {
  const offsets = sourceOffsets(before, source);
  if (!offsets) return null;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length; let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
  const removed = before.slice(start, endBefore);
  const originalRemoved = source.slice(offsets[start], offsets[endBefore]).replace(/\r\n/g, '\n');
  if (removed.includes('\n') && removed !== originalRemoved) return null;
  const next = source.slice(0, offsets[start]) + after.slice(start, endAfter).replace(/\n/g, newline) + source.slice(offsets[endBefore]);
  return sourceOffsets(after, next) ? next : null;
}
