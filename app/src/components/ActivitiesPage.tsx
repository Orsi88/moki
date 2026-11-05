// Settings › Activities, in the same shape as the other tabs (ListPage): every activity of
// the workspace - the app's own actions, the ones that come with Moki and your own - with
// filter tabs, a search bar and a star for favorites (they come first where activities are
// picked). An activity is a ready-made request: what it points to (a skill, an agent, a
// workflow or an operation), which inbox files it needs and the text that goes to the AI
// (scripts/lib/activities.ts). The app's actions and the ones of Moki are read-only: duplicate
// one to change it. Your own are edited here and saved in workspace/library/activities/.

import { useCallback, useEffect, useState } from 'react';
import { api, type ActivityDetail, type ActivityDraft, type ActivityInfo } from '../api';
import { t } from '../i18n';
import { IconStar } from './Icons';
import { BackArrow, ListHead, ListTabs, ListTools, countLabel, matchesQuery } from './ListPage';
import { TagField, useTagCatalog } from './TagField';

type Kind = 'all' | 'favorites' | 'moki' | 'builtin' | 'library';
type Targets = { skills: string[]; agents: string[]; workflows: string[]; operations: { id: string; name: string }[] };

const EMPTY: ActivityDraft = { label: '', description: '', category: '', kind: 'skill', target: '', files: 'optional', note: '', tags: [], template: '' };
const sourceLabel = (s: ActivityInfo['source']) => ({ moki: t('Moki action'), builtin: t('Comes with Moki'), library: t('Your activity') })[s];
const filesLabel = (f: string) => ({ required: t('Needs inbox files'), optional: t('Inbox files optional'), none: t('No files') } as Record<string, string>)[f] ?? f;
const kindLabel = (k: string) => ({ skill: t('Skill'), agent: t('Agent'), workflow: t('Workflow'), operation: t('Operation'), moki: t('Moki') } as Record<string, string>)[k] ?? k;
const toDraft = (a: ActivityDetail): ActivityDraft => ({
  id: a.source === 'library' ? a.id : undefined, label: a.label, description: a.hint, category: a.category,
  kind: a.target.kind === 'moki' ? 'skill' : a.target.kind, target: a.target.name, files: a.files, note: a.note, tags: a.tags, template: a.template,
});

