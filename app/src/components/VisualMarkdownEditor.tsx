// Visual Markdown editing for documents whose rendered form can round-trip without loss.
// Unsupported markup stays in the original editor instead of being rewritten.
import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { t } from '../i18n';
import { readComments, SWATCH } from '../md-comments';
import { replaceDiagram, type DiagramLang } from '../diagram-source';
import { applySlash } from '../slash-apply';
import { dressCodeEmbeds } from '../code-embed';
import { mountDiagrams } from './Diagrams';
import { TABLE_ICON } from './useMarkdownEditing';
import { IconCode, IconLink } from './Icons';

const escapeText = (text: string) => text.replace(/\u00a0/g, ' ').replace(/[\\`*_~[\]]/g, '\\$&');

type Probe = { node: Node; offset: number } | null;
type Piece = { text: string | null; at: number | null };

function kids(node: HTMLElement, probe: Probe): Piece {
  let at: number | null = null;
  let acc = '';
  const parts: (string | null)[] = [];
  const children = [...node.childNodes];
  for (let i = 0; i < children.length; i++) {
    if (probe && probe.node === node && probe.offset === i) at = acc.length;
    const part = inline(children[i], probe);
    parts.push(part.text);
    if (part.at !== null) at = acc.length + part.at;
    acc += part.text ?? '';
  }
  if (probe && probe.node === node && probe.offset === children.length) at = acc.length;
  if (parts.some((part) => part === null)) return { text: null, at: null };
  return { text: acc, at };
}

function inline(node: Node, probe: Probe): Piece {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    const text = escapeText(raw);
    const at = probe?.node === node ? escapeText(raw.slice(0, Math.min(probe.offset, raw.length))).length : null;
    return { text, at };
  }
  if (!(node instanceof HTMLElement)) return { text: null, at: null };
  if (node.tagName === 'BR') return { text: '\n', at: probe?.node === node ? Math.min(probe.offset, 1) : null };
  const inner = kids(node, probe);
  if (inner.text === null) return inner;
  const text = inner.text;
  const wrap = (mark: string) => (text ? { text: `${mark}${text}${mark}`, at: inner.at === null ? null : mark.length + inner.at } : { text: null, at: null });
  switch (node.tagName) {
    case 'STRONG': case 'B': return wrap('**');
    case 'EM': case 'I': return wrap('*');
    case 'DEL': case 'S': return wrap('~~');
    case 'CODE': return text && !text.includes('`') ? { text: `\`${text}\``, at: inner.at === null ? null : 1 + inner.at } : inner;
    case 'SPAN': case 'FONT': return inner;
    case 'A': {
      const href = node.getAttribute('href') ?? '';
      if (!href || /^javascript:/i.test(href)) return inner;
      const label = text || href;
      return { text: `[${label}](${href})`, at: inner.at === null ? null : 1 + inner.at };
    }
    case 'IMG': {
      const alt = node.getAttribute('alt') ?? '';
      const src = node.getAttribute('src') ?? '';
      return src ? { text: `![${alt}](${src})`, at: null } : { text: '', at: null };
    }
    case 'MARK': {
      const id = node.dataset.c;
      if (!id || !/^[a-z0-9]+$/.test(id) || !text) return { text: null, at: null };
      const open = `<!--c:${id}-->`;
      return { text: `${open}${text}<!--/c:${id}-->`, at: inner.at === null ? null : open.length + inner.at };
    }
    default: return inner;
  }
}

function list(node: HTMLElement, probe: Probe): Piece {
  const ordered = node.tagName === 'OL';
  let out = '';
  let at: number | null = null;
  for (const [index, item] of [...node.children].entries()) {
    if (item.tagName !== 'LI') return { text: null, at: null };
    const inner = kids(item as HTMLElement, probe);
    if (inner.text === null) return { text: null, at: null };
    const prefix = `${ordered ? `${index + 1}.` : '-'} `;
    if (index) out += '\n';
    if (inner.at !== null) at = out.length + prefix.length + inner.at;
    out += prefix + inner.text;
  }
  return { text: out, at };
}

