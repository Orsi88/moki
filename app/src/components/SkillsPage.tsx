// Settings › Skills, in the same shape as the other tabs (ListPage): one list of every skill
// of the workspace — the ones that come with Moki, the ones you created (proposals in a
// project's skill-proposals/), the ones installed from the registry, and the app plugins —
// with filter tabs and a search bar. Choosing one opens its detail: where it is installed,
// install or remove it, and for a plugin the projects that use it. "Add a skill" opens the
// registry search and the Create skill form (SkillsDialog, embedded), installing for every project.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ProjectSummary, type TerminalRef, type ToolInfo } from '../api';
import { t } from '../i18n';
import { skillCat } from '../icons/cats';
import { CatIcon } from './CatIcon';
import { IconFolder } from './Icons';
import { BackArrow, ListHead, ListTabs, ListTools, countLabel, matchesQuery } from './ListPage';
import { SkillCat } from './SkillCat';
import { SkillsDialog, pluginList } from './SkillsDialog';

type Kind = 'all' | 'native' | 'created' | 'installed' | 'plugin';
type Place = { kind: 'global'; linkedBy: string[] } | { kind: 'project'; project: ProjectSummary };

interface Skill {
  name: string; description: string;
  native?: { status: string };
  proposals: ProjectSummary[]; // projects whose skill-proposals/ has it (created by you)
  places: Place[]; // where it is installed
  plugin?: { optional: boolean };
}

interface Props {
  project: ProjectSummary; // where Create skill opens its terminal
  projects: ProjectSummary[];
  tools: ToolInfo[];
  onTerminal: (terminal: TerminalRef) => void;
  startOnAdd?: boolean;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const READY = new Set(['stable', 'draft']);

export function SkillsPage({ project, projects, tools, onTerminal, startOnAdd = false }: Props) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [plugins, setPlugins] = useState<Record<string, string[]>>(() => Object.fromEntries(projects.map((p) => [p.id, p.plugins])));
  const [kind, setKind] = useState<Kind>('all');
  const [where, setWhere] = useState(''); // '' | 'global' | a project id
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(startOnAdd);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    const [native, global, local, created] = await Promise.all([
      api.skills(),
      api.globalItems(),
      Promise.all(projects.map((p) => api.projectItems(p.id).catch(() => null))),
      Promise.all(projects.map((p) => api.skillProposals(p.id).catch(() => []))),
    ]);
    const map = new Map<string, Skill>();
    const get = (name: string, description: string) => {
      const s = map.get(name) ?? { name, description, proposals: [], places: [] };
      if (!s.description && description) s.description = description;
      map.set(name, s);
      return s;
    };
    for (const s of native) get(s.name, s.description).native = { status: s.status };
    projects.forEach((p, i) => {
      for (const s of created[i]) get(s.name, s.description).proposals.push(p);
      for (const s of local[i]?.skills ?? []) get(s.name, s.description).places.push({ kind: 'project', project: p });
    });
    for (const s of global.skills) get(s.name, s.description).places.push({ kind: 'global', linkedBy: s.linkedBy });
    for (const p of pluginList()) get(p.name, p.text).plugin = { optional: p.optional };
    setSkills([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }, [projects]);
  useEffect(() => { load().catch((e) => setError(message(e))); }, [load]);

  const ofKind = (s: Skill, k: Kind) => k === 'all' || (k === 'native' ? Boolean(s.native)
    : k === 'created' ? s.proposals.length > 0 : k === 'installed' ? s.places.length > 0 : Boolean(s.plugin));
  const atPlace = (s: Skill) => !where || s.places.some((pl) => (where === 'global' ? pl.kind === 'global' : pl.kind === 'project' && pl.project.id === where))
    || (s.plugin && (!s.plugin.optional || where === 'global' || (plugins[where] ?? []).includes(s.name)));
  const all = skills ?? [];
  const shown = all.filter((s) => ofKind(s, kind) && atPlace(s) && matchesQuery(query, s.name, s.description));
  const current = useMemo(() => all.find((s) => s.name === open) ?? null, [all, open]);

