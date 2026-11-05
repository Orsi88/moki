import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type DragEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api, type PdfChange, type PdfComment, type PdfMark, type PdfNote } from '../api';
import { t } from '../i18n';
import { selectionNote, stackCards } from '../pdf-quads';
import { IconChat, IconEdit, IconHighlight, IconNativeViewer, IconNotePlus, IconPages, IconPlus, IconSearch, IconTrash, IconX } from './Icons';
import { recall, remember } from '../prefs';
import { PdfPages } from './PdfPages';
import { NoteDialog } from './NoteDialog';
import { COLORS, SWATCH as COLOR_SWATCH } from '../md-comments';
import { colorName } from './CommentColors';

const SWATCH: Record<string, string> = COLOR_SWATCH;
const CSS_UNITS = 96 / 72; // as PdfPages draws the pages
const CARD_GAP = 10;
const KEPT_SELECTION = 'pdf-selection';

// The comment box takes focus, and the browser then hides the text selection. A cloned range painted
// with the same colour stays on the passage until the box closes.
const keepSelection = () => {
  const sel = window.getSelection();
  const marks = CSS as unknown as { highlights?: { set: (name: string, value: unknown) => void } };
  const Highlight = (window as unknown as { Highlight?: new (range: Range) => unknown }).Highlight;
  if (!sel?.rangeCount || !marks.highlights || !Highlight) return;
  marks.highlights.set(KEPT_SELECTION, new Highlight(sel.getRangeAt(0).cloneRange()));
};
const dropSelection = () => {
  (CSS as unknown as { highlights?: { delete: (name: string) => void } }).highlights?.delete(KEPT_SELECTION);
  window.getSelection()?.removeAllRanges();
};

// The panel mode stays when a change opens the -edited copy in a new tab.
let lastTab: 'comment' | 'edit' = 'comment';

interface Props {
  project: string;
  path: string;
  data: string; // base64
  native: ReactNode; // Chromium's own viewer (search, print)
  onSaved: (path: string) => void; // the file the change was saved to
}

interface Placed { id: string; ax: number; ay: number; edge: number; top: number; color: string } // edge: the right side of its page

