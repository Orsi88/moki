// Settings › Templates: the look of the PDF, Word and Excel files the activities and
// agents generate (scripts/lib/doc-style.mjs applies it): font, colours, page colour,
// header and footer (with a logo and page numbers) and a watermark. One style for all
// projects; a project can have its own. A live page preview shows the result.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, DOCUMENT_FONTS, type DocumentStyle, type ProjectSummary } from '../api';
import { t } from '../i18n';

// picker: chooses the project whose own style is edited (Settings); startOnProject: open on it, not on "all projects".
interface Props { project: ProjectSummary | null; picker?: ReactNode; startOnProject?: boolean }

const DEFAULT: DocumentStyle = {
  font: { family: 'Calibri', size: 10.5, color: '#1A1A1A' },
  accent: '#1F4E78',
  table: { header: '#1F4E78', headerText: '#FFFFFF', border: '#BFBFBF' },
  background: '#FFFFFF',
  header: { left: '', center: '', right: '', logo: '', logoSide: 'left' },
  footer: { left: '', center: '', right: '' },
  watermark: { text: '', color: '#808080', opacity: 0.12 },
};
const LOGO_HEIGHT = 160; // px kept from the uploaded logo (shown 1 cm high)
const VARS = ['{project}', '{title}', '{date}', '{page}', '{pages}'];

// A logo is kept in the style itself, scaled down first.
// The file is read as a data URL: the window's policy allows data: images and blocks blob: ones,
// so createObjectURL never loads here.
function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t('This image could not be read.')));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, LOGO_HEIGHT / Math.max(img.height, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error(t('This image could not be read.'))); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error(t('This image could not be read.')));
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