  const act = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key); setError(''); setInfo('');
    try { const done = await fn(); if (done) setInfo(done); await load(); } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };
  const removePlace = (s: Skill, pl: Place) => act(`rm:${pl.kind === 'project' ? pl.project.id : 'global'}`, async () => {
    if (pl.kind === 'global') {
      const used = pl.linkedBy.length ? `\n\n${t('Linked by: {projects}. Those projects stop naming it in their requests.', { projects: pl.linkedBy.join(', ') })}` : '';
      if (!window.confirm(`${t('Remove the skill "{name}" from all projects? It goes to the trash.', { name: s.name })}${used}`)) return;
      await api.removeGlobal('skill', s.name);
    } else {
      const p = pl.project;
      const target = p.repository
        ? t("the repository {folder}?\n\nThis CHANGES its .claude (the current .claude is backed up to the project's backups/ first).", { folder: p.repository })
        : t('the project {name}?', { name: p.name });
      if (!window.confirm(`${t('Remove the skill "{name}" from', { name: s.name })} ${target} ${t('It goes to the trash.')}`)) return;
      const r = await api.removeProjectItem(p.id, 'skill', s.name, Boolean(p.repository));
      return r.backup ? `${t('Backup of the previous .claude:')} ${r.backup}` : undefined;
    }
  });
  const installProposal = (s: Skill, from: ProjectSummary) => act('install', async () => {
    if (!window.confirm(`${t('Install the proposal "{name}" for {where}', { name: s.name, where: t('all projects (your user folder)') })}?\n\n${t('Review its SKILL.md first: a skill can instruct the AI to run commands.')}`)) return;
    const r = await api.installProposal(from.id, s.name, 'global');
    return t('Installed {name} in {folders}', { name: r.name, folders: r.folders.join(', ') });
  });
  // The box changes at once; if saving fails, it goes back to what project.json has.
  const togglePlugin = (projectId: string, name: string) => {
    const now = plugins[projectId] ?? [];
    const next = now.includes(name) ? now.filter((p) => p !== name) : [...now, name];
    setPlugins((m) => ({ ...m, [projectId]: next }));
    return act(`plugin:${projectId}`, async () => {
      try { const saved = (await api.setProjectPlugins(projectId, next)).plugins; setPlugins((m) => ({ ...m, [projectId]: saved })); }
      catch (e) { setPlugins((m) => ({ ...m, [projectId]: now })); throw e; }
    });
  };

  const badges = (s: Skill) => (
    <>
      {s.native && <span className="chip">{t('Native')}</span>}
      {s.proposals.length > 0 && <span className="chip chip-accent">{t('Your skill')}</span>}
      {s.plugin && <span className="chip chip-plugin">{t('Plugin')}</span>}
      {s.native && !READY.has(s.native.status) && <span className="chip">{t('Coming soon')}</span>}
      {s.places.map((pl) => <span key={pl.kind === 'project' ? pl.project.id : 'global'} className="chip">{pl.kind === 'global' ? t('Every project') : `📁 ${pl.project.name}`}</span>)}
      {s.plugin && (s.plugin.optional
        ? <span className="chip">{countLabel(projects.filter((p) => (plugins[p.id] ?? []).includes(s.name)).length, 'Used in 1 project', 'Used in {n} projects')}</span>
        : <span className="chip">{t('Always on')}</span>)}
    </>
  );

  if (adding) {
    return (
      <div className="skills-add">
        <div className="list-back"><BackArrow label={t('Skills')} onBack={() => { setAdding(false); void load(); }} /><span className="list-back-title">{t('Add a skill')}</span></div>
        <SkillsDialog embedded initialTab="add" project={project} projects={projects} tools={tools} onTerminal={onTerminal} onClose={() => setAdding(false)} />
      </div>
    );
  }

  if (current) {
    const installed = current.places.length > 0;
    return (
      <div className="list-page skill-page">
        <header className="library-head">
          <div>
            <div className="title-row"><BackArrow label={t('Skills')} onBack={() => { setOpen(null); setInfo(''); setError(''); }} /><SkillCat name={current.name} size={32} /><h1>{current.name}</h1></div>
            <div className="agent-badges">{badges(current)}</div>
          </div>
        </header>
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        {info && <div className="result" role="status"><p className="result-title">{info}</p></div>}
        <section className="agent-card">
          <div className="agent-card-head"><h2>{t('Description')}</h2></div>
          <p>{current.description || '—'}</p>
          {current.native && <p className="muted small">{t('Comes with Moki: always available in every project. The activities of the side panel use it.')}</p>}
        </section>

        {current.plugin ? (
          <section className="agent-card">
            <div className="agent-card-head"><h2>{t('Where it is used')}</h2></div>
            {current.plugin.optional ? (
              <>
                <p className="muted small">{t('Plugins the app loads in the Claude Code and Codex sessions it opens. A change applies to the next session opened from that project.')}</p>
                <ul className="skill-places">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <label className="check-row">
                        <input type="checkbox" checked={(plugins[p.id] ?? []).includes(current.name)} disabled={Boolean(busy)} onChange={() => { void togglePlugin(p.id, current.name); }} />
                        <span>{p.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="muted small">{t('Always on in the sessions the app opens.')}</p>}
          </section>
        ) : (
          <section className="agent-card">
            <div className="agent-card-head"><h2>{t('Where it is installed')}</h2></div>
            {!installed && <p className="muted small">{current.native ? t('Native skills need no install.') : t('Not installed yet.')}</p>}
            {installed && (
              <ul className="skill-places">
                {current.places.map((pl) => {
                  const key = pl.kind === 'project' ? pl.project.id : 'global';
                  return (
                    <li key={key}>
                      <span>{pl.kind === 'global' ? t('Every project (your user folder)') : `📁 ${pl.project.name}`}</span>
                      {pl.kind === 'global' && pl.linkedBy.length > 0 && <span className="muted small">{pl.linkedBy.length === 1 ? t('Linked by 1 project') : t('Linked by {n} projects', { n: pl.linkedBy.length })}</span>}
                      <span className="statusbar-spacer" />
                      {pl.kind === 'global' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { api.openGlobal('skill', current.name).catch((e) => setError(message(e))); }}><IconFolder size={15} /> {t('Open')}</button>}
                      <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => { void removePlace(current, pl); }}>{busy === `rm:${key}` ? t('Removing…') : t('Remove')}</button>
                    </li>
                  );
                })}
              </ul>
            )}
            {current.proposals.length > 0 && !current.places.some((pl) => pl.kind === 'global') && (
              <div className="agent-savebar">
                <span className="muted small">{t('Created in {project}: skill-proposals/{name}/SKILL.md', { project: current.proposals[0].name, name: current.name })}</span>
                <span className="statusbar-spacer" />
                <button type="button" className="btn btn-sm" disabled={Boolean(busy)} onClick={() => { void installProposal(current, current.proposals[0]); }}>{busy === 'install' ? t('Installing…') : t('Install for every project')}</button>
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="list-page">
      <ListHead title={t('Skills')} intro={t('What your agents and activities know how to do: the skills that come with Moki, the ones you created and the ones installed in each project or for all of them.')}
        action={<button type="button" className="btn" onClick={() => setAdding(true)}>{t('Add a skill')}</button>} />
      <ListTabs label={t('Skills')} value={kind} onChange={setKind} tabs={[
        { id: 'all', label: t('All'), count: all.length },
        { id: 'native', label: t('Native skills'), count: all.filter((s) => ofKind(s, 'native')).length },
        { id: 'created', label: t('Created by you'), count: all.filter((s) => ofKind(s, 'created')).length },
        { id: 'installed', label: t('Installed ones'), count: all.filter((s) => ofKind(s, 'installed')).length },
        { id: 'plugin', label: t('Plugins'), count: all.filter((s) => ofKind(s, 'plugin')).length },
      ]} />
      <ListTools query={query} onQuery={setQuery} placeholder={t('Search skills')} count={countLabel(shown.length, '1 skill', '{n} skills')}>
        <select value={where} onChange={(e) => setWhere(e.target.value)} aria-label={t('Where')}>
          <option value="">{t('Anywhere')}</option>
          <option value="global">{t('Every project (your user folder)')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>📁 {p.name}</option>)}
        </select>
      </ListTools>
      {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
      <ul className="list-cards">
        {shown.map((s) => (
          <li key={s.name}>
            <button type="button" className={`list-card skill-item${s.plugin ? ' is-plugin' : ''}`} onClick={() => setOpen(s.name)}>
              <span className="list-card-title"><CatIcon id={skillCat(s.name)} size={26} />{s.name}</span>
              <span className="list-card-desc">{s.description}</span>
              <span className="chips">{badges(s)}</span>
            </button>
          </li>
        ))}
      </ul>
      {skills && !shown.length && <p className="list-empty">{t('No skill with these filters.')}</p>}
    </div>
  );
}
