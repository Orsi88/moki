// Visual Markdown editing for documents whose rendered form can round-trip without loss.
// Unsupported markup stays in the original editor instead of being rewritten.
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import { readComments, SWATCH } from '../md-comments';

const escapeText = (text: string) => text.replace(/\u00a0/g, ' ').replace(/[\\`*_~[\]]/g, '\\$&');

function inline(node: Node): string | null {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '');
  if (!(node instanceof HTMLElement)) return null;
  if (node.tagName === 'BR') return '\n';
  const parts = [...node.childNodes].map(inline);
  if (parts.some((part) => part === null)) return null;
  const text = parts.join('');
  switch (node.tagName) {
    case 'STRONG': case 'B': return text ? `**${text}**` : null;
    case 'EM': case 'I': return text ? `*${text}*` : null;
    case 'DEL': case 'S': return text ? `~~${text}~~` : null;
    case 'CODE': return text && !text.includes('`') ? `\`${text}\`` : null;
    case 'SPAN': return node.attributes.length === 0 ? text : null;
    case 'MARK': {
      const id = node.dataset.c;
      return id && /^[a-z0-9]+$/.test(id) && text ? `<!--c:${id}-->${text}<!--/c:${id}-->` : null;
    }
    default: return null;
  }
}

function list(node: HTMLElement): string | null {
  const ordered = node.tagName === 'OL';
  const out: string[] = [];
  for (const [index, item] of [...node.children].entries()) {
    if (item.tagName !== 'LI') return null;
    const pieces = [...item.childNodes].map(inline);
    if (pieces.some((part) => part === null)) return null;
    out.push(`${ordered ? `${index + 1}.` : '-'} ${pieces.join('')}`);
  }
  return out.join('\n');
}

function markdown(root: HTMLElement): string | null {
  const blocks: string[] = [];
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;
    if (!(node instanceof HTMLElement)) {
      const text = inline(node);
      if (text === null) return null;
      blocks.push(text);
      continue;
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      const value = list(node);
      if (value === null) return null;
      blocks.push(value);
      continue;
    }
    if (!/^(P|DIV|H[1-6])$/.test(node.tagName)) return null;
    const pieces = [...node.childNodes].map(inline);
    if (pieces.some((part) => part === null)) return null;
    const value = pieces.join('');
    const heading = /^H([1-6])$/.exec(node.tagName);
    blocks.push(`${heading ? `${'#'.repeat(Number(heading[1]))} ` : ''}${value === '\n' ? '' : value}`);
  }
  return blocks.join('\n\n');
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

  useEffect(() => {
    let cancelled = false;
    const original = initial.current;
    const { body, comments } = readComments(original);
    newline.current = body.includes('\r\n') && !/(?<!\r)\n/.test(body) ? '\r\n' : '\n';
    const trailing = body.match(/(?:\r?\n)*$/)?.[0] ?? '';
    const core = body.slice(0, body.length - trailing.length);
    tail.current = trailing + original.slice(body.length);
    markerSequence.current = marks(core);
    void api.renderMarkdown(original, project, path).then((html) => {
      if (cancelled || !editor.current) return;
      editor.current.innerHTML = html;
      const rendered = markdown(editor.current);
      if (rendered === null || !sourceOffsets(rendered, core)) { latest.current.onUnsupported(); return; }
      previousMarkdown.current = rendered;
      source.current = core;
      const colors = new Map(comments.map((comment) => [comment.id, comment.color]));
      editor.current.querySelectorAll<HTMLElement>('mark.md-comment').forEach((mark) => {
        const color = colors.get(mark.dataset.c ?? '');
        mark.style.setProperty('--md-comment-color', color ? SWATCH[color] : 'var(--accent)');
      });
      lastHtml.current = editor.current.innerHTML;
      setReady(true);
    }).catch(() => { if (!cancelled) latest.current.onUnsupported(); });
    return () => { cancelled = true; };
  }, [project, path]);

  const changed = () => {
    const box = editor.current;
    if (!box) return;
    const next = markdown(box);
    const updated = next === null ? null : preserveSource(previousMarkdown.current, next, source.current, newline.current);
    if (next === null || updated === null || marks(updated) !== markerSequence.current) {
      box.innerHTML = lastHtml.current;
      setWarning(true);
      return;
    }
    lastHtml.current = box.innerHTML;
    previousMarkdown.current = next;
    source.current = updated;
    setWarning(false);
    latest.current.onChange(updated + tail.current);
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setWarning(true); };

  return <>
    {warning && <p className="notice-bar" role="status">{t('This change could remove formatting or comments. Use Markdown source to make it safely.')}</p>}
    <div ref={editor} className="markdown visual-markdown-editor" role="textbox" aria-label={t('Visual Markdown editor')} aria-multiline="true"
      contentEditable={ready} suppressContentEditableWarning spellCheck onInput={changed} onPaste={paste} onDrop={drop} />
  </>;
}
