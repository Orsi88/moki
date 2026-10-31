import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { api, type FileContent, type OpenWithApps } from '../api';
import { t } from '../i18n';
import { IconEdit, IconExternal, IconEye, IconMore } from './Icons';
import { FileIcon } from '../icons';
import { PdfDoc } from './PdfDoc';

interface Props {
  content: FileContent;
  project?: string; // lets the preview of unsaved edits show the file's relative images
  mode: 'preview' | 'edit';
  draft: string;
  dirty: boolean;
  saving: boolean;
  onDraft: (text: string) => void;
  onMode: (mode: 'preview' | 'edit') => void;
  onSave: () => void;
  onOpenExternal: () => void;
  onLink: (href: string) => void;
  onPdfSaved?: (path: string) => void; // a PDF change was saved, to this file (the same one, or its -edited copy)
  // "Open with": the programs the system offers, and the one kept in Moki for this type (null = the system's default).
  openWith?: { kept: { id: string; name: string } | null; apps: () => Promise<OpenWithApps | null>; open: (app: OpenWithApps['apps'][number] | null, keep: boolean) => void; reset: () => void };
}

// Excel, Word and PDF files get "Open with" (OPEN_WITH_TYPES in desktop/fs-guard.ts).
const OPEN_WITH = /\.(xlsx|xls|docx|doc|pdf)$/i;

