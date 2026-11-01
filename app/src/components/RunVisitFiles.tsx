// What one step of an operation run left, shown in the run screen itself: its summary
// (handoff/<slot>.md), whose first lines say how it ended and why (e.g. what is pending),
// and the files it delivered (outputs/<slot>/), each previewed in place — Markdown, Word,
// text and JSON as text, Excel as its first rows. Other kinds open in Moki's viewer.

import { useEffect, useState } from 'react';
import { api, type FileContent } from '../api';
import { t } from '../i18n';
import { IconFile, IconFolder } from './Icons';

interface Props {
  project: string;
  folder: string; // runs/<id>
  slot: string;
  handoff: boolean;
  tick: number; // reloads with the run
  open?: boolean; // the summary starts expanded
  onOpenFile: (path: string) => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const PREVIEWED = new Set(['markdown', 'docx', 'text', 'json', 'html', 'xlsx']);
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// One file's content as the preview shows it.
function Preview({ file }: { file: FileContent }) {
  if (file.kind === 'markdown' || file.kind === 'docx') return <article className="markdown run-preview-doc" dangerouslySetInnerHTML={{ __html: file.html }} />;
  if (file.kind === 'text' || file.kind === 'json' || file.kind === 'html') return <pre className="run-preview-text">{file.text}</pre>;
  if (file.kind === 'xlsx') {
    const sheet = file.sheets.find((s) => !s.hidden) ?? file.sheets[0];
    if (!sheet) return <p className="muted small">{t('Empty spreadsheet.')}</p>;
    return (
      <div className="run-preview-sheet">
        <p className="muted small">{sheet.name}{file.sheets.length > 1 ? ` · ${t('{n} sheets', { n: file.sheets.length })}` : ''}</p>
        <table>
          <tbody>
            {sheet.rows.slice(0, 30).map((row, i) => (
              <tr key={i}>{row.map((c, j) => <td key={j}>{typeof c === 'string' ? c : c.n}</td>)}</tr>
            ))}
          </tbody>
        </table>
        {sheet.rows.length > 30 && <p className="muted small">{t('First 30 rows.')}</p>}
      </div>
    );
  }
  return null;
}

export function RunVisitFiles({ project, folder, slot, handoff, tick, open = false, onOpenFile }: Props) {
  const [summary, setSummary] = useState<FileContent | null>(null);
  const [full, setFull] = useState(open);
  const [files, setFiles] = useState<{ path: string; name: string; size: number }[] | null>(null);
  const [shown, setShown] = useState('');
  const [preview, setPreview] = useState<FileContent | null>(null);
  const [error, setError] = useState('');
  const run = folder.split('/')[1] ?? '';

  useEffect(() => {
    if (handoff) api.readFile(project, `${folder}/handoff/${slot}.md`).then(setSummary).catch(() => setSummary(null));
    api.operationOutputs(project, run, slot).then(setFiles).catch(() => setFiles([]));
  }, [project, folder, run, slot, handoff, tick]);

  const toggle = (path: string) => {
    if (shown === path) { setShown(''); setPreview(null); return; }
    setShown(path); setPreview(null); setError('');
    api.readFile(project, path).then(setPreview).catch((e) => setError(message(e)));
  };

  return (
    <div className="run-files">
      {summary && summary.kind === 'markdown' && (
        <section className={`run-summary${full ? ' full' : ''}`} aria-label={t('Its summary')}>
          <div className="run-files-head"><span className="label">{t('Its summary')}</span></div>
          <article className="markdown" dangerouslySetInnerHTML={{ __html: summary.html }} />
          <button type="button" className="link small" onClick={() => setFull((v) => !v)}>{full ? t('Show less') : t('Read it all')}</button>
        </section>
      )}
      {files && files.length > 0 && (
        <section className="run-deliveries" aria-label={t('What it delivered')}>
          <div className="run-files-head">
            <span className="label">{t('What it delivered')}</span>
            <button type="button" className="link small" onClick={() => { void api.openFolder(project, `${folder}/outputs/${slot}`).catch((e) => setError(message(e))); }}><IconFolder size={13} /> {t('Show in folder')}</button>
          </div>
          <ul className="run-file-list">
            {files.map((f) => (
              <li key={f.path}>
                <button type="button" className={`run-file${shown === f.path ? ' on' : ''}`} aria-expanded={shown === f.path} onClick={() => toggle(f.path)}>
                  <IconFile size={14} /><span className="run-file-name">{f.name}</span><span className="muted small">{size(f.size)}</span>
                </button>
                {shown === f.path && (
                  <div className="run-preview">
                    {error && <p className="error small">{error}</p>}
                    {!preview && !error && <p className="muted small">…</p>}
                    {preview && (PREVIEWED.has(preview.kind) ? <Preview file={preview} /> : (
                      <p className="muted small">{t('No preview for this kind of file here.')} <button type="button" className="link small" onClick={() => onOpenFile(f.path)}>{t('Open it in Moki')}</button></p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {files && !files.length && !summary && <p className="muted small">{t('It delivered no files.')}</p>}
    </div>
  );
}