// The browser's resize grip does not reliably dispatch mouseup, so observe the
// card and save its final size after the person stops dragging.
function ResizableNote({ height, borderColor, onHeight, children }: { height: number; borderColor?: string; onHeight: (height: number) => void; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  const current = useRef({ height, onHeight });
  current.current = { height, onHeight };
  useEffect(() => {
    const box = element.current;
    if (!box) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      const next = Math.max(140, Math.min(2400, Math.round(box.getBoundingClientRect().height)));
      clearTimeout(timer);
      if (Math.abs(next - current.current.height) > 2) timer = setTimeout(() => current.current.onHeight(next), 500);
    });
    observer.observe(box);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  return <div ref={element} className="pdf-inline-note" style={{ height, borderLeftColor: borderColor }}>{children}</div>;
}

function NoteBorderColor({ color, disabled, onChange }: { color?: string; disabled: boolean; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="note-border-color" onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
    {open && <div className="pdf-colors" role="radiogroup" aria-label={t('Note border color')}>
      {COLORS.map((c) => <button key={c} type="button" role="radio" className={`pdf-color${color === c ? ' on' : ''}`}
        aria-checked={color === c} title={colorName(c)} aria-label={colorName(c)} style={{ background: SWATCH[c] }} disabled={disabled}
        onClick={() => { onChange(c); setOpen(false); }} />)}
    </div>}
    <button type="button" className="icon-btn note-border-color-toggle" title={t('Change note border color')} aria-label={t('Change note border color')}
      aria-expanded={open} disabled={disabled} onClick={() => setOpen((v) => !v)}>
      <span className="note-border-color-dot" style={{ background: color ? SWATCH[color] : 'var(--accent)' }} />
    </button>
  </div>;
}

// A PDF with its comments and page edits. On the left, fixed: the view, zoom, the colour,
// highlight by search, and the page edits (a bar under each page: rotate, move, insert a blank
// page, delete; title and author). In the middle the pages drawn by pdf.js: selecting text opens
// a small box right there to highlight and comment. On the right the comments scroll with the
// pages, each beside what it comments (PdfCraft's rect), joined to it by a thin line; reply,
// edit and delete there. PdfCraft writes every change.
export function PdfDoc({ project, path, data, native, onSaved }: Props) {
  const [view, setView] = useState<'pages' | 'native'>('pages');
  const [zoom, setZoomState] = useState(1);
  const zoomed = useRef(false); // the person chose a zoom: it is no longer fitted to the window
  const setZoom = (fn: (z: number) => number) => { zoomed.current = true; setZoomState(fn); };
  const scroller = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [mac, setMac] = useState(false);
  const [comments, setComments] = useState<PdfComment[]>([]);
  const [notes, setNotes] = useState<PdfNote[]>([]);
  const [noteBusy, setNoteBusy] = useState(false);
  const [draggingNote, setDraggingNote] = useState(false);
  const [color, setColor] = useState('yellow');
  // The search field: every match in the document (page, and which match of that page), the one shown.
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ page: number; nth: number }[] | null>(null);
  const [hit, setHit] = useState(0);
  const pdf = useRef<PDFDocumentProxy | null>(null);
  const onDoc = useCallback((d: PDFDocumentProxy | null) => { pdf.current = d; setHits(null); }, []);
  const [composer, setComposer] = useState<{ marks: PdfMark[]; x: number; y: number; text: string; quote: string; rects: { left: number; top: number; width: number; height: number }[] } | null>(null);
  const [editing, setEditing] = useState<{ id: string; mode: 'reply' | 'edit'; text: string } | null>(null);
  const [active, setActive] = useState('');
  // The comment column, opened or closed from the bar (remembered); closed, the pages take the room and marks on their edge show where comments are.
  const [railOff, setRailOffState] = useState(() => recall('qa-pdf-comments') === 'closed');
  const setRailOff = (off: boolean) => { setRailOffState(off); remember('qa-pdf-comments', off ? 'closed' : 'open'); };
  const [tab, setTabState] = useState(lastTab);
  const setTab = (next: 'comment' | 'edit') => { lastTab = next; setTabState(next); };
  const [info, setInfo] = useState({ pages: 0, title: '', author: '' });
  const [props, setProps] = useState({ title: '', author: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<{ items: Placed[]; rail: number; railTop: number; height: number }>({ items: [], rail: 0, railTop: 0, height: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const properties = useRef<HTMLDetailsElement>(null);
  const toNative = useCallback(() => setView('native'), []);
  const onLoad = useCallback((i: { pages: number; title: string; author: string }) => { setInfo(i); setProps({ title: i.title, author: i.author }); }, []);
  // The service saves to a "-edited" copy: always for files from the inbox, and for page edits of any file.
  const isCopy = /-edited(-\d+)?\.pdf$/i.test(path);
  const copied = path.startsWith('inbox/') && !isCopy;

  useEffect(() => { api.pdfcraftStatus().then((s) => { setAvailable(s.available); setMac(s.platform === 'darwin'); }).catch(() => setAvailable(false)); }, []);
  useEffect(() => { api.pdfNotes(project, path).then(setNotes).catch((e: Error) => setError(e.message)); }, [project, path]);
  useEffect(() => {
    if (!available) return;
    api.pdfComments(project, path).then(setComments).catch((e: Error) => setError(e.message));
  }, [available, project, path, data]);

  // Where each card goes: beside its place on its page, pushed down under the card above when they would overlap.
  const measure = useCallback(() => {
    const box = stage.current;
    const column = rail.current; // null while the column is closed: only the marks on the pages' edge
    if (!box) return;
    const origin = box.getBoundingClientRect();
    const px = zoom * CSS_UNITS;
    const pages = new Map([...box.querySelectorAll<HTMLElement>('.pdf-page')].map((el) => [Number(el.dataset.page), el.getBoundingClientRect()]));
    const heights = new Map([...(column?.querySelectorAll<HTMLElement>('[data-card]') ?? [])].map((el) => [el.dataset.card ?? '', el.offsetHeight]));
    const wanted = comments.flatMap((c) => {
      const page = pages.get(c.page);
      if (!page) return [];
      const r = c.rect ?? [0, 0, page.width / px, 0];
      return [{ id: c.id, ax: page.left - origin.left + r[2] * px, ay: page.top - origin.top + ((r[1] + r[3]) / 2) * px, edge: page.right - origin.left, color: SWATCH[c.color ?? ''] ?? c.color ?? 'var(--accent)' }];
    });
    const tops = stackCards(wanted.map((w) => ({ id: w.id, top: w.ay - 18, height: heights.get(w.id) ?? 90 })), CARD_GAP);
    // The height of the pages, not of the stage: the column and the lines take it, so measuring the stage would grow it each time.
    const pagesHeight = box.querySelector<HTMLElement>('.pdf-pages')?.offsetHeight ?? 0;
    const bottom = Math.max(0, ...wanted.map((w) => tops[w.id] + (heights.get(w.id) ?? 90)));
    // The cards sit in the column, which starts below the stage's top (its margin): their tops are in its coordinates.
    const railBox = column?.getBoundingClientRect() ?? origin;
    const railTop = railBox.top - origin.top;
    const next = { items: wanted.map((w) => ({ ...w, top: Math.max(0, tops[w.id] - railTop) })), rail: railBox.left - origin.left, railTop, height: Math.max(pagesHeight, bottom + 16) };
    setPlaced((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, [comments, zoom]);
  useLayoutEffect(() => { measure(); });
  // The comments take the place of the project panel on the right (Workspace listens): one open at a time.
  const sideOn = Boolean(available) && tab === 'comment' && !railOff && view === 'pages';
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('moki:doc-side', { detail: sideOn }));
    return () => { window.dispatchEvent(new CustomEvent('moki:doc-side', { detail: false })); };
  }, [sideOn]);
  useEffect(() => {
    const close = () => setRailOff(true);
    window.addEventListener('moki:doc-side-close', close);
    return () => window.removeEventListener('moki:doc-side-close', close);
  }, []);
  // Until the person zooms, the pages fit the room left beside the comment column (never above 100%).
  useEffect(() => {
    const box = scroller.current;
    if (!box || view !== 'pages') return undefined;
    const fit = () => {
      const page = box.querySelector<HTMLElement>('.pdf-page');
      const widthPt = Number(page?.dataset.widthPt) || 612;
      if (zoomed.current) return;
      const room = box.clientWidth - 32 - (available && tab === 'comment' && !railOff ? 356 : 0);
      const next = Math.max(0.5, Math.min(1, Math.floor((room / (widthPt * CSS_UNITS)) * 20) / 20));
      setZoomState((z) => (z === next ? z : next));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    return () => watch.disconnect();
  }, [view, available, tab, info.pages, railOff]);
  useEffect(() => {
    const box = stage.current;
    if (!box) return undefined;
    const watch = new ResizeObserver(() => measure());
    watch.observe(box);
    return () => watch.disconnect();
  }, [measure, view]);

  const apply = (change: PdfChange): Promise<boolean> => {
    setBusy(true);
    setError('');
    return api.pdfChange(project, path, change)
      .then(async (r) => {
        setComments(r.comments);
        if (r.path === path) {
          try { setNotes(await api.pdfNotes(project, path)); }
          catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        }
        onSaved(r.path);
        return true;
      })
      .catch((e: Error) => { setError(e.message); return false; })
      .finally(() => setBusy(false));
  };

  // A selection on the pages opens the box beside it.
  const onSelection = (marks: PdfMark[] | null) => {
    const box = stage.current;
    const sel = window.getSelection();
    if (!marks || !box || !sel?.rangeCount) { setComposer((c) => (c && !c.text ? null : c)); return; }
    keepSelection();
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const origin = box.getBoundingClientRect();
    const rects = [...sel.getRangeAt(0).getClientRects()].filter((item) => item.width > 1 && item.height > 1 && item.height < 80).map((item) => ({
      left: item.left - origin.left, top: item.top - origin.top, width: item.width, height: item.height,
    }));
    setComposer({ marks, x: Math.max(8, r.left - origin.left), y: r.bottom - origin.top + 8, text: '', quote: sel.toString(), rects });
  };
  const highlightSelection = () => {
    if (!composer) return;
    void apply({ op: 'highlight', marks: composer.marks, contents: composer.text.trim() || undefined, color }).then((ok) => {
      if (!ok) return;
      setComposer(null);
      dropSelection();
    });
  };
  // The selected text as a note of this project (notes/), opened in the notebook; the PDF is not changed.
  const noteFromSelection = () => {
    if (!composer?.quote.trim()) return;
    const { title, text } = selectionNote(path, composer.marks, composer.quote);
    setError('');
    api.createNote(project, title, text)
      .then((created) => { setComposer(null); dropSelection(); return api.openNoteWindow({ project, path: created }); })
      .catch((e: Error) => setError(e.message));
  };
  // Every match of the field's text in the document, from each page's text (case ignored).
  const runSearch = async (text: string): Promise<{ page: number; nth: number }[]> => {
    const doc = pdf.current;
    const want = text.trim().toLowerCase();
    if (!doc || !want) return [];
    const out: { page: number; nth: number }[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const hay = content.items.map((i) => ('str' in i ? i.str : '')).join('').toLowerCase();
      let nth = 0;
      for (let at = hay.indexOf(want); at >= 0; at = hay.indexOf(want, at + want.length)) out.push({ page: n, nth: nth++ });
    }
    return out;
  };
  // A match shown: its page scrolled to, the match selected there (so the box to highlight and comment opens).
  const show = (list: { page: number; nth: number }[], i: number) => {
    const m = list[i];
    const box = stage.current;
    if (!m || !box) return;
    setHit(i);
    box.querySelector(`.pdf-page[data-page="${m.page}"]`)?.scrollIntoView({ block: 'center' });
    const want = query.trim().toLowerCase();
    let tries = 0;
    const pick = () => {
      const spans = [...box.querySelectorAll<HTMLElement>(`.pdf-page[data-page="${m.page}"] .textLayer span`)].filter((s) => s.firstChild instanceof Text);
      if (!spans.length) { if (++tries < 40) setTimeout(pick, 50); return; } // the page draws its text once it is near the screen
      const runs = spans.map((s) => ({ node: s.firstChild as Text, text: (s.firstChild as Text).data }));
      const hay = runs.map((r) => r.text).join('').toLowerCase();
      let at = -1;
      for (let k = 0; k <= m.nth; k++) { at = hay.indexOf(want, at + 1); if (at < 0) return; }
      const place = (offset: number): [Text, number] => {
        let left = offset;
        for (const r of runs) { if (left <= r.text.length) return [r.node, left]; left -= r.text.length; }
        const last = runs[runs.length - 1];
        return [last.node, last.text.length];
      };
      const range = document.createRange();
      range.setStart(...place(at));
      range.setEnd(...place(at + want.length));
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(range);
      (range.startContainer.parentElement)?.scrollIntoView({ block: 'center' });
      box.querySelector('.pdf-pages')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };
    pick();
  };
  const find = async (step: 1 | -1 = 1) => {
    if (hits && hits.length) { show(hits, (hit + step + hits.length) % hits.length); return; }
    const list = await runSearch(query);
    setHits(list);
    if (list.length) show(list, 0);
  };
  // Every match highlighted at once, page by page, in the chosen colour.
  const highlightAll = async () => {
    const pages = [...new Set((hits ?? []).map((m) => m.page))];
    for (const page of pages) {
      if (!(await apply({ op: 'highlight', page, find: query.trim(), all: true, color }))) return;
    }
    setComposer(null);
  };

  const finishEdit = () => {
    if (!editing) return;
    const change: PdfChange = editing.mode === 'reply' ? { op: 'reply', id: editing.id, text: editing.text } : { op: 'edit', id: editing.id, contents: editing.text };
    void apply(change).then((ok) => { if (ok) setEditing(null); });
  };
  const remove = (c: PdfComment) => {
    if (window.confirm(t('Delete this comment?'))) void apply({ op: 'delete', id: c.id });
  };

  const off = !available || busy || noteBusy;
  const edit = (change: PdfChange) => { if (!off) void apply(change); };

  const saveNotes = async (next: PdfNote[]) => {
    setNoteBusy(true); setError('');
    try { setNotes(await api.setPdfNotes(project, path, next)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setNoteBusy(false); }
  };
  const addNote = (after: number, note: PdfNote['note']) => {
    void saveNotes([...notes, { id: crypto.randomUUID(), after, note }]);
  };
  const newNote = async (after: number) => {
    setNoteBusy(true);
    try { const created = await api.createNote(project, t('New note'), ''); addNote(after, { path: created }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setNoteBusy(false); }
  };
  const isNoteDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('application/x-moki-note');
  const dropNote = (e: DragEvent, after: number) => {
    if (!isNoteDrag(e) || noteBusy) return;
    e.preventDefault(); e.stopPropagation(); setDraggingNote(false);
    try {
      const ref: unknown = JSON.parse(e.dataTransfer.getData('application/x-moki-note'));
      if (!ref || typeof ref !== 'object') return;
      const candidate = ref as { project?: unknown; path?: unknown; loose?: unknown };
      if (candidate.project && candidate.project !== project) { setError(t('This note belongs to another project.')); return; }
      if (typeof candidate.path === 'string' && /^notes\/[^/]+\.md$/.test(candidate.path)) addNote(after, { path: candidate.path });
      else if (typeof candidate.loose === 'string' && /^[0-9a-f-]{36}$/i.test(candidate.loose)) addNote(after, { loose: candidate.loose });
    } catch { setError(t('Could not add the note.')); }
  };
  const afterPage = (n: number) => (
    <div className="pdf-between">
      {notes.filter((entry) => entry.after === n).map((entry) => (
        <ResizableNote key={entry.id} height={entry.height ?? 300} borderColor={entry.color ? SWATCH[entry.color] : undefined} onHeight={(height) => {
          void saveNotes(notes.map((item) => item.id === entry.id ? { ...item, height } : item));
        }}>
          <NoteDialog project={'path' in entry.note ? project : null} path={'path' in entry.note ? entry.note.path : null}
            looseId={'loose' in entry.note ? entry.note.loose : null} embedded inline closeLabel={t('Remove note from PDF')}
            inlineActions={<NoteBorderColor color={entry.color} disabled={noteBusy} onChange={(next) => {
              void saveNotes(notes.map((item) => item.id === entry.id ? { ...item, color: next } : item));
            }} />}
            onClose={() => { void saveNotes(notes.filter((item) => item.id !== entry.id)); }} />
        </ResizableNote>
      ))}
      {draggingNote && (
        <div className={`pdf-note-drop${draggingNote ? ' dragging' : ''}`} onDragOver={(e) => { if (isNoteDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }} onDrop={(e) => dropNote(e, n)}>
          <span className="muted small">{t('Drop note here')}</span>
        </div>
      )}
    </div>
  );

  // Edit mode: a bar under each page drawn by pdf.js.
  const pageTools = (n: number, total: number) => (
    <div className="pdf-page-tools" role="group" aria-label={t('page {n}', { n })}>
      <span className="muted small">{n} / {total}</span>
      <button type="button" className="icon-btn" disabled={off} title={t('Rotate left')} aria-label={t('Rotate left')} onClick={() => edit({ op: 'rotate-pages', pages: [n], degrees: 270 })}>↺</button>
      <button type="button" className="icon-btn" disabled={off} title={t('Rotate right')} aria-label={t('Rotate right')} onClick={() => edit({ op: 'rotate-pages', pages: [n], degrees: 90 })}>↻</button>
      <button type="button" className="icon-btn" disabled={off || n === 1} title={t('Move up')} aria-label={t('Move up')} onClick={() => edit({ op: 'move-page', page: n, to: n - 1 })}>↑</button>
      <button type="button" className="icon-btn" disabled={off || n === total} title={t('Move down')} aria-label={t('Move down')} onClick={() => edit({ op: 'move-page', page: n, to: n + 1 })}>↓</button>
      <button type="button" className="icon-btn" disabled={off} title={t('Insert blank page after')} aria-label={t('Insert blank page after')} onClick={() => edit({ op: 'insert-blank', at: n + 1 })}><IconPlus size={15} /></button>
      <button type="button" className="icon-btn" disabled={noteBusy || busy} title={t('Add a note here')} aria-label={t('Add a note here')} onClick={() => { void newNote(n); }}><IconNotePlus size={16} /></button>
      <button type="button" className="icon-btn" disabled={off || total === 1} title={t('Delete page')} aria-label={t('Delete page')}
        onClick={() => { if (window.confirm(t('Delete page {n}?', { n }))) edit({ op: 'delete-pages', pages: [n] }); }}><IconTrash size={15} /></button>
    </div>
  );

  const swatches = (
    <div className="pdf-colors" role="radiogroup" aria-label={t('Color')}>
      {COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={colorName(c)} title={colorName(c)}
          className={`pdf-color${color === c ? ' on' : ''}`} onClick={() => setColor(c)}><span style={{ background: SWATCH[c] }} /></button>
      ))}
    </div>
  );

  const item = (c: PdfComment, reply = false) => (
    <div className={reply ? 'pdf-reply' : 'pdf-comment-body'}>
      <div className="pdf-comment-head">
        {!reply && <span className="pdf-swatch" style={{ background: SWATCH[c.color ?? ''] ?? c.color ?? 'transparent' }} />}
        <strong>{c.author || t('Unknown author')}</strong>
        {!reply && <span className="muted small">{t('page {n}', { n: c.page })}</span>}
      </div>
      {editing?.id === c.id ? (
        <div className="pdf-edit">
          <textarea value={editing.text} autoFocus rows={3} onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }} onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            placeholder={editing.mode === 'reply' ? t('Your reply') : t('Comment')} />
          <div className="pdf-actions">
            <button type="button" className="btn btn-sm" disabled={off || (editing.mode === 'reply' && !editing.text.trim())} onClick={finishEdit}>{t('Save')}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>{t('Cancel')}</button>
          </div>
        </div>
      ) : (
        <>
          {c.contents ? <p className="pdf-comment-text">{c.contents}</p> : !reply && <p className="muted small">{t('Highlight without a comment.')}</p>}
          <div className="pdf-actions">
            {!reply && <button type="button" className="link-btn" disabled={off} onClick={() => setEditing({ id: c.id, mode: 'reply', text: '' })}>{t('Reply')}</button>}
            <button type="button" className="link-btn" disabled={off} onClick={() => setEditing({ id: c.id, mode: 'edit', text: c.contents ?? '' })}>{t('Edit')}</button>
            <button type="button" className="link-btn" disabled={off} onClick={() => remove(c)}>{t('Delete')}</button>
          </div>
        </>
      )}
      {c.replies.length > 0 && <div className="pdf-replies">{c.replies.map((r) => <div key={r.id}>{item(r, true)}</div>)}</div>}
    </div>
  );

  const where = new Map(placed.items.map((p) => [p.id, p]));
  const notice = !available ? ''
    : tab === 'edit' ? (view === 'native' ? t('Switch to Pages to edit pages.') : isCopy ? t('Use the bar under each page to rotate, move, insert or delete it ({n} pages).', { n: info.pages })
      : t('Page edits cannot be undone, so the file is not changed: they go to a copy ending in -edited.pdf beside it.'))
      : view === 'native' ? t('Switch to Pages to comment on the text.')
        : copied ? t('Files in the inbox are not changed: changes go to a copy ending in -edited.pdf beside it.') : '';
  const showRail = Boolean(available) && tab === 'comment' && !railOff;

  return (
    <div className="pdf-doc" onDragEnter={(e) => { if (isNoteDrag(e)) { setDraggingNote(true); setView('pages'); setTab('edit'); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDraggingNote(false); }}
      onDragEnd={() => setDraggingNote(false)} onDrop={(e) => { if (isNoteDrag(e)) setDraggingNote(false); }}>
      <div className="pdf-bar" role="toolbar" aria-label={t('PDF tools')}>
        <div className="pdf-bar-leading">
        <div className="view-toggle" role="group" aria-label={t('PDF view')}>
          <button type="button" className={view === 'pages' ? 'on' : ''} aria-pressed={view === 'pages'} onClick={() => setView('pages')} title={t('Pages')} aria-label={t('Pages')}><IconPages size={16} /></button>
          <button type="button" className={view === 'native' ? 'on' : ''} aria-pressed={view === 'native'} onClick={() => setView('native')} title={t('Native viewer')} aria-label={t('Native viewer')}><IconNativeViewer size={16} /></button>
        </div>
        {view === 'pages' && (
          <div className="pdf-zoom">
            <button type="button" className="icon-btn" aria-label={t('Zoom out')} title={t('Zoom out')} disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>−</button>
            <span className="small">{Math.round(zoom * 100)}%</span>
            <button type="button" className="icon-btn" aria-label={t('Zoom in')} title={t('Zoom in')} disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>+</button>
          </div>
        )}
        <span className="pdf-bar-sep" />
        <div className="view-toggle pdf-tabs" role="group" aria-label={t('PDF panel')}>
          <button type="button" className={tab === 'comment' ? 'on' : ''} aria-pressed={tab === 'comment'} onClick={() => setTab('comment')} title={t('Highlight and comment')} aria-label={t('Highlight and comment')}><IconHighlight size={16} /></button>
          <button type="button" className={tab === 'edit' ? 'on' : ''} aria-pressed={tab === 'edit'} onClick={() => setTab('edit')} title={t('Edit PDF')} aria-label={t('Edit PDF')}><IconEdit size={16} /></button>
        </div>
        </div>
        {available && tab === 'comment' && (
          <>
            {swatches}
            {view === 'pages' && (
              <div className="pdf-find" role="search">
                <span className={`pdf-find-field${hits ? ' counted' : ''}`}>
                  <input type="search" value={query} maxLength={500} placeholder={t('Search in the PDF')} aria-label={t('Search in the PDF')}
                    onChange={(e) => { setQuery(e.target.value); setHits(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void find(e.shiftKey ? -1 : 1); } }} />
                  {hits && <span className="muted small pdf-find-count">{hits.length ? t('{n} of {total}', { n: hit + 1, total: hits.length }) : t('Not found')}</span>}
                  <button type="button" className="pdf-find-go" onClick={() => { void find(1); }} title={t('Search (Enter)')} aria-label={t('Search')}><IconSearch size={14} /></button>
                </span>
                {hits && hits.length > 1 && <>
                  <button type="button" className="icon-btn" title={t('Previous (Shift+Enter)')} aria-label={t('Previous')} onClick={() => { void find(-1); }}>↑</button>
                  <button type="button" className="icon-btn" title={t('Next (Enter)')} aria-label={t('Next')} onClick={() => { void find(1); }}>↓</button>
                </>}
                {hits && hits.length > 0 && <button type="button" className="icon-btn" disabled={off} title={t('Highlight all')} aria-label={t('Highlight all')} onClick={() => { void highlightAll(); }}><IconHighlight size={16} /></button>}
              </div>
            )}
            {view === 'pages' && (
              <button type="button" className={`btn btn-ghost btn-sm pdf-rail-toggle${railOff ? '' : ' on'}`} aria-pressed={!railOff}
                title={railOff ? t('Show the comments beside the pages') : t('Hide the comments: the pages get the room')} aria-label={`${t('Comments')} (${comments.length})`} onClick={() => setRailOff(!railOff)}>
                <IconChat size={14} /><span className="pdf-rail-count">{comments.length}</span>
              </button>
            )}
          </>
        )}
        {available && tab === 'edit' && (
          <details className="pdf-drop" ref={properties} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); } }}>
            <summary className="btn btn-ghost btn-sm">{t('Document properties')}</summary>
            <fieldset disabled={off} className="pdf-form pdf-drop-body">
              <label>{t('Title')}<input type="text" maxLength={1000} value={props.title} onChange={(e) => setProps({ ...props, title: e.target.value })} /></label>
              <label>{t('Author')}<input type="text" maxLength={1000} value={props.author} onChange={(e) => setProps({ ...props, author: e.target.value })} /></label>
              <button type="button" className="btn btn-sm" disabled={off || (props.title === info.title && props.author === info.author)}
                onClick={() => { void apply({ op: 'set-info', ...props }).then((ok) => { if (ok && properties.current) properties.current.open = false; }); }}>{busy ? t('Saving…') : t('Save')}</button>
            </fieldset>
          </details>
        )}
      </div>
      {/* One thin line under the bar: what this mode needs to know. */}
      {(available === false || notice || error) && (
        <div className={`pdf-note${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || (available === false ? (mac
            // The macOS DMG and ArtCraft Launcher install only PdfCraft.app; the CLI is a separate zip.
            ? t('Highlighting and commenting need the PdfCraft command line, which the macOS app does not include: download pdfcraft-cli-<version>-macos-universal.zip from github.com/storytold/pdfcraft/releases and put pdfcraft-cli in /usr/local/bin or /opt/homebrew/bin.')
            : t('Install PdfCraft (from ArtCraft Launcher) to highlight and comment on PDFs.')) : notice)}
        </div>
      )}
      <div className="pdf-body">

      {view === 'pages' ? (
        <div className="pdf-scroll" ref={scroller}>
          <div className={`pdf-stage${showRail ? ' with-rail' : ''}`} ref={stage}>
            <PdfPages data={data} zoom={zoom} onSelection={tab === 'comment' && available ? onSelection : () => {}} onError={toNative} onLoad={onLoad} onDoc={onDoc}
              pageTools={tab === 'edit' ? pageTools : undefined} afterPage={afterPage} />
            {showRail && (
              <>
                <svg className="pdf-links" width="100%" height={placed.height} aria-hidden="true">
                  {placed.items.map((p) => {
                    const cy = placed.railTop + p.top + 18;
                    const mid = (p.ax + placed.rail) / 2;
                    return <path key={p.id} className={active === p.id ? 'on' : ''} stroke={p.color} d={`M${p.ax} ${p.ay} C${mid} ${p.ay}, ${mid} ${cy}, ${placed.rail} ${cy}`} />;
                  })}
                </svg>
                <div className="pdf-rail" ref={rail} style={{ height: Math.max(0, placed.height - 32) }} aria-label={t('Comments')}>
                  {comments.map((c) => (
                    <div key={c.id} data-card={c.id} className={`pdf-card${active === c.id ? ' on' : ''}`} style={{ top: where.get(c.id)?.top ?? 0, borderLeftColor: where.get(c.id)?.color }}
                      onMouseEnter={() => setActive(c.id)} onMouseLeave={() => setActive((a) => (a === c.id ? '' : a))}>
                      {item(c)}
                    </div>
                  ))}
                  {!comments.length && <p className="muted small pdf-rail-empty">{t('No comments yet.')}</p>}
                </div>
              </>
            )}
            {available && tab === 'comment' && railOff && placed.items.map((p) => {
              const c = comments.find((x) => x.id === p.id);
              return (
                <button key={p.id} type="button" className="pdf-marker" style={{ left: p.edge + 3, top: p.ay - 9, background: p.color }}
                  title={c?.contents || t('Highlight without a comment.')} aria-label={t('Open the comment: {text}', { text: c?.contents ?? '' })}
                  onClick={() => { setRailOff(false); setActive(p.id); }} />
              );
            })}
            {composer?.rects.map((box, i) => <span key={i} className="pdf-kept-selection" aria-hidden="true" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />)}
            {composer && available && tab === 'comment' && (
              <div className="pdf-composer" style={{ left: composer.x, top: composer.y }} role="dialog" aria-label={t('Highlight and comment')}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setComposer(null); dropSelection(); } }}>
                <div className="pdf-composer-head">
                  {swatches}
                  <button type="button" className="icon-btn" onClick={() => { setComposer(null); dropSelection(); }} aria-label={t('Close')} title={t('Close')}><IconX size={14} /></button>
                </div>
                <textarea autoFocus rows={3} maxLength={4000} value={composer.text} placeholder={t('Comment (optional)')}
                  onChange={(e) => setComposer({ ...composer, text: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); highlightSelection(); } }} />
                <div className="pdf-actions">
                  <button type="button" className="btn btn-sm" disabled={off} onClick={highlightSelection}>{busy ? t('Saving…') : composer.text.trim() ? t('Add the comment') : t('Highlight')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!composer.quote.trim()} onClick={noteFromSelection}>{t('Create a note from here')}</button>
                  <span className="muted small">{t('Ctrl+Enter')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : <div className="pdf-native">{native}</div>}
      </div>
    </div>
  );
}
