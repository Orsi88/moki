// Formatted Markdown: TipTap reads and writes the same .md file. Images, lists and
// typing belong to the editor. The reading view and the source editor stay as they are.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { StarterKit } from '@tiptap/starter-kit';
import { Image as TipTapImage } from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { EXCALIDRAW_STARTER, MERMAID_STARTER } from '../diagram-source';
import { t } from '../i18n';
import { encodeCommentMarks, readComments, restoreComments, type MdComment } from '../md-comments';
import { MdCommentMark } from '../md-comment-mark';
import { DiagramFence } from './DiagramFence';
import { MokiCodeBlock } from './CodeBlockCard';

const IMAGE_MAX = 1200;

interface Props { text: string; path: string; onChange: (text: string) => void; bar?: boolean }

export type TipTapCommand =
  | 'bold' | 'italic' | 'strike' | 'h1' | 'h2' | 'h3'
  | 'list' | 'numbered' | 'checklist' | 'quote' | 'code' | 'codeBlock'
  | 'divider' | 'link' | 'table' | 'diagram' | 'drawing' | 'slash' | 'mention';

export interface TipTapHandle { addImages: (files: File[]) => void; codeBlock: () => void; command: (name: TipTapCommand) => void }

// JPEG has no transparency: a clear pixel would be stored as black. Paint white first.
const imageFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error ?? new Error('image'));
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, IMAGE_MAX / Math.max(img.width, img.height, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      const png = file.type === 'image/jpeg' ? '' : canvas.toDataURL('image/png');
      resolve(png && png.length < 900_000 ? png : canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('image'));
    img.src = String(reader.result ?? '');
  };
  reader.readAsDataURL(file);
});

const insertImages = async (editor: Editor, files: File[]) => {
  for (const file of files) {
    try {
      const src = await imageFile(file);
      editor.chain().focus().setImage({ src }).run();
    } catch { /* a file that is not a readable image is skipped */ }
  }
};

const imageFiles = (list: FileList | null | undefined): File[] => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

// Size and alignment live in the image title, which is only `w=320`, `center` or `right`.
const LAYOUT_TITLE = /^(?:w=(\d+))?(?: )?(center|right)?$/;
const MokiImage = TipTapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-align'),
        renderHTML: (attributes: { align?: string | null }) => (attributes.align ? { 'data-align': attributes.align } : {}),
      },
    };
  },
  parseMarkdown(token, helpers) {
    const title = typeof token.title === 'string' ? token.title : '';
    const layout = title.match(LAYOUT_TITLE);
    const sized = Boolean(layout?.[1] || layout?.[2]);
    return helpers.createNode('image', {
      src: token.href,
      alt: token.text,
      title: sized ? null : (title || null),
      width: layout?.[1] ? Number(layout[1]) : null,
      align: layout?.[2] ?? null,
    });
  },
  renderMarkdown(node) {
    const src = node.attrs?.src ?? '';
    const alt = String(node.attrs?.alt ?? '').replace(/[\[\]]/g, '');
    const parts = [Number(node.attrs?.width) > 0 ? `w=${Math.round(Number(node.attrs?.width))}` : '', node.attrs?.align === 'center' || node.attrs?.align === 'right' ? node.attrs.align : ''].filter(Boolean);
    const title = parts.join(' ') || node.attrs?.title || '';
    return title ? `![${alt}](${src} "${title.replace(/"/g, '')}")` : `![${alt}](${src})`;
  },
});

const imageWidth = (editor: Editor) => {
  const selected = editor.view.dom.querySelector('.ProseMirror-selectednode img');
  const stored = Number(editor.getAttributes('image').width);
  if (stored > 0) return stored;
  return selected instanceof HTMLImageElement ? (selected.clientWidth || selected.naturalWidth) : 0;
};

const scaleImage = (editor: Editor, factor: number) => {
  const current = imageWidth(editor);
  if (!current) return;
  const width = Math.max(80, Math.min(1600, Math.round(current * factor)));
  const selected = editor.view.dom.querySelector('.ProseMirror-selectednode img');
  if (selected instanceof HTMLImageElement) { selected.style.width = `${width}px`; selected.style.height = 'auto'; }
  editor.chain().focus().updateAttributes('image', { width, height: null }).run();
};