export function DocumentStyleForm({ project, picker, startOnProject = true }: Props) {
  const [scope, setScope] = useState<'global' | 'project'>(project && startOnProject ? 'project' : 'global');
  const [global, setGlobal] = useState<DocumentStyle>(DEFAULT);
  const [own, setOwn] = useState<DocumentStyle | null>(null); // the project's own style, if any
  const [style, setStyle] = useState<DocumentStyle>(DEFAULT); // what is being edited
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const onProject = scope === 'project' && project != null;
  const inherits = onProject && own == null; // the project follows the style for all projects

  const load = () => {
    api.documentStyle(project?.id ?? null).then((r) => {
      setGlobal(r.global); setOwn(r.project);
      const current = scope === 'project' && project ? (r.project ?? r.global) : r.global;
      setStyle(current); setSaved(JSON.stringify(current));
    }).catch((e: Error) => setError(e.message));
  };
  useEffect(load, [project?.id, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(style) !== saved;
  const logoRef = useRef<HTMLInputElement>(null);
  // A project that still follows the shared style gets its own copy on the first edit,
  // so the logo and watermark can be changed without a separate switch.
  const claimOwn = () => { if (onProject && own == null) setOwn(style); };
  const set = <K extends keyof DocumentStyle>(key: K, value: DocumentStyle[K]) => { claimOwn(); setStyle((s) => ({ ...s, [key]: value })); setInfo(''); };
  const patch = <K extends 'font' | 'table' | 'header' | 'footer' | 'watermark'>(key: K, value: Partial<DocumentStyle[K]>) => set(key, { ...style[key], ...value });

  const save = async () => {
    setBusy(true); setError(''); setInfo('');
    try {
      await api.saveDocumentStyle(onProject && project ? project.id : null, style);
      if (onProject) setOwn(style); else setGlobal(style);
      setSaved(JSON.stringify(style));
      setInfo(onProject && project ? t('Saved for {project}. New files of this project use it.', { project: project.name }) : t('Saved. New files of every project use it (unless a project has its own).'));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const toggleOwn = (on: boolean) => {
    setError(''); setInfo('');
    if (on) { setOwn(global); setStyle(global); setSaved(''); return; } // starts as a copy of the general style
    if (!project || !window.confirm(t('Use the style for all projects in {project} again? Its own style is removed.', { project: project.name }))) return;
    api.saveDocumentStyle(project.id, null).then(() => { setOwn(null); setStyle(global); setSaved(JSON.stringify(global)); }).catch((e: Error) => setError(e.message));
  };
  const reset = () => { claimOwn(); setStyle(DEFAULT); setInfo(''); };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try { patch('header', { logo: await readLogo(file) }); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const colour = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="ds-colour">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <span>{label}</span>
    </label>
  );
  const zones = (key: 'header' | 'footer') => (
    <div className="ds-zones">
      {(['left', 'center', 'right'] as const).map((side) => (
        <label key={side} className="field">
          <span className="label">{side === 'left' ? t('Left') : side === 'center' ? t('Center') : t('Right')}</span>
          <input value={style[key][side]} maxLength={120} onChange={(e) => patch(key, { [side]: e.target.value } as Partial<DocumentStyle[typeof key]>)}
            placeholder={key === 'footer' && side === 'right' ? t('e.g. Page {page} of {pages}') : key === 'header' && side === 'left' ? '{project}' : ''} />
        </label>
      ))}
    </div>
  );
  const card = (title: string, children: ReactNode, hint?: string) => (
    <section className="ds-card">
      <h3>{title}</h3>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  );

  return (
    <div className="ds">
      <div className="ds-form">
        <h1>{t('Templates')}</h1>
        <p className="muted">{t('How the PDF, Word and Excel files that your activities and agents generate look. Every AI tool gets the same result.')}</p>

        {project && (
          <div className="dialog-tabs ds-scope" role="tablist">
            <button type="button" role="tab" aria-selected={scope === 'global'} className={`dialog-tab${scope === 'global' ? ' on' : ''}`} onClick={() => setScope('global')}>{t('All projects')}</button>
            <button type="button" role="tab" aria-selected={scope === 'project'} className={`dialog-tab${scope === 'project' ? ' on' : ''}`} onClick={() => setScope('project')}>{t('One project')}</button>
          </div>
        )}
        {onProject && picker}
        {onProject && (
          <label className="field inline ds-own">
            <input type="checkbox" checked={!inherits} onChange={(e) => toggleOwn(e.target.checked)} />
            <span>{t('This project has its own style')} <span className="muted small">{inherits ? t('(now it uses the style for all projects)') : t('(e.g. the client\'s logo and colours)')}</span></span>
          </label>
        )}

        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}

        {card(t('Text'), (
          <div className="ds-row">
            <label className="field">
              <span className="label">{t('Font')}</span>
              <select value={style.font.family} onChange={(e) => patch('font', { family: e.target.value })}>
                {DOCUMENT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </label>
            <label className="field ds-size">
              <span className="label">{t('Size')}</span>
              <input type="number" min={8} max={16} step={0.5} value={style.font.size} onChange={(e) => patch('font', { size: Number(e.target.value) || 10.5 })} />
            </label>
            {colour(t('Text'), style.font.color, (v) => patch('font', { color: v }))}
            {colour(t('Titles'), style.accent, (v) => set('accent', v))}
          </div>
        ))}

        {card(t('Colours'), (
          <div className="ds-row">
            {colour(t('Table header'), style.table.header, (v) => patch('table', { header: v }))}
            {colour(t('Table header text'), style.table.headerText, (v) => patch('table', { headerText: v }))}
            {colour(t('Table lines'), style.table.border, (v) => patch('table', { border: v }))}
            {colour(t('Page colour'), style.background, (v) => set('background', v))}
          </div>
        ), t('Page colour: PDF and Word (Word prints it only when "Print background colours" is on).'))}

        {card(t('Header'), (
          <>
            {zones('header')}
            <div className="ds-row ds-logo">
              {style.header.logo ? <img src={style.header.logo} alt={t('Logo')} /> : <span className="ds-logo-empty">{t('No logo')}</span>}
              <button type="button" className="btn btn-ghost" onClick={() => logoRef.current?.click()}>
                {style.header.logo ? t('Change logo') : t('Add a logo')}
              </button>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
              {style.header.logo && <button type="button" className="btn btn-ghost" onClick={() => patch('header', { logo: '' })}>{t('Remove')}</button>}
              <select value={style.header.logoSide} onChange={(e) => patch('header', { logoSide: e.target.value === 'right' ? 'right' : 'left' })} aria-label={t('Logo position')}>
                <option value="left">{t('Logo on the left')}</option>
                <option value="right">{t('Logo on the right')}</option>
              </select>
            </div>
          </>
        ), t('Excel shows the header texts when printing; the logo goes to PDF and Word.'))}

        {card(t('Footer'), zones('footer'))}
        <p className="ds-vars small muted">{t('In the header and footer you can use:')} {VARS.map((v) => <code key={v}>{v}</code>)}</p>

        {card(t('Watermark'), (
          <div className="ds-row">
            <label className="field ds-grow">
              <span className="label">{t('Text')}</span>
              <input value={style.watermark.text} maxLength={40} onChange={(e) => patch('watermark', { text: e.target.value })} placeholder={t('e.g. CONFIDENTIAL, DRAFT')} />
            </label>
            {colour(t('Colour'), style.watermark.color, (v) => patch('watermark', { color: v }))}
            <label className="field ds-opacity">
              <span className="label">{t('Strength')} {Math.round(style.watermark.opacity * 100)}%</span>
              <input type="range" min={3} max={40} value={Math.round(style.watermark.opacity * 100)} onChange={(e) => patch('watermark', { opacity: Number(e.target.value) / 100 })} />
            </label>
          </div>
        ), t('PDF and Word. Excel has no watermark.'))}

        <div className="form-actions ds-actions">
          {info && <span className="small ds-info" role="status">{info}</span>}
          <span className="statusbar-spacer" />
          <button type="button" className="btn btn-ghost" onClick={reset}>{t('Back to the default look')}</button>
          <button type="button" className="btn" disabled={busy || !dirty} onClick={() => { void save(); }}>{busy ? t('Saving…') : t('Save')}</button>
        </div>
      </div>

      <aside className="ds-preview" aria-label={t('Preview')}>
        <span className="label">{t('Preview')}</span>
        <Page style={style} project={project?.name ?? t('Project name')} />
      </aside>
    </div>
  );
}

// A small A4 page drawn with the style, to see it before saving.
function Page({ style: s, project }: { style: DocumentStyle; project: string }) {
  const title = t('Review report');
  const fill = (v: string) => v.replace(/\{project\}/g, project).replace(/\{title\}/g, title).replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{page\}/g, '1').replace(/\{pages\}/g, '3');
  const zone = (z: { left: string; center: string; right: string }, logo?: ReactNode, side?: 'left' | 'right') => (
    <div className="ds-page-zones">
      <span>{side === 'left' && logo}{fill(z.left)}</span>
      <span>{fill(z.center)}</span>
      <span>{fill(z.right)}{side === 'right' && logo}</span>
    </div>
  );
  const logo = s.header.logo ? <img src={s.header.logo} alt="" /> : null;
  const font = `"${s.font.family}", "Segoe UI", Calibri, Arial, sans-serif`;
  return (
    <div className="ds-page" style={{ background: s.background, color: s.font.color, fontFamily: font, fontSize: `${s.font.size * 0.62}pt` }}>
      {(s.header.left || s.header.center || s.header.right || logo) && <header>{zone(s.header, logo, s.header.logoSide)}</header>}
      <main>
        <h1 style={{ color: s.accent, borderColor: s.accent }}>{title}</h1>
        <h2 style={{ color: s.accent }}>{t('Summary')}</h2>
        <p>{t('Three user stories were reviewed. Two need clearer acceptance criteria before the tests are designed.')}</p>
        <table style={{ borderColor: s.table.border }}>
          <thead><tr>{[t('ID'), t('Finding'), t('Severity')].map((h) => <th key={h} style={{ background: s.table.header, color: s.table.headerText, borderColor: s.table.border }}>{h}</th>)}</tr></thead>
          <tbody>
            {[['A1', t('Ambiguous rule'), t('High')], ['A2', t('Missing criterion'), t('Medium')], ['A3', t('Undefined actor'), t('Low')]].map((r) => (
              <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ borderColor: s.table.border }}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="ds-page-lines"><span /><span /><span /><span style={{ width: '60%' }} /></p>
      </main>
      {(s.footer.left || s.footer.center || s.footer.right) && <footer>{zone(s.footer)}</footer>}
      {s.watermark.text && <div className="ds-page-mark" style={{ color: s.watermark.color, opacity: s.watermark.opacity, fontFamily: font }}>{fill(s.watermark.text)}</div>}
    </div>
  );
}
