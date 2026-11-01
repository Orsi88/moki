// Settings › Templates: the list of every document template of the workspace (a card with a
// small page each); opening one shows its editor — the look of the PDF, Word and Excel files the activities and agents generate
// (scripts/lib/doc-style.mjs applies it): font, colours, page colour, header and footer
// (with a logo and page numbers) and a watermark. Each template has tags saying which
// projects it applies to (none = every project); a project with more than one uses the one
// chosen as its default. A live page preview shows the result.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, DOCUMENT_FONTS, type DocumentStyle, type DocumentTemplate } from '../api';
import { t } from '../i18n';
import { TagField, TagFilter, matchesTag, useTagCatalog } from './TagField';
import { ListBack, ListHead, ListTabs, ListTools, countLabel, matchesQuery } from './ListPage';
import { StarButton, useFavorites } from './Favorites';

interface Draft { id: string; name: string; tags: string[]; style: DocumentStyle }

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

export function DocumentStyleForm() {
  const fav = useFavorites('templates');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null); // the template being edited ('' id: not saved yet)
  const [saved, setSaved] = useState('');
  const [catalog, reloadCatalog] = useTagCatalog();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'every' | 'tagged'>('all');
  const [defaultFor, setDefaultFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const open = (tp: DocumentTemplate | Draft) => {
    const d: Draft = { id: tp.id, name: tp.name, tags: tp.tags, style: tp.style };
    setDraft(d); setSaved(JSON.stringify(d)); setError(''); setInfo(''); setDefaultFor('');
  };
  const load = (select?: string) => {
    api.templates().then((list) => {
      setTemplates(list);
      const pick = list.find((x) => x.id === select);
      if (pick) open(pick); else setDraft(null); // no template chosen: the list
    }).catch((e: Error) => setError(e.message));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const style = draft?.style ?? DEFAULT;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== saved;
  const logoRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof DocumentStyle>(key: K, value: DocumentStyle[K]) => { setDraft((d) => (d ? { ...d, style: { ...d.style, [key]: value } } : d)); setInfo(''); };
  const patch = <K extends 'font' | 'table' | 'header' | 'footer' | 'watermark'>(key: K, value: Partial<DocumentStyle[K]>) => set(key, { ...style[key], ...value });
  const current = templates.find((x) => x.id === draft?.id);
  const projectName = (id: string) => catalog?.projects.find((p) => p.project === id)?.name ?? id;
  const ofKind = (x: DocumentTemplate, k: typeof kind) => k === 'all' || (k === 'every' ? !x.tags.length : x.tags.length > 0);
  const visible = templates.filter((x) => ofKind(x, kind) && matchesQuery(query, x.name) && matchesTag(x.tags, filter, catalog));

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(''); setInfo('');
    try { await fn(); if (done) setInfo(done); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const save = () => draft && act(async () => { const r = await api.saveTemplate(draft); load(r.id); }, t('Saved. New files of the projects it applies to use it.'));
  const add = () => { const general = templates.find((x) => !x.tags.length); setDraft({ id: '', name: t('New template'), tags: [], style: general?.style ?? DEFAULT }); setSaved(''); setInfo(''); };
  const duplicate = () => { if (draft) { setDraft({ ...draft, id: '', name: t('{name} (copy)', { name: draft.name }) }); setSaved(''); setInfo(''); } };
  const remove = () => {
    if (!current || !window.confirm(t('Delete the template {name}? The projects that use it go back to the automatic choice.', { name: current.name }))) return;
    void act(async () => { await api.removeTemplate(current.id); load(); });
  };
  const makeDefault = () => current && defaultFor && act(async () => { await api.setProjectTemplate(defaultFor, current.id); load(current.id); }, t('Default template of {project}.', { project: projectName(defaultFor) }));
  const back = () => { if (!dirty || window.confirm(t('Discard unsaved changes?'))) { setDraft(null); setError(''); setInfo(''); } };
  const reset = () => { set('font', DEFAULT.font); setDraft((d) => (d ? { ...d, style: DEFAULT } : d)); };

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

  const where = (x: DocumentTemplate) => (x.tags.length ? x.appliesTo.map(projectName).join(', ') || t('No project yet') : t('Every project'));

  if (!draft) {
    return (
      <div className="list-page">
        <ListHead title={t('Templates')} intro={t('How the PDF, Word and Excel files that your activities and agents generate look. Every AI tool gets the same result.')}
          action={<button type="button" className="btn" onClick={add}>{t('New template')}</button>} />
        <ListTabs label={t('Templates')} value={kind} onChange={setKind} tabs={[
          { id: 'all', label: t('All'), count: templates.length },
          { id: 'every', label: t('For every project'), count: templates.filter((x) => ofKind(x, 'every')).length },
          { id: 'tagged', label: t('For some projects'), count: templates.filter((x) => ofKind(x, 'tagged')).length },
        ]} />
        <ListTools query={query} onQuery={setQuery} placeholder={t('Search templates')} count={countLabel(visible.length, '1 template', '{n} templates')}>
          <TagFilter catalog={catalog} value={filter} onChange={setFilter} />
        </ListTools>
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        <ul className="list-cards">
          {fav.first(visible, (x) => x.id).map((x) => (
            <li key={x.id} className="fav-item">
              <button type="button" className="ds-card-item" onClick={() => open(x)} aria-label={x.name}>
                <span className="ds-thumb" aria-hidden="true"><span className="ds-thumb-page"><Page style={x.style} project={x.usedBy[0] ? projectName(x.usedBy[0]) : t('Project name')} /></span></span>
                <span className="ds-card-body">
                  <span className="ds-template-name">{x.name}</span>
                  <span className="chips">
                    {x.tags.length ? x.appliesTo.map((pr) => <span key={pr} className="chip">📁 {projectName(pr)}</span>) : <span className="chip">{t('Every project')}</span>}
                    {x.tags.length > 0 && !x.appliesTo.length && <span className="chip">{t('No project yet')}</span>}
                  </span>
                  {x.defaultOf.length > 0 && <span className="muted small">{t('Default in: {projects}', { projects: x.defaultOf.map(projectName).join(', ') })}</span>}
                  <span className="muted small">{x.style.font.family} · {x.style.font.size} pt{x.style.header.logo ? ` · ${t('logo')}` : ''}{x.style.watermark.text ? ` · ${x.style.watermark.text}` : ''}</span>
                </span>
              </button>
              <StarButton on={fav.has(x.id)} name={x.name} onToggle={() => fav.toggle(x.id)} />
            </li>
          ))}
          {!visible.length && <li className="muted">{t('No template with this filter.')}</li>}
        </ul>
      </div>
    );
  }

  return (
    <div className="ds-editor">
      <ListBack label={t('Templates')} onBack={back}>
        <span className="list-back-title">{draft.name || t('New template')}</span>
        <span className="muted small">{current ? where(current) : t('Not saved yet')}</span>
      </ListBack>
    <div className="ds">
      <div className="ds-form">
        <label className="field"><span className="label">{t('Name')}</span>
          <input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <TagField value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} catalog={catalog} onCatalog={reloadCatalog} />
        {current && current.appliesTo.length > 1 && (
          <div className="field">
            <span className="label">{t('Default of a project')}</span>
            <span className="muted small">{t('When more than one template applies to a project, it uses its default. Used now by: {projects}.', { projects: current.usedBy.map(projectName).join(', ') || '—' })}</span>
            <div className="ds-row">
              <select value={defaultFor} onChange={(e) => setDefaultFor(e.target.value)} aria-label={t('Project')}>
                <option value="">{t('Choose a project')}</option>
                {current.appliesTo.filter((p) => !current.defaultOf.includes(p)).map((p) => <option key={p} value={p}>{projectName(p)}</option>)}
              </select>
              <button type="button" className="btn btn-ghost" disabled={busy || !defaultFor || dirty} onClick={() => { void makeDefault(); }}>{t('Make it the default')}</button>
            </div>
          </div>
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
          {current && <button type="button" className="btn btn-ghost" onClick={duplicate}>{t('Duplicate')}</button>}
          {current && templates.length > 1 && <button type="button" className="btn btn-ghost" disabled={busy} onClick={remove}>{t('Delete')}</button>}
          <button type="button" className="btn" disabled={busy || !dirty || !draft.name.trim()} onClick={() => { void save(); }}>{busy ? t('Saving…') : t('Save')}</button>
        </div>
      </div>

      <aside className="ds-preview" aria-label={t('Preview')}>
        <span className="label">{t('Preview')}</span>
        <Page style={style} project={current?.usedBy[0] ? projectName(current.usedBy[0]) : t('Project name')} />
      </aside>
    </div>
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