const colName = (i: number): string => (i >= 26 ? colName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

type Sheet = Extract<FileContent, { kind: 'xlsx' }>['sheets'][number];

// Read-only grid of a spreadsheet, sheets as tabs at the bottom like Excel/LibreOffice.
function SheetView({ sheets }: { sheets: Sheet[] }) {
  const [current, setCurrent] = useState(Math.max(0, sheets.findIndex((s) => !s.hidden)));
  const sheet = sheets[current];
  const rows = sheet?.rows ?? [];
  // A merged area is drawn as its first cell spanning the area; the cells it covers are not drawn.
  const spans = new Map<string, { rowSpan: number; colSpan: number }>();
  const covered = new Set<string>();
  for (const [r1, c1, r2, c2] of sheet?.merges ?? []) {
    spans.set(`${r1}:${c1}`, { rowSpan: r2 - r1 + 1, colSpan: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(`${r}:${c}`);
  }
  const used = Math.max(rows.reduce((n, r) => Math.max(n, r.length), 0), ...(sheet?.merges ?? []).map((m) => m[3] + 1));
  // Hidden rows and columns are shown dimmed, so their content can be checked without mistaking it for what users see.
  const hiddenRows = new Set(sheet?.hiddenRows);
  const hiddenCols = new Set(sheet?.hiddenCols);
  const widths = Array.from({ length: used }, (_, c) => sheet?.widths[c] ?? 64);
  // Like a spreadsheet, empty columns go on to the right (text can spill into them).
  while (used && widths.reduce((a, b) => a + b, 0) < 1200) widths.push(64);
  const cols = widths.length;
  const notes = [
    sheet?.truncated && t('only the first {n} rows and 200 columns are shown', { n: rows.length }),
    sheet?.hidden && t('this sheet is hidden in the spreadsheet program'),
    sheet?.drawing && t('it has images or charts, not shown here'),
  ].filter(Boolean);
  return (
    <div className="sheet">
      <p className="notice-bar">{t('Spreadsheet — values preview')}{notes.length ? `; ${notes.join('; ')}` : ''}. {t('Open it in your spreadsheet program to edit or see formatting.')}</p>
      <div className="sheet-grid">
        {cols === 0 ? <p className="muted sheet-empty">{t('This sheet is empty.')}</p> : (
          <table style={{ width: 44 + widths.reduce((a, b) => a + b, 0) }}>
            <colgroup><col style={{ width: 44 }} />{widths.map((w, c) => <col key={c} style={{ width: w }} />)}</colgroup>
            <thead><tr><th />{Array.from({ length: cols }, (_, c) => (
              <th key={c} className={hiddenCols.has(c) ? 'hidden-rc' : undefined} title={hiddenCols.has(c) ? t('Hidden column') : undefined}>{colName(c)}</th>
            ))}</tr></thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n}>
                  <th className={hiddenRows.has(n) ? 'hidden-rc' : undefined} title={hiddenRows.has(n) ? t('Hidden row') : undefined}>{n + 1}</th>
                  {Array.from({ length: cols }, (_, c) => {
                    if (covered.has(`${n}:${c}`)) return null;
                    const v = r[c] ?? '';
                    const a = sheet?.align[`${n}:${c}`];
                    const span = spans.get(`${n}:${c}`);
                    // Like Excel, left-aligned text spills over the empty cells on its right instead of being cut.
                    // ponytail: text width estimated at 7px per character; measure with canvas if it misjudges.
                    let spill = 1;
                    if (typeof v === 'string' && v && !span && !a?.wrap && (a?.h ?? 'left') === 'left' && !v.includes('\n')) {
                      for (let w = widths[c]; w < v.length * 7 + 8 && c + spill < cols && !r[c + spill]
                        && !covered.has(`${n}:${c + spill}`) && !spans.has(`${n}:${c + spill}`); spill++) w += widths[c + spill];
                      for (let k = 1; k < spill; k++) covered.add(`${n}:${c + k}`);
                    }
                    const props = {
                      ...span, ...(spill > 1 ? { colSpan: spill } : {}),
                      className: [typeof v === 'object' && 'num', (hiddenRows.has(n) || hiddenCols.has(c)) && 'hidden-rc'].filter(Boolean).join(' ') || undefined,
                      style: a && { textAlign: a.h as CSSProperties['textAlign'], verticalAlign: a.v, whiteSpace: a.wrap ? 'pre-wrap' as const : undefined },
                    };
                    return typeof v === 'object' ? <td key={c} {...props}>{v.n}</td> : <td key={c} title={v || undefined} {...props}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="sheet-tabs" role="tablist">
        {sheets.map((s, i) => (
          <button type="button" key={s.name} role="tab" aria-selected={i === current} className={`${i === current ? 'active' : ''}${s.hidden ? ' hidden-sheet' : ''}`}
            title={s.hidden ? t('Hidden sheet') : undefined} onClick={() => setCurrent(i)}>{s.name}</button>
        ))}
      </div>
    </div>
  );
}

// Chromium's own PDF viewer (pages, zoom, search, print), in a frame with no access to the app.
function PdfView({ data, title }: { data: string; title: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: 'application/pdf' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data]);
  return url ? <iframe className="pdf-view" src={url} title={title} /> : null;
}

// The page rendered by Chromium in a sandboxed frame: no scripts, forms or navigation, its own origin.
function HtmlView({ text, title }: { text: string; title: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [text]);
  return url ? <iframe className="pdf-view" sandbox="" src={url} title={title} /> : null;
}

const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function DocView({ content, project, mode, draft, dirty, saving, onDraft, onMode, onSave, onOpenExternal, onLink, onPdfSaved, openWith }: Props) {
  const editable = (content.kind === 'markdown' || content.kind === 'text') && content.editable;
  const crumbs = content.path.split('/');
  const savedHtml = content.kind === 'markdown' ? content.html : '';
  const [html, setHtml] = useState(savedHtml);
  const [menu, setMenu] = useState<(OpenWithApps & { right: number; top: number }) | null>(null);
  const [keep, setKeep] = useState(false);
  const kept = openWith?.kept ?? null;
  const ext = content.path.slice(content.path.lastIndexOf('.')).toLowerCase();
  const openTitle = kept ? t('Open with {tool}', { tool: kept.name }) : t('Open with the default program');

  const showOpenWith = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    void openWith?.apps().then((list) => { if (list) { setKeep(false); setMenu({ ...list, right: window.innerWidth - r.right, top: r.bottom + 4 }); } });
  };
  const choose = (app: OpenWithApps['apps'][number] | null) => { setMenu(null); openWith?.open(app, keep); };

  // The formatted view follows the text on screen, including edits not saved yet.
  useEffect(() => {
    if (content.kind !== 'markdown' || mode !== 'preview') return;
    if (draft === content.text) { setHtml(content.html); return; }
    let cancel = false;
    api.renderMarkdown(draft, project, content.path).then((next) => { if (!cancel) setHtml(next); }).catch(() => { if (!cancel) setHtml(content.html); });
    return () => { cancel = true; };
  }, [content, draft, mode, project]);

  // Links inside rendered Markdown never navigate the window.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href') ?? '';
    if (href) onLink(href);
  };

  return (
    <div className="doc">
      <div className="doc-bar">
        <div className="crumbs">
          {crumbs.map((c, i) => <span key={`${c}-${i}`} className={i === crumbs.length - 1 ? 'crumb-last' : ''}>{c}</span>)}
        </div>
        <div className="doc-actions">
          {content.kind === 'markdown' && (
            <div className="view-toggle" role="group" aria-label={t('Markdown view')}>
              <button type="button" className={mode === 'preview' ? 'on' : ''} aria-pressed={mode === 'preview'} onClick={() => onMode('preview')} title={t('Reading view (Ctrl+E)')} aria-label={t('Reading view (Ctrl+E)')}><IconEye size={16} /></button>
              <button type="button" className={mode === 'edit' ? 'on' : ''} aria-pressed={mode === 'edit'} onClick={() => onMode('edit')} title={t('Edit (Ctrl+E)')} aria-label={t('Edit (Ctrl+E)')}><IconEdit size={15} /></button>
            </div>
          )}
          {editable && (dirty || saving) && (
            <button type="button" className="btn btn-sm" onClick={onSave} disabled={saving}>{saving ? t('Saving…') : t('Save')}</button>
          )}
          <button type="button" className="icon-btn" onClick={onOpenExternal} title={openTitle}><IconExternal size={17} /></button>
          {openWith && OPEN_WITH.test(content.path) && (
            <button type="button" className="icon-btn" onClick={showOpenWith} title={t('Open with…')} aria-label={t('Open with…')} aria-haspopup="menu"><IconMore size={17} /></button>
          )}
        </div>
      </div>

      <div className="doc-body">
        {content.kind === 'markdown' && mode === 'preview' && (
          // HTML comes from the main process renderer, which escapes all markup from the file.
          <div className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {(content.kind === 'markdown' || content.kind === 'text') && (mode === 'edit' || content.kind === 'text') && (
          content.editable
            ? <textarea className="editor" spellCheck value={draft} onChange={(e) => onDraft(e.target.value)} />
            : <pre className="plain">{content.text}</pre>
        )}
        {content.kind === 'json' && <pre className="plain code-view">{content.text}</pre>}
        {content.kind === 'docx' && (
          <>
            <p className="notice-bar">{t('Word document — text preview. Open it in your word processor to see images and formatting.')}</p>
            <div className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: content.html }} />
          </>
        )}
        {content.kind === 'xlsx' && <SheetView key={content.path} sheets={content.sheets} />}
        {content.kind === 'pdf' && (project && onPdfSaved
          ? <PdfDoc key={content.path} project={project} path={content.path} data={content.data} native={<PdfView data={content.data} title={content.path} />} onSaved={onPdfSaved} />
          : <PdfView data={content.data} title={content.path} />)}
        {content.kind === 'html' && <HtmlView text={content.text} title={content.path} />}
        {content.kind === 'image' && <div className="image-view"><img src={content.dataUrl} alt={content.path} /></div>}
        {content.kind === 'binary' && (
          <div className="binary-view">
            <FileIcon name={content.path} size={40} />
            <strong>{crumbs[crumbs.length - 1]}</strong>
            <span className="muted small">{formatSize(content.size)}{content.reason ? ` · ${content.reason}` : ''}</span>
            {content.openable
              ? <button type="button" className="btn" onClick={onOpenExternal}><IconExternal size={16} /> {openTitle}</button>
              : <span className="muted small">{t('This type of file is not opened from Moki.')}</span>}
          </div>
        )}
      </div>

      {menu && (
        <div className="menu-backdrop" onMouseDown={() => setMenu(null)}>
          <ul className="term-menu" role="menu" style={{ right: menu.right, top: menu.top }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setMenu(null); }}>
            {menu.apps.map((app, i) => (
              <li key={app.id}>
                <button type="button" role="menuitem" autoFocus={i === 0} onClick={() => choose(app)}>
                  {app.name}
                  {kept?.id === app.id ? <span className="muted small">{t('default in Moki')}</span> : app.isDefault && <span className="muted small">{t('system default')}</span>}
                </button>
              </li>
            ))}
            {menu.dialog && <li><button type="button" role="menuitem" autoFocus onClick={() => choose(null)}>{t('Choose another program…')}</button></li>}
            {!menu.dialog && !menu.apps.length && <li className="menu-note muted">{t('No programs for this file were found on this computer.')}</li>}
            {kept && <li><button type="button" role="menuitem" onClick={() => { setMenu(null); openWith?.reset(); }}>{t('Back to the system default')}</button></li>}
            {menu.apps.length > 0 && (
              <li className="menu-note"><label><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {t('Always open {ext} files with the chosen program', { ext })}</label></li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