// `at` is the caret's index in the serialized Markdown, when `probe` sits in the editor.
function markdownPiece(root: HTMLElement, probe: Probe): Piece {
  const blocks: string[] = [];
  let at: number | null = null;
  const joined = () => blocks.join('\n\n').length;
  const place = (blockAt: number | null, block: string) => {
    const sep = blocks.length ? 2 : 0;
    if (blockAt !== null) at = joined() + sep + blockAt;
    blocks.push(block);
  };
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
      if (probe?.node === node) at = joined();
      continue;
    }
    if (!(node instanceof HTMLElement)) {
      const part = inline(node, probe);
      if (part.text === null) return { text: null, at: null };
      place(part.at, part.text);
      continue;
    }
    if ((node.tagName === 'PRE' || node.tagName === 'DIV') && (node.dataset.diagram === 'mermaid' || node.dataset.diagram === 'excalidraw')) {
      const code = (node.dataset.source ?? node.querySelector('code')?.textContent ?? '').replace(/\n$/, '');
      const fence = '```' + node.dataset.diagram + '\n' + code + '\n```';
      place(probe && node.contains(probe.node) ? 0 : null, fence);
      continue;
    }
    if (node.tagName === 'PRE') {
      const part = codeFence(node, probe);
      place(part.at, part.text ?? '');
      continue;
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      const part = list(node, probe);
      if (part.text === null) return { text: null, at: null };
      place(part.at, part.text);
      continue;
    }
    if (node.tagName === 'BLOCKQUOTE') {
      const quoted = kids(node, probe);
      if (quoted.text === null) return { text: null, at: null };
      place(null, quoted.text.split('\n').map((line) => `> ${line}`).join('\n'));
      continue;
    }
    if (node.tagName === 'HR') { place(null, '---'); continue; }
    if (node.tagName === 'TABLE') {
      const cells = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (cells) place(null, cells);
      continue;
    }
    if (!/^(P|DIV|H[1-6])$/.test(node.tagName)) {
      const plain = (node.textContent ?? '').trim();
      if (plain) place(null, plain);
      continue;
    }
    const inner = kids(node, probe);
    if (inner.text === null) return { text: null, at: null };
    const heading = /^H([1-6])$/.exec(node.tagName);
    const prefix = heading ? `${'#'.repeat(Number(heading[1]))} ` : '';
    const value = inner.text === '\n' ? '' : inner.text.replace(/\n$/, '');
    // An empty paragraph is the slot around a diagram card, not a blank line in the file.
    if (!heading && value.trim() === '') {
      if (inner.at !== null) at = joined();
      continue;
    }
    const blockAt = inner.at === null ? null : Math.min(prefix.length + value.length, inner.text === '\n' ? prefix.length : prefix.length + inner.at);
    place(blockAt, `${prefix}${value}`);
  }
  return { text: blocks.join('\n\n'), at };
}

function markdown(root: HTMLElement): string | null {
  return markdownPiece(root, null).text;
}

const marks = (body: string) => [...body.matchAll(/<!--\/?c:([a-z0-9]+)-->/g)].map((m) => m[0]).join('|');