const alignImage = (editor: Editor, align: 'center' | 'right' | null) => {
  editor.chain().focus().updateAttributes('image', { align }).run();
};

// The words of the link under the caret, and where they sit in the document.
const linkSpan = (editor: Editor): { from: number; to: number; text: string } | null => {
  const type = editor.schema.marks.link;
  if (!type || !editor.isActive('link')) return null;
  const pos = editor.state.selection.from;
  let from = -1;
  let to = -1;
  const touch = (start: number, end: number) => from >= 0 && end >= from && start <= to;
  for (let pass = 0; pass < 3; pass++) {
    editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, nodePos) => {
      if (!node.isText || !type.isInSet(node.marks)) return;
      const start = nodePos;
      const end = nodePos + node.nodeSize;
      if ((pos < start || pos > end) && !touch(start, end)) return;
      from = from < 0 ? start : Math.min(from, start);
      to = to < 0 ? end : Math.max(to, end);
    });
  }
  if (from < 0) return null;
  return { from, to, text: editor.state.doc.textBetween(from, to, '') };
};

const openLink = (href: string) => {
  const url = href.trim();
  if (!/^https?:\/\/\S+$/i.test(url) || url.length < 10) return;
  window.open(url, '_blank', 'noopener');
};

// Shown on the link: the visible words, the address, and a button that opens it.
// A click on the link itself also opens it; these fields are how the words and the address change.
function LinkBubble({ editor }: { editor: Editor }) {
  const [href, setHref] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const editing = useRef<'url' | 'text' | null>(null);
  useEffect(() => {
    const sync = () => {
      const next = String(editor.getAttributes('link').href ?? '');
      setHref(next);
      if (editing.current !== 'url') setUrl(next);
      if (editing.current !== 'text') setLabel(linkSpan(editor)?.text ?? '');
    };
    sync();
    editor.on('selectionUpdate', sync);
    return () => { editor.off('selectionUpdate', sync); };
  }, [editor]);
  const applyUrl = (next: string) => {
    const value = next.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!value) chain.unsetLink().run();
    else chain.setLink({ href: value }).run();
    setHref(value);
  };
  const applyText = (next: string) => {
    const span = linkSpan(editor);
    const text = next.trim();
    const type = editor.schema.marks.link;
    if (!span || !type || text === span.text) return;
    if (!text) {
      editor.chain().focus().deleteRange({ from: span.from, to: span.to }).run();
      return;
    }
    const mark = type.create({ href: String(editor.getAttributes('link').href ?? '') });
    editor.chain().focus().command(({ tr }) => {
      tr.insertText(text, span.from, span.to);
      tr.addMark(span.from, span.from + text.length, mark);
      return true;
    }).run();
  };
  const onKey = (apply: (value: string) => void, value: string) => (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); apply(value); }
    event.stopPropagation();
  };
  return (
    <BubbleMenu editor={editor} pluginKey="linkMenu" shouldShow={() => editor.isActive('link')} options={{ placement: 'bottom', offset: 8 }}>
      <div className="image-bubble link-bubble" role="toolbar" aria-label={t('Link')}>
        <label className="link-row">
          <span>{t('Text')}</span>
          <input value={label} aria-label={t('Text')}
            onFocus={() => { editing.current = 'text'; }}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={() => { editing.current = null; applyText(label); }}
            onKeyDown={onKey(applyText, label)} />
        </label>
        <label className="link-row">
          <span>{t('Link')}</span>
          <input value={url} aria-label={t('Link')} spellCheck={false} placeholder="https://"
            onFocus={() => { editing.current = 'url'; }}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={() => { editing.current = null; if (url.trim() !== href) applyUrl(url); }}
            onKeyDown={onKey(applyUrl, url)} />
          <button type="button" className="btn btn-sm" onMouseDown={(event) => event.preventDefault()} onClick={() => openLink(url || href)}>{t('Open')}</button>
        </label>
      </div>
    </BubbleMenu>
  );
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface SlashHit { from: number; query: string }

// A / at the start of a block, or after a space, opens the same command list as the source editor.
const slashAt = (editor: Editor): SlashHit | null => {
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return null;
  const text = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0');
  const m = text.match(/(^|\s)\/([\p{L}\p{N}]*)$/u);
  if (!m) return null;
  return { from: $from.pos - m[2].length - 1, query: m[2] };
};