export function ActivitiesPage() {
  const [list, setList] = useState<ActivityInfo[] | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ActivityDetail | null>(null);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [catalog, reloadCatalog] = useTagCatalog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(() => { api.activities().then((r) => setList(r.activities)).catch((e: Error) => setError(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => { api.activityTargets().then(setTargets).catch(() => setTargets(null)); }, []);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(''); setInfo('');
    try { await fn(); if (done) setInfo(done); load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const show = (id: string) => act(async () => { const a = await api.activity(id); setOpen(a); setDraft(a.source === 'library' ? toDraft(a) : null); });
  const star = (a: { id: string; favorite: boolean }) => act(async () => {
    await api.setActivityFavorite(a.id, !a.favorite);
    setOpen((o) => (o && o.id === a.id ? { ...o, favorite: !a.favorite } : o));
  });
  const save = () => draft && act(async () => { const saved = await api.saveActivity(draft); const a = await api.activity(saved.id); setOpen(a); setDraft(toDraft(a)); }, t('Saved.'));
  const duplicate = (id: string) => act(async () => { const copy = await api.duplicateActivity(id); const a = await api.activity(copy.id); setOpen(a); setDraft(toDraft(a)); }, t('Copied to your activities.'));
  const remove = (a: ActivityDetail) => {
    if (!window.confirm(t('Delete the activity "{name}"?', { name: t(a.label) }))) return;
    void act(async () => { await api.deleteActivity(a.id); setOpen(null); setDraft(null); }, t('Deleted.'));
  };

  const all = list ?? [];
  const ofKind = (a: ActivityInfo, k: Kind) => k === 'all' || (k === 'favorites' ? a.favorite : a.source === k);
  const shown = all.filter((a) => ofKind(a, kind) && matchesQuery(query, t(a.label), t(a.hint), a.category, a.target.name))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const set = (patch: Partial<ActivityDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const options = (k: string): { id: string; name: string }[] => !targets ? [] : k === 'skill' ? targets.skills.map((n) => ({ id: n, name: n }))
    : k === 'agent' ? targets.agents.map((n) => ({ id: n, name: n })) : k === 'workflow' ? targets.workflows.map((n) => ({ id: n, name: n })) : targets.operations;
  const starButton = (a: { id: string; favorite: boolean; label: string }) => (
    <button type="button" className={`icon-btn star-btn${a.favorite ? ' on' : ''}`} disabled={busy} aria-pressed={a.favorite}
      title={a.favorite ? t('Remove from favorites') : t('Add to favorites')} aria-label={t('Favorite: {name}', { name: t(a.label) })} onClick={() => { void star(a); }}><IconStar size={16} /></button>
  );

  // The form of a new activity or of one of yours.
  const form = (d: ActivityDraft) => (
    <fieldset disabled={busy} className="activity-form">
      <label className="field"><span className="label">{t('Name')}</span><input value={d.label} maxLength={80} onChange={(e) => set({ label: e.target.value })} placeholder={t('e.g. Review release notes')} /></label>
      <label className="field"><span className="label">{t('Description')}</span><input value={d.description} maxLength={300} onChange={(e) => set({ description: e.target.value })} placeholder={t('What it does, in a few words')} /></label>
      <label className="field"><span className="label">{t('Category')}</span><input value={d.category} maxLength={40} onChange={(e) => set({ category: e.target.value })} placeholder="QA" /></label>
      <div className="activity-uses">
        <label className="field"><span className="label">{t('It uses')}</span>
          <select value={d.kind} onChange={(e) => set({ kind: e.target.value, target: '' })}>
            {['skill', 'agent', 'workflow', 'operation'].map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{kindLabel(d.kind)}</span>
          <select value={d.target} onChange={(e) => set({ target: e.target.value })} aria-label={t('What it uses')}>
            <option value="">{t('Choose…')}</option>
            {options(d.kind).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{t('Inbox files')}</span>
          <select value={d.files} onChange={(e) => set({ files: e.target.value })}>
            {['required', 'optional', 'none'].map((f) => <option key={f} value={f}>{filesLabel(f)}</option>)}
          </select>
        </label>
      </div>
      {d.kind === 'operation' && <p className="muted small">{t('Picking it opens the start form of the operation.')}</p>}
      <label className="field">
        <span className="label">{t('Request sent to the AI')}</span>
        <textarea rows={6} value={d.template} maxLength={4000} onChange={(e) => set({ template: e.target.value })}
          placeholder={t('e.g. Use the test-design skill to map the test scenarios for: {files}.')} />
        <span className="muted small">{t('{files} becomes the chosen inbox files (a line with it is left out when there are none); a line that starts with {no-files} is kept only when there are none; {project} is the project id. Empty: it asks for the skill, workflow or agent it uses.')}</span>
      </label>
      <label className="field"><span className="label">{t('Hint for the note (optional)')}</span><input value={d.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} /></label>
      <TagField value={d.tags} onChange={(tags) => set({ tags })} catalog={catalog} onCatalog={reloadCatalog} />
    </fieldset>
  );

  if (draft && !draft.id && !open) {
    return (
      <div className="list-page skill-page">
        <header className="library-head"><div className="title-row"><BackArrow label={t('Activities')} onBack={() => setDraft(null)} /><h1>{t('New activity')}</h1></div></header>
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        <section className="agent-card">{form(draft)}</section>
        <div className="agent-savebar"><span className="statusbar-spacer" />
          <button type="button" className="btn" disabled={busy || !draft.label.trim() || !draft.target} onClick={() => { void save(); }}>{t('Save')}</button>
        </div>
      </div>
    );
  }

  if (open) {
    const mine = open.source === 'library' && draft;
    return (
      <div className="list-page skill-page">
        <header className="library-head">
          <div className="title-row"><BackArrow label={t('Activities')} onBack={() => { setOpen(null); setDraft(null); setInfo(''); setError(''); }} /><h1>{t(open.label)}</h1>{starButton(open)}</div>
          <div className="agent-badges">
            <span className={`chip${open.source === 'library' ? ' chip-accent' : ''}`}>{sourceLabel(open.source)}</span>
            <span className="chip">{kindLabel(open.target.kind)}: {open.target.name}</span>
            <span className="chip">{filesLabel(open.files)}</span>
            {!open.available && <span className="chip">{t('Not available yet')}</span>}
          </div>
        </header>
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        {info && <div className="result" role="status"><p className="result-title">{info}</p></div>}
        {mine ? (
          <>
            <section className="agent-card">{form(draft)}</section>
            <div className="agent-savebar">
              <span className="muted small">{open.path}</span><span className="statusbar-spacer" />
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remove(open)}>{t('Delete')}</button>
              <button type="button" className="btn" disabled={busy || !draft.label.trim() || !draft.target} onClick={() => { void save(); }}>{t('Save')}</button>
            </div>
          </>
        ) : (
          <>
            <section className="agent-card">
              <div className="agent-card-head"><h2>{t('Description')}</h2></div>
              <p>{t(open.hint) || '—'}</p>
              {open.source === 'moki'
                ? <p className="muted small">{t('An action of the app itself: its request depends on Moki (the project, its plan, the run to resume), so it cannot be changed.')}</p>
                : <p className="muted small">{t('Comes with Moki ({path}). Duplicate it to change it: the copy is yours.', { path: open.path })}</p>}
            </section>
            {open.template && (
              <section className="agent-card">
                <div className="agent-card-head"><h2>{t('Request sent to the AI')}</h2></div>
                <pre className="activity-template">{open.template}</pre>
              </section>
            )}
            {open.source === 'builtin' && (
              <div className="agent-savebar"><span className="statusbar-spacer" />
                <button type="button" className="btn" disabled={busy} onClick={() => { void duplicate(open.id); }}>{t('Duplicate to edit')}</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="list-page">
      <ListHead title={t('Activities')} intro={t('The ready-made requests you pick in "Open in your AI tool": what to ask, of which skill, agent, workflow or operation, and with which files. Star the ones you use most: they come first.')}
        action={<button type="button" className="btn" onClick={() => { setOpen(null); setDraft({ ...EMPTY }); setError(''); }}>{t('New activity')}</button>} />
      <ListTabs label={t('Activities')} value={kind} onChange={setKind} tabs={[
        { id: 'all', label: t('All'), count: all.length },
        { id: 'favorites', label: t('Favorites'), count: all.filter((a) => a.favorite).length },
        { id: 'builtin', label: t('Comes with Moki'), count: all.filter((a) => a.source === 'builtin').length },
        { id: 'library', label: t('Your activities'), count: all.filter((a) => a.source === 'library').length },
        { id: 'moki', label: t('Moki actions'), count: all.filter((a) => a.source === 'moki').length },
      ]} />
      <ListTools query={query} onQuery={setQuery} placeholder={t('Search activities')} count={countLabel(shown.length, '1 activity', '{n} activities')} />
      {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
      <ul className="list-cards">
        {shown.map((a) => (
          <li key={a.id} className="activity-item">
            <button type="button" className="list-card" onClick={() => { void show(a.id); }}>
              <span className="list-card-title">{t(a.label)}</span>
              <span className="list-card-desc">{t(a.hint)}</span>
              <span className="chips">
                <span className={`chip${a.source === 'library' ? ' chip-accent' : ''}`}>{sourceLabel(a.source)}</span>
                <span className="chip">{kindLabel(a.target.kind)}: {a.target.name}</span>
                {!a.available && <span className="chip">{t('Not available yet')}</span>}
              </span>
            </button>
            {starButton(a)}
          </li>
        ))}
      </ul>
      {list && !shown.length && <p className="list-empty">{t('No activity with these filters.')}</p>}
    </div>
  );
}