// Map rendered Markdown offsets back to the original, allowing different whitespace
// between identical tokens. This keeps untouched source (including CRLF) verbatim.
function sourceOffsets(rendered: string, source: string): number[] | null {
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

function preserveSource(before: string, after: string, source: string, newline: string): string | null {
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

interface Props {
  text: string;
  project?: string;
  path: string;
  onChange: (text: string) => void;
  onUnsupported: () => void;
}

export function VisualMarkdownEditor({ text, project, path, onChange, onUnsupported }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  const initial = useRef(text);
  const latest = useRef({ onChange, onUnsupported });
  latest.current = { onChange, onUnsupported };
  const lastHtml = useRef('');
  const tail = useRef('');
  const newline = useRef('\n');
  const markerSequence = useRef('');
  const previousMarkdown = useRef('');
  const source = useRef('');
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState(false);
  const [slash, setSlash] = useState<{ query: string; index: number; at: CSSProperties; from: number; to: number } | null>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const slashMenu = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const phrases = { link: t('link text'), cols: [t('Column 1'), t('Column 2'), t('Column 3')] as [string, string, string] };
  const commands = [
    { id: 'checklist', label: t('Checklist'), glyph: <span className="note-check-glyph" aria-hidden="true">✓</span>, words: 'checkbox todo task tarefa caixa' },
    { id: 'h1', label: t('Large title'), glyph: 'H1', words: 'heading title titulo' },
    { id: 'h2', label: t('Medium title'), glyph: 'H2', words: 'heading title titulo' },
    { id: 'h3', label: t('Small title'), glyph: 'H3', words: 'heading title titulo' },
    { id: 'list', label: t('List'), glyph: '•', words: 'bullet lista marcadores' },
    { id: 'numbered', label: t('Numbered list'), glyph: '1.', words: 'number ordered numerada' },
    { id: 'quote', label: t('Quote'), glyph: '❝', words: 'citacao' },
    { id: 'code', label: t('Code block'), glyph: <IconCode size={15} />, words: 'codigo' },
    { id: 'diagram', label: t('Diagram'), glyph: '◇', words: 'mermaid diagrama flowchart' },
    { id: 'drawing', label: t('Drawing'), glyph: '✎', words: 'excalidraw desenho drawing' },
    { id: 'table', label: t('Table'), glyph: TABLE_ICON, words: 'tabela' },
    { id: 'divider', label: t('Divider'), glyph: '—', words: 'line separator linha divisor' },
    { id: 'link', label: t('Link'), glyph: <IconLink size={15} />, words: 'url' },
  ];
  const matches = slash ? commands.filter((command) => fold(`${command.label} ${command.id} ${command.words}`).includes(fold(slash.query))) : [];
  const picked = slash ? Math.min(slash.index, Math.max(0, matches.length - 1)) : 0;

  const paint = (html: string, core: string) => {
    const box = editor.current;
    if (!box) return false;
    box.innerHTML = html;
    const rendered = markdown(box);
    // A note that does not match character for character still opens for editing.
    // The formatted text becomes the working copy, and the file changes on the next edit.
    if (rendered !== null && sourceOffsets(rendered, core)) {
      previousMarkdown.current = rendered;
      source.current = core;
    } else if (rendered !== null) {
      previousMarkdown.current = rendered;
      source.current = rendered;
    } else {
      previousMarkdown.current = core;
      source.current = core;
    }
    const colors = new Map(readComments(core + tail.current).comments.map((comment) => [comment.id, comment.color]));
    box.querySelectorAll<HTMLElement>('mark.md-comment').forEach((mark) => {
      const color = colors.get(mark.dataset.c ?? '');
      mark.style.setProperty('--md-comment-color', color ? SWATCH[color] : 'var(--accent)');
    });
    ensureSlots(box);
    dressCodeEmbeds(box, true);
    lastHtml.current = box.innerHTML;
    setReady(true);
    setWarning(false);
    const token = generation.current;
    void mountDiagrams(box, (index, lang: DiagramLang, body) => {
      if (token !== generation.current) return;
      const updated = replaceDiagram(source.current, index, lang, body);
      source.current = updated;
      const next = markdown(box);
      if (next) previousMarkdown.current = next;
      lastHtml.current = box.innerHTML;
      latest.current.onChange(updated + tail.current);
    });
    return true;
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    let cancelled = false;
    const original = initial.current;
    const { body } = readComments(original);
    newline.current = body.includes('\r\n') && !/(?<!\r)\n/.test(body) ? '\r\n' : '\n';
    const trailing = body.match(/(?:\r?\n)*$/)?.[0] ?? '';
    const core = body.slice(0, body.length - trailing.length);
    tail.current = trailing + original.slice(body.length);
    markerSequence.current = marks(core);
    const token = ++generation.current;
    void api.renderMarkdown(original, project, path).then((html) => {
      if (cancelled || token !== generation.current) return;
      if (!paintRef.current(html, core)) latest.current.onUnsupported();
    }).catch(() => { if (!cancelled && token === generation.current) latest.current.onUnsupported(); });
    return () => { cancelled = true; };
  }, [project, path]);

  useEffect(() => { slashMenu.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [slash?.index, slash?.query]);

  const syncSlash = () => {
    const box = editor.current;
    const sel = window.getSelection();
    if (!box || !sel || !sel.isCollapsed || !sel.anchorNode || !box.contains(sel.anchorNode)) { setSlash(null); return; }
    const piece = markdownPiece(box, { node: sel.anchorNode, offset: sel.anchorOffset });
    if (piece.text === null || piece.at === null) { setSlash(null); return; }
    const found = piece.text.slice(0, piece.at).match(/(^|\s)\/([\p{L}\p{N}]*)$/u);
    const offsets = found ? sourceOffsets(piece.text, source.current) : null;
    const start = found ? piece.at - found[2].length - 1 : 0;
    if (!found || !offsets || offsets[start] === undefined || offsets[piece.at] === undefined) { setSlash(null); return; }
    const query = found[2];
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const prev = slashRef.current;
    setSlash({ query, index: prev && prev.query === query ? prev.index : 0, at: menuAt(rect), from: offsets[start], to: offsets[piece.at] });
  };

  const changed = () => {
    const box = editor.current;
    if (!box) return;
    const next = markdown(box);
    const preserved = next === null ? null : preserveSource(previousMarkdown.current, next, source.current, newline.current);
    const updated = preserved ?? next;
    if (next === null || updated === null || marks(updated) !== markerSequence.current) {
      box.innerHTML = lastHtml.current;
      setWarning(true);
      setSlash(null);
      return;
    }
    lastHtml.current = box.innerHTML;
    previousMarkdown.current = next;
    source.current = updated;
    setWarning(false);
    latest.current.onChange(updated + tail.current);
    syncSlash();
  };
  const reload = (next: string, intoCode = false) => {
    // The formatted view compares the source without the trailing newlines it does not draw.
    const trailing = next.match(/(?:\r?\n)*$/)?.[0] ?? '';
    const core = next.slice(0, next.length - trailing.length);
    const comment = tail.current.replace(/^(?:\r?\n)*/, '');
    tail.current = trailing + comment;
    const token = ++generation.current;
    setSlash(null);
    latest.current.onChange(core + tail.current);
    void api.renderMarkdown(core + tail.current, project, path).then((html) => {
      if (token !== generation.current) return;
      if (!paintRef.current(html, core)) latest.current.onUnsupported();
      else if (intoCode) {
        const box = editor.current;
        const pres = box ? [...box.querySelectorAll('pre:not([data-diagram])')] : [];
        const empty = pres.reverse().find((pre) => !pre.querySelector('code')?.textContent?.replace(/\n/g, '').trim());
        const code = empty?.querySelector('code');
        if (code instanceof HTMLElement) placeCaret(code);
      }
    }).catch(() => { if (token === generation.current) latest.current.onUnsupported(); });
  };
  const pick = (id: string) => {
    const current = slashRef.current;
    if (!current) return;
    reload(applySlash(source.current, current.from, current.to, id, phrases), id === 'code');
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (slash) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setSlash(null); return; }
      if (!matches.length) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); setSlash({ ...slash, index: (picked + 1) % matches.length }); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setSlash({ ...slash, index: (picked - 1 + matches.length) % matches.length }); }
      else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pick(matches[picked].id); }
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    const box = editor.current;
    const sel = window.getSelection();
    if (!box || !sel?.isCollapsed || !sel.anchorNode || !box.contains(sel.anchorNode)) return;
    event.preventDefault();
    const host = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
    const diagram = host?.closest<HTMLElement>('[data-diagram]');
    if (diagram && box.contains(diagram)) { placeCaret(slotAfter(diagram)); return; }
    const block = blockOf(sel.anchorNode, box);
    if (!block) {
      const paragraph = document.createElement('p');
      paragraph.append(document.createElement('br'));
      box.append(paragraph);
      placeCaret(paragraph);
      changed();
      return;
    }
    if (block.tagName === 'PRE' && !block.dataset.diagram) {
      document.execCommand('insertText', false, '\n');
      changed();
      return;
    }
    if (isDiagram(block)) { placeCaret(slotAfter(block)); return; }
    splitBlock(block);
    changed();
  };
  const focusEditor = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const box = editor.current;
    if (!box) return;
    const last = box.lastElementChild;
    const slot = last && isCard(last) ? slotAfter(last) : last instanceof HTMLElement ? last : null;
    if (slot) placeCaret(slot);
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setWarning(true); };
  const menu = slash && createPortal(
    <div ref={slashMenu} className="note-mention note-mention-floating" role="listbox" aria-label={t('Commands')} style={slash.at}>
      {!matches.length ? <p className="muted small">{t('No command matches "{q}".', { q: slash.query })}</p>
        : matches.map((command, i) => (
          <button key={command.id} type="button" role="option" aria-selected={i === picked} className={i === picked ? 'on' : ''}
            onMouseDown={(event) => { event.preventDefault(); pick(command.id); }}>
            <span className="note-slash-glyph" aria-hidden="true">{command.glyph}</span><span className="note-mention-name">{command.label}</span>
          </button>
        ))}
    </div>,
    document.body,
  );

  return <>
    {warning && <p className="notice-bar" role="status">{t('This change could remove formatting or comments. Use Markdown source to make it safely.')}</p>}
    <div ref={editor} className="markdown visual-markdown-editor" role="textbox" aria-label={t('Visual Markdown editor')} aria-multiline="true"
      contentEditable={ready} suppressContentEditableWarning spellCheck onInput={changed} onKeyDown={onKeyDown} onMouseDown={focusEditor} onPaste={paste} onDrop={drop}
      onBlur={() => setTimeout(() => setSlash(null), 150)} />
    {menu}
  </>;
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// A plain fenced block stays editable. The text is kept as written, including blank lines.
function codeFence(node: HTMLElement, probe: Probe): Piece {
  const code = node.querySelector('code') ?? node;
  const body = plainText(code, probe);
  const lang = node.dataset.lang && /^[a-z0-9_+-]+$/.test(node.dataset.lang) ? node.dataset.lang : '';
  const open = '```' + lang + '\n';
  const inner = (body.text ?? '').replace(/\n$/, '');
  const text = open + inner + '\n```';
  return { text, at: body.at === null ? null : Math.min(text.length, open.length + body.at) };
}

