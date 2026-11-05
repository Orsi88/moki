// A small highlighter for the code embed. The text is unchanged; only some words
// get a kind, so the fence can be saved from the same characters.

export interface CodeToken { kind: '' | 'key' | 'str' | 'cmt' | 'num'; text: string }

const KEYS: Record<string, string[]> = {
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new', 'import', 'from', 'export', 'async', 'await', 'of', 'in', 'this', 'typeof'],
  typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new', 'import', 'from', 'export', 'async', 'await', 'type', 'interface', 'extends', 'implements', 'public', 'private'],
  python: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'with', 'try', 'except', 'lambda', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is'],
  java: ['class', 'public', 'private', 'static', 'void', 'return', 'if', 'else', 'new', 'import', 'package', 'extends'],
  go: ['func', 'return', 'if', 'else', 'for', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'defer'],
  rust: ['fn', 'let', 'mut', 'return', 'if', 'else', 'for', 'while', 'struct', 'enum', 'impl', 'use', 'pub', 'mod', 'match'],
  sql: ['select', 'from', 'where', 'and', 'or', 'insert', 'into', 'update', 'delete', 'join', 'on', 'as', 'create', 'table', 'values'],
  c: ['if', 'else', 'for', 'while', 'return', 'int', 'void', 'char', 'struct', 'const'],
  cpp: ['if', 'else', 'for', 'while', 'return', 'int', 'void', 'char', 'struct', 'const', 'class', 'public', 'private', 'namespace', 'new'],
};

const HASH = new Set(['python', 'bash', 'yaml', 'ruby']);

// Walks the source once. A hash starts a comment only in the languages that use it.
export function highlightParts(source: string, lang: string): CodeToken[] {
  const words = new Set(KEYS[lang] ?? []);
  const hash = HASH.has(lang);
  const slash = lang !== 'python' && lang !== 'css' && lang !== 'sql';
  const parts: CodeToken[] = [];
  let i = 0;
  const push = (kind: CodeToken['kind'], text: string) => { if (text) parts.push({ kind, text }); };
  while (i < source.length) {
    const rest = source.slice(i);
    if (slash && rest.startsWith('//')) {
      const end = rest.indexOf('\n');
      const n = end === -1 ? rest.length : end;
      push('cmt', rest.slice(0, n));
      i += n;
      continue;
    }
    if (hash && rest[0] === '#') {
      const end = rest.indexOf('\n');
      const n = end === -1 ? rest.length : end;
      push('cmt', rest.slice(0, n));
      i += n;
      continue;
    }
    const str = /^(?:`[^`\n]*`|'(?:\\.|[^'\n\\])*'|"(?:\\.|[^"\n\\])*")/.exec(rest);
    if (str) { push('str', str[0]); i += str[0].length; continue; }
    const num = /^\d+(?:\.\d+)?/.exec(rest);
    if (num && (i === 0 || !/[A-Za-z0-9_]/.test(source[i - 1]))) { push('num', num[0]); i += num[0].length; continue; }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (word) { push(words.has(word[0]) ? 'key' : '', word[0]); i += word[0].length; continue; }
    push('', rest[0]);
    i++;
  }
  return parts;
}