const applyCommand = (editor: Editor, name: TipTapCommand) => {
  const chain = editor.chain().focus();
  const drawing = (lang: 'mermaid' | 'excalidraw', body: string) => chain.insertContent({ type: 'diagramFence', attrs: { lang, body } }).run();
  switch (name) {
    case 'bold': return chain.toggleBold().run();
    case 'italic': return chain.toggleItalic().run();
    case 'strike': return chain.toggleStrike().run();
    case 'h1': return chain.toggleHeading({ level: 1 }).run();
    case 'h2': return chain.toggleHeading({ level: 2 }).run();
    case 'h3': return chain.toggleHeading({ level: 3 }).run();
    case 'list': return chain.toggleBulletList().run();
    case 'numbered': return chain.toggleOrderedList().run();
    case 'checklist': return chain.toggleTaskList().run();
    case 'quote': return chain.toggleBlockquote().run();
    case 'code': return chain.toggleCode().run();
    case 'codeBlock': return chain.toggleCodeBlock().run();
    case 'divider': return chain.setHorizontalRule().run();
    case 'link': {
      const { empty, from } = editor.state.selection;
      const label = t('Link');
      if (empty) {
        return chain.insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: 'https://' } }] })
          .setTextSelection({ from, to: from + label.length }).run();
      }
      return chain.setLink({ href: editor.getAttributes('link').href || 'https://' }).run();
    }
    case 'table': return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case 'diagram': return drawing('mermaid', MERMAID_STARTER);
    case 'drawing': return drawing('excalidraw', EXCALIDRAW_STARTER);
    case 'slash': return chain.insertContent('/').run();
    case 'mention': return chain.insertContent('@').run();
    default: return false;
  }
};

const SLASH: { id: TipTapCommand; label: string; words: string; glyph: string }[] = [
  { id: 'drawing', label: 'Drawing', words: 'excalidraw desenho drawing', glyph: '✎' },
  { id: 'diagram', label: 'Diagram', words: 'mermaid diagrama flowchart', glyph: '◇' },
  { id: 'codeBlock', label: 'Code block', words: 'codigo code', glyph: '</>' },
  { id: 'h1', label: 'Large title', words: 'heading title titulo', glyph: 'H1' },
  { id: 'h2', label: 'Medium title', words: 'heading title titulo', glyph: 'H2' },
  { id: 'h3', label: 'Small title', words: 'heading title titulo', glyph: 'H3' },
  { id: 'list', label: 'List', words: 'bullet lista marcadores', glyph: '•' },
  { id: 'numbered', label: 'Numbered list', words: 'number ordered numerada', glyph: '1.' },
  { id: 'checklist', label: 'Checklist', words: 'checkbox todo task tarefa', glyph: '✓' },
  { id: 'quote', label: 'Quote', words: 'citacao', glyph: '❝' },
  { id: 'table', label: 'Table', words: 'tabela', glyph: '▦' },
  { id: 'divider', label: 'Divider', words: 'line separator linha divisor', glyph: '—' },
  { id: 'link', label: 'Link', words: 'url', glyph: '↗' },
];

interface SlashMenu { from: number; query: string; index: number; top: number; left: number }

const matchesOf = (query: string) => SLASH.filter((c) => fold(`${t(c.label)} ${c.id} ${c.words}`).includes(fold(query)));