function plainText(node: Node, probe: Probe): Piece {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    return { text: raw, at: probe?.node === node ? Math.min(probe.offset, raw.length) : null };
  }
  if (!(node instanceof HTMLElement)) return { text: '', at: null };
  if (node.tagName === 'BR') return { text: '\n', at: probe?.node === node ? 0 : null };
  let text = '';
  let at: number | null = null;
  const children = [...node.childNodes];
  for (let i = 0; i < children.length; i++) {
    if (probe && probe.node === node && probe.offset === i) at = text.length;
    const part = plainText(children[i], probe);
    if (part.at !== null) at = text.length + part.at;
    text += part.text ?? '';
  }
  if (probe && probe.node === node && probe.offset === children.length) at = text.length;
  if ((node.tagName === 'DIV' || node.tagName === 'P') && text && !text.endsWith('\n')) text += '\n';
  return { text, at };
}

function isDiagram(node: Element | null): node is HTMLElement {
  return node instanceof HTMLElement && (node.dataset.diagram === 'mermaid' || node.dataset.diagram === 'excalidraw');
}

// A drawing or a code block is one card. A paragraph stays before and after it,
// so a click below the card writes in the text, not inside the card.
function isCard(node: Element | null): node is HTMLElement {
  return isDiagram(node) || (node instanceof HTMLElement && node.tagName === 'PRE');
}

