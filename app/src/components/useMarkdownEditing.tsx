// Markdown editing in a textarea, shared by notes (NoteDialog) and the .md files of a
// project (DocView): the formatting helpers (through the browser, so Ctrl+Z undoes them),
// the / commands (like Notion: the formatting bar, typed) and Enter continuing a list.
// A caller adds its own commands (an image, an @ mention) with `extra`. The / list opens at the
// caret: under its line, or above it when there is no room below (the editor's wrapper is the frame).

import { useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { t } from '../i18n';
import { IconCode, IconLink } from './Icons';

export const TABLE_ICON = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 10h17M3.5 14.5h17M9.5 10v9M15 10v9" /></svg>;

// line: formats the current line (the caret goes to its end afterwards).
export interface SlashCommand { id: string; label: string; glyph: ReactNode; words: string; run: () => void; line?: boolean }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const MENU_HEIGHT = 260; // .note-mention max-height
const MENU_WIDTH = 320;
// The textarea styles that decide where text wraps, copied to a hidden twin to measure the caret.
const MIRRORED = ['box-sizing', 'width', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'word-spacing', 'tab-size', 'text-indent'];

// Where the / list goes, in its wrapper (the textarea's offsetParent): under the caret's line, or above it.
function menuAt(el: HTMLTextAreaElement, pos: number): CSSProperties {
  const style = getComputedStyle(el);
  const twin = document.createElement('div');
  for (const k of MIRRORED) twin.style.setProperty(k, style.getPropertyValue(k));
  Object.assign(twin.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', overflow: 'hidden' });
  twin.textContent = el.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = el.value.slice(pos) || '.';
  twin.appendChild(mark);
  document.body.appendChild(twin);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const top = el.offsetTop + mark.offsetTop - el.scrollTop;
  const left = el.offsetLeft + mark.offsetLeft - el.scrollLeft;
  twin.remove();
  const frame = el.offsetParent as HTMLElement | null;
  const height = frame?.clientHeight ?? Infinity;
  const width = Math.min(MENU_WIDTH, (frame?.clientWidth ?? MENU_WIDTH) - 16);
  const x = Math.max(8, Math.min(left, (frame?.clientWidth ?? width) - width - 8));
  const below = top + line + 4;
  return below + MENU_HEIGHT <= height || top < MENU_HEIGHT
    ? { top: below, bottom: 'auto', left: x, right: 'auto', width, transform: 'none' }
    : { top: 'auto', bottom: height - top + 4, left: x, right: 'auto', width, transform: 'none' };
}

export function useMarkdownEditing(editor: RefObject<HTMLTextAreaElement | null>, extra: (helpers: { insert: (value: string, select?: [number, number]) => void; lineStart: () => boolean }) => SlashCommand[] = () => []) {
  const replace = (from: number, to: number, value: string, selFrom: number, selTo: number) => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(from, to);
    document.execCommand('insertText', false, value);
    el.setSelectionRange(selFrom, selTo);
  };
  const insert = (value: string, select?: [number, number]) => {
    const el = editor.current;
    if (!el) return;
    const s = el.selectionStart;
    replace(s, el.selectionEnd, value, select ? s + select[0] : s + value.length, select ? s + select[1] : s + value.length);
  };

  // The helpers read the editor itself, not the text state: a / command runs right after removing what was typed.
  // **bold**, *italic*, `code`: wraps the selection, or removes the marks when already there.
  const wrap = (mark: string) => {
    const el = editor.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const n = mark.length;
    if (value.slice(s - n, s) === mark && value.slice(e, e + n) === mark) replace(s - n, e + n, value.slice(s, e), s - n, e - n);
    else replace(s, e, mark + value.slice(s, e) + mark, s + n, e + n);
  };

  // Applies fn to every line the selection touches (titles, lists, quotes).
  const lines = (fn: (line: string, i: number, all: string[]) => string) => {
    const el = editor.current;
    if (!el) return;
    const { value } = el;
    const from = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const end = value.indexOf('\n', el.selectionEnd);
    const to = end === -1 ? value.length : end;
    const all = value.slice(from, to).split('\n');
    const block = all.map((l, i) => fn(l, i, all)).join('\n');
    replace(from, to, block, from, from + block.length);
  };
  const toggleLines = (test: RegExp, add: (i: number) => string) =>
    lines((l, _i, all) => (all.every((x) => test.test(x)) ? l.replace(test, '') : `${add(_i)}${l.replace(test, '')}`));
  const heading = (level: number) => {
    const mark = `${'#'.repeat(level)} `;
    lines((l) => { const bare = l.replace(/^#{1,6} /, ''); return l === mark + bare ? bare : mark + bare; });
  };
  const bullets = () => toggleLines(/^- (?!\[[ xX]\] )/, () => '- ');
  const numbers = () => toggleLines(/^\d+\. /, (i) => `${i + 1}. `);
  const checks = () => toggleLines(/^- \[[ xX]\] /, () => '- [ ] ');
  const quote = () => toggleLines(/^> /, () => '> ');
  const code = () => {
    const el = editor.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = el.value.slice(s, e);
    if (sel.includes('\n')) replace(s, e, `\`\`\`\n${sel}\n\`\`\``, s + 4, s + 4 + sel.length);
    else wrap('`');
  };
  const link = () => {
    const el = editor.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const label = el.value.slice(s, e);
    const url = 'https://';
    if (label) replace(s, e, `[${label}](${url})`, s + label.length + 3, s + label.length + 3 + url.length);
    else { const word = t('link text'); replace(s, e, `[${word}](${url})`, s + 1, s + 1 + word.length); }
  };
  const lineStart = () => { const el = editor.current; return !el || el.selectionStart === 0 || el.value[el.selectionStart - 1] === '\n'; };
  const table = () => {
    const cols = [t('Column 1'), t('Column 2'), t('Column 3')];
    const block = `${lineStart() ? '' : '\n'}| ${cols.join(' | ')} |\n| --- | --- | --- |\n|  |  |  |\n`;
    const first = block.indexOf(cols[0]);
    insert(block, [first, first + cols[0].length]);
  };
  const divider = () => insert(`${lineStart() ? '' : '\n'}\n---\n\n`);
  const codeBlock = () => insert(`${lineStart() ? '' : '\n'}\`\`\`\n\n\`\`\`\n`, [lineStart() ? 4 : 5, lineStart() ? 4 : 5]);

  const commands: SlashCommand[] = [
    { id: 'checklist', label: t('Checklist'), glyph: <span className="note-check-glyph" aria-hidden="true">✓</span>, words: 'checkbox todo task tarefa caixa', run: checks, line: true },
    { id: 'h1', label: t('Large title'), glyph: 'H1', words: 'heading title titulo', run: () => heading(1), line: true },
    { id: 'h2', label: t('Medium title'), glyph: 'H2', words: 'heading title titulo', run: () => heading(2), line: true },
    { id: 'h3', label: t('Small title'), glyph: 'H3', words: 'heading title titulo', run: () => heading(3), line: true },
    { id: 'list', label: t('List'), glyph: '•', words: 'bullet lista marcadores', run: bullets, line: true },
    { id: 'numbered', label: t('Numbered list'), glyph: '1.', words: 'number ordered numerada', run: numbers, line: true },
    { id: 'quote', label: t('Quote'), glyph: '❝', words: 'citacao', run: quote, line: true },
    { id: 'code', label: t('Code block'), glyph: <IconCode size={15} />, words: 'codigo', run: codeBlock },
    { id: 'table', label: t('Table'), glyph: TABLE_ICON, words: 'tabela', run: table },
    { id: 'divider', label: t('Divider'), glyph: '—', words: 'line separator linha divisor', run: divider },
    { id: 'link', label: t('Link'), glyph: <IconLink size={15} />, words: 'url', run: link },
    ...extra({ insert, lineStart }),
  ];

  const [slash, setSlash] = useState<{ start: number; query: string; index: number; at?: CSSProperties } | null>(null);
  const slashMatches = slash ? commands.filter((c) => fold(`${c.label} ${c.id} ${c.words}`).includes(fold(slash.query))) : [];
  // A / at the start of a line or after a space opens the list; what follows it filters the list.
  const findSlash = (value: string, caret: number) => {
    const m = value.slice(0, caret).match(/(^|\s)\/([\p{L}\p{N}]*)$/u);
    const el = editor.current;
    const start = caret - (m?.[2].length ?? 0) - 1;
    setSlash(m ? { start, query: m[2], index: 0, at: el ? menuAt(el, start) : undefined } : null); // lined up with the /, so it stays put while typing
  };
  const pickSlash = (command: { run: () => void; line?: boolean }) => {
    const el = editor.current;
    if (!el || !slash) return;
    replace(slash.start, el.selectionStart, '', slash.start, slash.start); // the typed /command goes away
    setSlash(null);
    // After React keeps the removal (a second edit in the same event is undone). Line formats leave the line
    // selected, as the bar does; typed, the caret goes to its end so writing continues.
    setTimeout(() => {
      command.run();
      if (command.line && editor.current) editor.current.setSelectionRange(editor.current.selectionEnd, editor.current.selectionEnd);
    }, 0);
  };
  const openSlash = () => {
    const el = editor.current;
    const before = el ? el.value[el.selectionStart - 1] : undefined;
    insert(!before || /\s/.test(before) ? '/' : ' /');
  };

  // Arrows / Enter / Tab / Escape drive the / list; returns true when the key was used.
  const slashKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!slash) return false;
    const n = slashMatches.length;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSlash(null); return true; }
    if (n && e.key === 'ArrowDown') { e.preventDefault(); setSlash({ ...slash, index: (slash.index + 1) % n }); return true; }
    if (n && e.key === 'ArrowUp') { e.preventDefault(); setSlash({ ...slash, index: (slash.index - 1 + n) % n }); return true; }
    if (n && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickSlash(slashMatches[slash.index]); return true; }
    return false;
  };

  // Enter continues a list; Enter on an empty item ends it.
  const listKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const text = el.value;
    const caret = el.selectionStart;
    const from = text.lastIndexOf('\n', caret - 1) + 1;
    const line = text.slice(from, caret);
    const m = line.match(/^(\s*)(- \[[ xX]\] |[-*] |\d+\. |> )/);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[2].trim()) { replace(from, caret, '', from, from); return; } // empty item: end the list
    const num = m[2].match(/^(\d+)\. $/);
    const next = num ? `${Number(num[1]) + 1}. ` : m[2].startsWith('- [') ? '- [ ] ' : m[2];
    insert(`\n${m[1]}${next}`);
  };

  // The / list, at the caret while a command is typed.
  const slashList = slash && (
    <div className="note-mention" role="listbox" aria-label={t('Commands')} style={slash.at}>
      {!slashMatches.length ? <p className="muted small">{t('No command matches "{q}".', { q: slash.query })}</p>
        : slashMatches.map((c, i) => (
          <button key={c.id} type="button" role="option" aria-selected={i === slash.index} className={i === slash.index ? 'on' : ''}
            onMouseDown={(e) => { e.preventDefault(); pickSlash(c); }}>
            <span className="note-slash-glyph" aria-hidden="true">{c.glyph}</span><span className="note-mention-name">{c.label}</span>
          </button>
        ))}
    </div>
  );

  return {
    replace, insert, wrap, heading, bullets, numbers, checks, quote, code, link, table, divider, codeBlock, lineStart,
    slash, setSlash, findSlash, openSlash, slashKey, listKey, slashList,
  };
}