export const TipTapEditor = forwardRef<TipTapHandle, Props>(function TipTapEditor({ text, path, onChange, bar = true }, ref) {
  const change = useRef(onChange);
  change.current = onChange;
  // The comment list is not part of the editor document. Marks stay in the text;
  // this puts the list back on every change, and drops a comment whose words were deleted.
  const comments = useRef<MdComment[]>(readComments(text).comments);
  const restore = (markdown: string) => {
    const next = restoreComments(markdown, comments.current);
    comments.current = readComments(next).comments;
    return next;
  };
  const editorRef = useRef<Editor | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const seen = useRef(text);
  const slashRef = useRef<SlashMenu | null>(null);
  const [slash, setSlash] = useState<SlashMenu | null>(null);
  const syncRef = useRef<(current: Editor) => void>(() => {});
  syncRef.current = (current) => {
    const found = slashAt(current);
    if (!found) {
      if (slashRef.current) { slashRef.current = null; setSlash(null); }
      return;
    }
    const coords = current.view.coordsAtPos(found.from);
    const prev = slashRef.current;
    const menuHeight = Math.min(280, Math.max(1, matchesOf(found.query).length) * 30 + 12);
    const roomBelow = window.innerHeight - coords.bottom;
    const top = roomBelow < menuHeight && coords.top > roomBelow ? Math.max(8, coords.top - menuHeight - 4) : coords.bottom + 4;
    const next: SlashMenu = {
      from: found.from,
      query: found.query,
      index: prev && prev.from === found.from && prev.query === found.query ? prev.index : 0,
      top,
      left: Math.min(Math.max(8, coords.left), Math.max(8, window.innerWidth - 328)),
    };
    slashRef.current = next;
    setSlash(next);
  };
  const pickSlash = (name: TipTapCommand) => {
    const current = editorRef.current;
    const menu = slashRef.current;
    if (!current || !menu) return;
    const to = current.state.selection.from;
    slashRef.current = null;
    setSlash(null);
    current.chain().focus().deleteRange({ from: menu.from, to }).run();
    applyCommand(current, name);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: { openOnClick: false } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      MokiCodeBlock,
      MokiImage.configure({
        allowBase64: true,
        resize: { enabled: true, minWidth: 80, minHeight: 40, alwaysPreserveAspectRatio: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'task-item' } }),
      DiagramFence,
      MdCommentMark,
      Markdown,
    ],
    content: encodeCommentMarks(readComments(text).body),
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'tiptap-body', spellcheck: 'true' },
      handleClick(view, pos, event) {
        const el = event.target instanceof Element ? event.target.closest('a') : null;
        if (!el || !view.dom.contains(el)) return false;
        event.preventDefault();
        editorRef.current?.commands.setTextSelection(pos);
        openLink(el.getAttribute('href') ?? '');
        return true;
      },
      handlePaste(_view, event) {
        const images = imageFiles(event.clipboardData?.files);
        if (!images.length || !editorRef.current) return false;
        event.preventDefault();
        void insertImages(editorRef.current, images);
        return true;
      },
      handleDrop(_view, event) {
        const images = imageFiles(event.dataTransfer?.files);
        if (!images.length || !editorRef.current) return false;
        event.preventDefault();
        void insertImages(editorRef.current, images);
        return true;
      },
      handleKeyDown(_view, event) {
        const menu = slashRef.current;
        if (!menu) return false;
        const matches = matchesOf(menu.query);
        const n = matches.length;
        if (event.key === 'Escape') { event.preventDefault(); slashRef.current = null; setSlash(null); return true; }
        if (n && event.key === 'ArrowDown') {
          event.preventDefault();
          const next = { ...menu, index: (menu.index + 1) % n };
          slashRef.current = next;
          setSlash(next);
          return true;
        }
        if (n && event.key === 'ArrowUp') {
          event.preventDefault();
          const next = { ...menu, index: (menu.index - 1 + n) % n };
          slashRef.current = next;
          setSlash(next);
          return true;
        }
        if (n && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); pickSlash(matches[menu.index].id); return true; }
        return false;
      },
    },
    onCreate: ({ editor: current }) => { seen.current = restore(current.getMarkdown()); },
    onSelectionUpdate: ({ editor: current }) => { syncRef.current(current); },
    onUpdate: ({ editor: current, transaction }) => {
      syncRef.current(current);
      if (!transaction.docChanged) return;
      const next = restore(current.getMarkdown());
      if (next === seen.current) return;
      seen.current = next;
      change.current(next);
    },
  }, [path]);
  editorRef.current = editor;
  useImperativeHandle(ref, () => ({
    addImages: (files) => { if (editorRef.current) void insertImages(editorRef.current, files.filter((f) => f.type.startsWith('image/'))); },
    codeBlock: () => { editorRef.current?.chain().focus().toggleCodeBlock().run(); },
    command: (name) => { if (editorRef.current) applyCommand(editorRef.current, name); },
  }), []);

  // A reload (or the AI writing the file) replaces the document. Typing already updated `seen`.
  useEffect(() => {
    if (!editor || text === seen.current) return;
    const read = readComments(text);
    comments.current = read.comments;
    seen.current = text;
    editor.commands.setContent(encodeCommentMarks(read.body), { contentType: 'markdown', emitUpdate: false });
  }, [editor, text]);

  if (!editor) return null;
  const run = (command: () => boolean) => { command(); };
  const pickImage = (list: FileList | null) => { void insertImages(editor, imageFiles(list)); if (file.current) file.current.value = ''; };
  const slashMatches = slash ? matchesOf(slash.query) : [];

  return (
    <div className="tiptap-wrap">
      {bar && <div className="tiptap-bar" role="toolbar" aria-label={t('Visual editor')}>
        <button type="button" className={`icon-btn${editor.isActive('heading', { level: 1 }) ? ' on' : ''}`} title={t('Large title')} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}>H1</button>
        <button type="button" className={`icon-btn${editor.isActive('heading', { level: 2 }) ? ' on' : ''}`} title={t('Medium title')} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>H2</button>
        <button type="button" className={`icon-btn${editor.isActive('bold') ? ' on' : ''}`} title={t('Bold')} onClick={() => run(() => editor.chain().focus().toggleBold().run())}><b>B</b></button>
        <button type="button" className={`icon-btn${editor.isActive('italic') ? ' on' : ''}`} title={t('Italic')} onClick={() => run(() => editor.chain().focus().toggleItalic().run())}><i>I</i></button>
        <button type="button" className={`icon-btn${editor.isActive('bulletList') ? ' on' : ''}`} title={t('List')} onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}>•</button>
        <button type="button" className={`icon-btn${editor.isActive('orderedList') ? ' on' : ''}`} title={t('Numbered list')} onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}>1.</button>
        <button type="button" className={`icon-btn${editor.isActive('taskList') ? ' on' : ''}`} title={t('Checklist')} onClick={() => run(() => editor.chain().focus().toggleTaskList().run())}>✓</button>
        <button type="button" className={`icon-btn${editor.isActive('codeBlock') ? ' on' : ''}`} title={t('Code block')} onClick={() => run(() => editor.chain().focus().toggleCodeBlock().run())}>&lt;/&gt;</button>
        <button type="button" className="icon-btn" title={t('Image')} onClick={() => file.current?.click()}>{t('Image')}</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files)} />
      </div>}
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} pluginKey="imageMenu" shouldShow={() => editor.isActive('image')} options={{ placement: 'top', offset: 8 }}>
        <div className="image-bubble" role="toolbar" aria-label={t('Image')}>
          <button type="button" className="icon-btn" title={t('Zoom out')} aria-label={t('Zoom out')} onMouseDown={(e) => e.preventDefault()} onClick={() => scaleImage(editor, 0.85)}>−</button>
          <button type="button" className="icon-btn" title={t('Zoom in')} aria-label={t('Zoom in')} onMouseDown={(e) => e.preventDefault()} onClick={() => scaleImage(editor, 1.15)}>+</button>
          <span className="sep" />
          {(['left', 'center', 'right'] as const).map((side) => {
            const align = side === 'left' ? null : side;
            const on = (editor.getAttributes('image').align ?? null) === align;
            const label = t(side === 'left' ? 'Left' : side === 'center' ? 'Center' : 'Right');
            return (
              <button key={side} type="button" className={`icon-btn${on ? ' on' : ''}`} title={label} aria-label={label} aria-pressed={on}
                onMouseDown={(e) => e.preventDefault()} onClick={() => alignImage(editor, align)}>{side === 'left' ? '⇤' : side === 'right' ? '⇥' : '↔'}</button>
            );
          })}
        </div>
      </BubbleMenu>
      <LinkBubble editor={editor} />
      {slash && createPortal(
        <div className="note-mention note-mention-floating" role="listbox" aria-label={t('Commands')} style={{ position: 'fixed', top: slash.top, left: slash.left }}>
          {!slashMatches.length ? <p className="muted small">{t('No command matches "{q}".', { q: slash.query })}</p>
            : slashMatches.map((c, i) => (
              <button key={c.id} type="button" role="option" aria-selected={i === slash.index} className={i === slash.index ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); pickSlash(c.id); }}>
                <span className="note-slash-glyph" aria-hidden="true">{c.glyph}</span><span className="note-mention-name">{t(c.label)}</span>
              </button>
            ))}
        </div>,
        document.body,
      )}
    </div>
  );
});