function ensureSlots(box: HTMLElement) {
  for (const child of [...box.children]) {
    if (!isCard(child)) continue;
    child.contentEditable = 'false';
    if (!child.previousElementSibling || isCard(child.previousElementSibling)) child.before(emptyParagraph());
    if (!child.nextElementSibling || isCard(child.nextElementSibling)) child.after(emptyParagraph());
  }
}

function emptyParagraph(): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.append(document.createElement('br'));
  return paragraph;
}

function slotAfter(card: HTMLElement): HTMLElement {
  const next = card.nextElementSibling;
  if (next instanceof HTMLElement && !isCard(next)) return next;
  const paragraph = emptyParagraph();
  card.after(paragraph);
  return paragraph;
}

function blockOf(node: Node, root: HTMLElement): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : node.parentElement;
  while (el && el !== root) {
    if (el.parentElement === root) return el;
    el = el.parentElement;
  }
  return null;
}

function placeCaret(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function splitBlock(block: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!block.contains(range.startContainer)) return;
  const rest = range.cloneRange();
  rest.selectNodeContents(block);
  rest.setStart(range.startContainer, range.startOffset);
  const next = document.createElement('p');
  next.append(rest.extractContents());
  if (!next.textContent) next.replaceChildren(document.createElement('br'));
  if (!block.textContent) block.replaceChildren(document.createElement('br'));
  block.after(next);
  placeCaret(next);
}

function menuAt(rect: DOMRect): CSSProperties {
  const width = Math.min(320, Math.max(0, window.innerWidth - 16));
  const height = Math.min(260, Math.max(0, window.innerHeight - 16));
  const below = rect.bottom + 4;
  const above = rect.top - height - 4;
  const y = below + height <= window.innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, window.innerHeight - height - 8);
  return { position: 'fixed', top: y, bottom: 'auto', left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), right: 'auto', width, maxHeight: height, transform: 'none' };
}
