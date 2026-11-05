// Turns a typed / command into Markdown. The textarea editor applies the same
// commands through the browser; the formatted editor applies them to the source.
// The same starters as diagram-source.ts. A test checks they still match.
const MERMAID_STARTER = 'flowchart LR\n  A --> B';
const EXCALIDRAW_STARTER = JSON.stringify({
  type: 'excalidraw', version: 2, source: 'moki', elements: [],
  appState: { viewBackgroundColor: '#ffffff' }, files: {},
}, null, 2);

export interface SlashPhrases { link: string; cols: [string, string, string] }

const lineOf = (source: string, caret: number) => {
  const start = source.lastIndexOf('\n', caret - 1) + 1;
  const nl = source.indexOf('\n', caret);
  const end = nl === -1 ? source.length : nl;
  return { start, end, text: source.slice(start, end) };
};

// `from`/`to` is the `/query` that was typed. It is removed, then the command runs there.
export function applySlash(source: string, from: number, to: number, id: string, phrases: SlashPhrases): string {
  if (from < 0 || to < from || to > source.length) return source;
  const s = source.slice(0, from) + source.slice(to);
  const caret = from;
  const atLineStart = caret === 0 || s[caret - 1] === '\n';
  const setLine = (next: string) => {
    const line = lineOf(s, caret);
    return s.slice(0, line.start) + next + s.slice(line.end);
  };
  const toggle = (test: RegExp, add: string) => {
    const current = lineOf(s, caret).text;
    return setLine(test.test(current) ? current.replace(test, '') : add + current.replace(test, ''));
  };
  const insert = (value: string) => s.slice(0, caret) + value + s.slice(caret);
  const fence = (lang: string, body: string) => insert(`${atLineStart ? '' : '\n'}\`\`\`${lang}\n${body}\n\`\`\`\n`);
  const heading = (level: number) => {
    const mark = `${'#'.repeat(level)} `;
    const current = lineOf(s, caret).text;
    const bare = current.replace(/^#{1,6} /, '');
    return setLine(current === mark + bare ? bare : mark + bare);
  };
  switch (id) {
    case 'checklist': return toggle(/^- \[[ xX]\] /, '- [ ] ');
    case 'h1': return heading(1);
    case 'h2': return heading(2);
    case 'h3': return heading(3);
    case 'list': return toggle(/^- (?!\[[ xX]\] )/, '- ');
    case 'numbered': return toggle(/^\d+\. /, '1. ');
    case 'quote': return toggle(/^> /, '> ');
    case 'code': return insert(`${atLineStart ? '' : '\n'}\`\`\`\n\n\`\`\`\n`);
    case 'diagram': return fence('mermaid', MERMAID_STARTER);
    case 'drawing': return fence('excalidraw', EXCALIDRAW_STARTER);
    case 'table': {
      const cols = phrases.cols;
      return insert(`${atLineStart ? '' : '\n'}| ${cols.join(' | ')} |\n| --- | --- | --- |\n|  |  |  |\n`);
    }
    case 'divider': return insert(`${atLineStart ? '' : '\n'}\n---\n\n`);
    case 'link': return insert(`[${phrases.link}](https://)`);
    default: return source;
  }
}
