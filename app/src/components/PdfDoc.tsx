import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type PdfChange, type PdfComment, type PdfMark } from '../api';
import { t } from '../i18n';
import { IconPlus, IconTrash } from './Icons';
import { PdfPages } from './PdfPages';

const COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'red', 'purple'];
const colorName = (c: string) => ({ yellow: t('Yellow'), green: t('Green'), blue: t('Blue'), pink: t('Pink'), orange: t('Orange'), red: t('Red'), purple: t('Purple') })[c] ?? c;

// The panel mode stays when a change opens the -edited copy in a new tab.
let lastTab: 'comment' | 'edit' = 'comment';

interface Props {
  project: string;
  path: string;
  data: string; // base64
  native: ReactNode; // Chromium's own viewer (search, print)
  onSaved: (path: string) => void; // the file the change was saved to
}

// A PDF with its comments and page edits: pages drawn by pdf.js (select text, then "Highlight") or
// Chromium's viewer, and a panel with two modes: highlight and comment (by text; reply, edit, delete),
// and edit (a bar under each page: rotate, move, insert a blank page, delete; title and author).
// PdfCraft writes every change.
export function PdfDoc({ project, path, data, native, onSaved }: Props) {
  const [view, setView] = useState<'pages' | 'native'>('pages');
  const [zoom, setZoom] = useState(1);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [mac, setMac] = useState(false);
  const [comments, setComments] = useState<PdfComment[]>([]);
  const [marks, setMarks] = useState<PdfMark[] | null>(null);
  const [form, setForm] = useState({ page: 1, find: '', all: false, contents: '', color: 'yellow' });
  const [editing, setEditing] = useState<{ id: string; mode: 'reply' | 'edit'; text: string } | null>(null);
  const [tab, setTabState] = useState(lastTab);
  const setTab = (next: 'comment' | 'edit') => { lastTab = next; setTabState(next); };
  const [info, setInfo] = useState({ pages: 0, title: '', author: '' });
  const [props, setProps] = useState({ title: '', author: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toNative = useCallback(() => setView('native'), []);
  const onLoad = useCallback((i: { pages: number; title: string; author: string }) => { setInfo(i); setProps({ title: i.title, author: i.author }); }, []);
  // The service saves to a "-edited" copy: always for files from the inbox, and for page edits of any file.
  const isCopy = /-edited(-\d+)?\.pdf$/i.test(path);
  const copied = path.startsWith('inbox/') && !isCopy;

  useEffect(() => { api.pdfcraftStatus().then((s) => { setAvailable(s.available); setMac(s.platform === 'darwin'); }).catch(() => setAvailable(false)); }, []);
  useEffect(() => {
    if (!available) return;
    api.pdfComments(project, path).then(setComments).catch((e: Error) => setError(e.message));
  }, [available, project, path, data]);

  const apply = (change: PdfChange): Promise<boolean> => {
    setBusy(true);
    setError('');
    return api.pdfChange(project, path, change)
      .then((r) => { setComments(r.comments); onSaved(r.path); return true; })
      .catch((e: Error) => { setError(e.message); return false; })
      .finally(() => setBusy(false));
  };

  const highlight = () => {
    const base = { contents: form.contents.trim() || undefined, color: form.color };
    void apply(marks ? { op: 'highlight', marks, ...base } : { op: 'highlight', page: form.page, find: form.find, all: form.all, ...base }).then((ok) => {
      if (!ok) return;
      setForm((f) => ({ ...f, find: '', contents: '' }));
      setMarks(null);
      window.getSelection()?.removeAllRanges();
    });
  };

  const finishEdit = () => {
    if (!editing) return;
    const change: PdfChange = editing.mode === 'reply' ? { op: 'reply', id: editing.id, text: editing.text } : { op: 'edit', id: editing.id, contents: editing.text };
    void apply(change).then((ok) => { if (ok) setEditing(null); });
  };

  const remove = (c: PdfComment) => {
    if (window.confirm(t('Delete this comment?'))) void apply({ op: 'delete', id: c.id });
  };

  const off = !available || busy;
  const edit = (change: PdfChange) => { if (!off) void apply(change); };

  // Edit mode: a bar under each page drawn by pdf.js.
  const pageTools = (n: number, total: number) => (
    <div className="pdf-page-tools" role="group" aria-label={t('page {n}', { n })}>
      <span className="muted small">{n} / {total}</span>
      <button type="button" className="icon-btn" disabled={off} title={t('Rotate left')} aria-label={t('Rotate left')} onClick={() => edit({ op: 'rotate-pages', pages: [n], degrees: 270 })}>↺</button>
      <button type="button" className="icon-btn" disabled={off} title={t('Rotate right')} aria-label={t('Rotate right')} onClick={() => edit({ op: 'rotate-pages', pages: [n], degrees: 90 })}>↻</button>
      <button type="button" className="icon-btn" disabled={off || n === 1} title={t('Move up')} aria-label={t('Move up')} onClick={() => edit({ op: 'move-page', page: n, to: n - 1 })}>↑</button>
      <button type="button" className="icon-btn" disabled={off || n === total} title={t('Move down')} aria-label={t('Move down')} onClick={() => edit({ op: 'move-page', page: n, to: n + 1 })}>↓</button>
      <button type="button" className="icon-btn" disabled={off} title={t('Insert blank page after')} aria-label={t('Insert blank page after')} onClick={() => edit({ op: 'insert-blank', at: n + 1 })}><IconPlus size={15} /></button>
      <button type="button" className="icon-btn" disabled={off || total === 1} title={t('Delete page')} aria-label={t('Delete page')}
        onClick={() => { if (window.confirm(t('Delete page {n}?', { n }))) edit({ op: 'delete-pages', pages: [n] }); }}><IconTrash size={15} /></button>
    </div>
  );
  const canHighlight = !off && (marks ? true : form.find.trim().length > 0 && form.page >= 1);

  const item = (c: PdfComment, reply = false) => (
    <li key={c.id} className={reply ? 'pdf-reply' : 'pdf-comment'}>
      <div className="pdf-comment-head">
        {!reply && <span className="pdf-swatch" style={{ background: c.color ?? 'transparent' }} />}
        <strong>{c.author || t('Unknown author')}</strong>
        {!reply && <span className="muted small">{t('page {n}', { n: c.page })}{c.type ? ` · ${c.type}` : ''}</span>}
      </div>
      {editing?.id === c.id ? (
        <div className="pdf-edit">
          <textarea value={editing.text} autoFocus rows={3} onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          <div className="pdf-actions">
            <button type="button" className="btn btn-sm" disabled={off || (editing.mode === 'reply' && !editing.text.trim())} onClick={finishEdit}>{t('Save')}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>{t('Cancel')}</button>
          </div>
        </div>
      ) : (
        <>
          {c.contents && <p className="pdf-comment-text">{c.contents}</p>}
          <div className="pdf-actions">
            {!reply && <button type="button" className="link-btn" disabled={off} onClick={() => setEditing({ id: c.id, mode: 'reply', text: '' })}>{t('Reply')}</button>}
            <button type="button" className="link-btn" disabled={off} onClick={() => setEditing({ id: c.id, mode: 'edit', text: c.contents ?? '' })}>{t('Edit')}</button>
            <button type="button" className="link-btn" disabled={off} onClick={() => remove(c)}>{t('Delete')}</button>
          </div>
        </>
      )}
      {c.replies.length > 0 && <ul className="pdf-replies">{c.replies.map((r) => item(r, true))}</ul>}
    </li>
  );

  return (
    <div className="pdf-doc">
      <div className="pdf-main">
        <div className="pdf-toolbar">
          <div className="view-toggle" role="group" aria-label={t('PDF view')}>
            <button type="button" className={view === 'pages' ? 'on' : ''} aria-pressed={view === 'pages'} onClick={() => setView('pages')}>{t('Pages')}</button>
            <button type="button" className={view === 'native' ? 'on' : ''} aria-pressed={view === 'native'} onClick={() => setView('native')}>{t('Native viewer')}</button>
          </div>
          {view === 'pages' && (
            <div className="pdf-zoom">
              <button type="button" className="icon-btn" aria-label={t('Zoom out')} title={t('Zoom out')} disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>−</button>
              <span className="small">{Math.round(zoom * 100)}%</span>
              <button type="button" className="icon-btn" aria-label={t('Zoom in')} title={t('Zoom in')} disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>+</button>
            </div>
          )}
        </div>
        {view === 'pages'
          ? <PdfPages data={data} zoom={zoom} onSelection={setMarks} onError={toNative} onLoad={onLoad} pageTools={tab === 'edit' && available ? pageTools : undefined} />
          : native}
      </div>

      <aside className="pdf-panel" aria-label={t('Comments')}>
        <div className="view-toggle pdf-tabs" role="group" aria-label={t('PDF panel')}>
          <button type="button" className={tab === 'comment' ? 'on' : ''} aria-pressed={tab === 'comment'} onClick={() => setTab('comment')}>{t('Highlight and comment')}</button>
          <button type="button" className={tab === 'edit' ? 'on' : ''} aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>{t('Edit PDF')}</button>
        </div>
        {available === false && <p className="notice-bar">{mac
          // The macOS DMG and ArtCraft Launcher install only PdfCraft.app; the CLI is a separate zip.
          ? t('Highlighting and commenting need the PdfCraft command line, which the macOS app does not include: download pdfcraft-cli-<version>-macos-universal.zip from github.com/storytold/pdfcraft/releases and put pdfcraft-cli in /usr/local/bin or /opt/homebrew/bin.')
          : t('Install PdfCraft (from ArtCraft Launcher) to highlight and comment on PDFs.')}</p>}
        {available && tab === 'comment' && copied && <p className="muted small">{t('Files in the inbox are not changed: changes go to a copy ending in -edited.pdf beside it.')}</p>}
        {available && tab === 'edit' && !isCopy && <p className="muted small">{t('Page edits cannot be undone, so the file is not changed: they go to a copy ending in -edited.pdf beside it.')}</p>}
        {tab === 'edit' && (<>
          {view === 'native' ? <p className="muted small">{t('Switch to Pages to edit pages.')}</p>
            : available && <p className="muted small">{t('Use the bar under each page to rotate, move, insert or delete it ({n} pages).', { n: info.pages })}</p>}
          <h3>{t('Document properties')}</h3>
          <fieldset disabled={off} className="pdf-form">
            <label>{t('Title')}<input type="text" maxLength={1000} value={props.title} onChange={(e) => setProps({ ...props, title: e.target.value })} /></label>
            <label>{t('Author')}<input type="text" maxLength={1000} value={props.author} onChange={(e) => setProps({ ...props, author: e.target.value })} /></label>
            <button type="button" className="btn" disabled={off || (props.title === info.title && props.author === info.author)}
              onClick={() => edit({ op: 'set-info', ...props })}>{busy ? t('Saving…') : t('Save')}</button>
          </fieldset>
        </>)}
        {tab === 'comment' && <fieldset disabled={off} className="pdf-form">
          {marks ? (
            <p className="small">{t('Selected text on {n} page(s) will be highlighted.', { n: marks.length })}</p>
          ) : (
            <>
              {view === 'pages' && available && <p className="muted small">{t('Select text on the pages, or type it below.')}</p>}
              <label>{t('Page')}<input type="number" min={1} value={form.page} onChange={(e) => setForm({ ...form, page: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></label>
              <label>{t('Text to highlight')}<input type="text" maxLength={500} value={form.find} onChange={(e) => setForm({ ...form, find: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={form.all} onChange={(e) => setForm({ ...form, all: e.target.checked })} /> {t('Every match on the page')}</label>
            </>
          )}
          <label>{t('Comment')}<textarea rows={3} maxLength={4000} value={form.contents} onChange={(e) => setForm({ ...form, contents: e.target.value })} /></label>
          <label>{t('Color')}
            <select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
              {COLORS.map((c) => <option key={c} value={c}>{colorName(c)}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={!canHighlight} onClick={highlight}>{busy ? t('Saving…') : t('Highlight')}</button>
        </fieldset>}
        {error && <p className="error small" role="alert">{error}</p>}
        {available && tab === 'comment' && (
          <>
            <h3>{t('Comments')} ({comments.length})</h3>
            {comments.length ? <ul className="pdf-comments">{comments.map((c) => item(c))}</ul> : <p className="muted small">{t('No comments yet.')}</p>}
          </>
        )}
      </aside>
    </div>
  );
}
