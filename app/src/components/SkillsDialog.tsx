// Skills: "Already installed" lists what this project has and what is global,
// each row saying where it lives. "Add a skill" searches the SkillMD registry
// or asks the AI tool to draft a proposal. "Plugins" turns caveman or superpowers on for this
// project only (ponytail and rtk are always on). Agents are not created here.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type InstallResult, type ProjectSummary, type RegistrySkill, type SkillScope, type SkillSearchPage, type TerminalRef, type ToolInfo } from '../api';
import { recall, remember } from '../prefs';
import { t } from '../i18n';
import { IconCheck, IconExternal, IconSearch, IconX } from './Icons';
import { InstalledSkills } from './InstalledSkills';
import { SkillLibrary } from './SkillLibrary';
import { SkillForm } from './SkillForm';

export type SkillDialogTab = 'installed' | 'library' | 'add' | 'plugins';
type Tab = SkillDialogTab;
type AddMode = 'find' | 'create';

// tools and onTerminal enable the Create skill tab (it opens the AI tool in a terminal tab).
interface Props {
  project: ProjectSummary;
  initialQuery?: string;
  onClose: () => void;
  tools?: ToolInfo[];
  onTerminal?: (t: TerminalRef) => void;
  /** Renders inside Settings, without the modal frame. */
  embedded?: boolean;
  initialTab?: Tab;
}

const tabList = (): { id: Tab; label: string; intro: string }[] => [
  { id: 'installed', label: t('Already installed'), intro: t('Skills you already have, for this project and for all projects. Each one shows where it lives.') },
  { id: 'library', label: t('Native and created'), intro: t('The skills that come with Moki and the ones you created, installed or not.') },
  { id: 'add', label: t('Add a skill'), intro: t('Search the public SkillMD registry or describe a skill for your AI tool to draft.') },
  { id: 'plugins', label: t('Plugins'), intro: t('Plugins the app loads in the Claude Code and Codex sessions it opens. Sessions started outside the app are not affected.') },
];

// The app plugins (adapters/app-plugins/README.md). Only the optional ones have a switch, saved in project.json.
export const pluginList = (): { name: string; text: string; optional: boolean }[] => [
  { name: 'ponytail', text: t('Simplest code that works: YAGNI, standard library first, no unrequested abstractions.'), optional: false },
  { name: 'rtk', text: t('Runs shell commands through rtk to shrink their output. Needs the rtk command installed.'), optional: false },
  { name: 'caveman', text: t('Terse replies: answer first, no filler, every technical fact kept. Fewer tokens per answer.'), optional: true },
  { name: 'superpowers', text: t('Development workflow skills: brainstorming, plans, test-driven development, systematic debugging, code review.'), optional: true },
];

function PluginsPanel({ project }: { project: ProjectSummary }) {
  const [on, setOn] = useState(project.plugins);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async (name: string) => {
    setBusy(true); setError('');
    try { setOn((await api.setProjectPlugins(project.id, on.includes(name) ? on.filter((p) => p !== name) : [...on, name])).plugins); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (<>
    {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
    <ul className="skill-list">
      {pluginList().map((p) => (
        <li key={p.name} className="skill-card">
          <div className="skill-card-head">
            <span className="choice-title">{p.name}</span>
            <span className="statusbar-spacer" />
            {p.optional ? (
              <label className="field inline">
                <input type="checkbox" checked={on.includes(p.name)} disabled={busy} onChange={() => { void toggle(p.name); }} />
                <span>{t('Use in {name}', { name: project.name })}</span>
              </label>
            ) : <span className="chip">{t('Always on')}</span>}
          </div>
          <p className="skill-desc small">{p.text}</p>
        </li>
      ))}
    </ul>
    <p className="muted small">{t('A change applies to the next session opened from this project.')}</p>
  </>);
}

// Preset searches: a registry category, or a query where the registry has no category (QA).
const presets = (): { label: string; query: string; category: string }[] => [
  { label: t('Programming'), query: '', category: 'coding' },
  { label: t('Design'), query: '', category: 'design' },
  { label: t('QA & testing'), query: 'testing', category: '' },
  { label: t('Security'), query: '', category: 'security' },
  { label: t('Docs & writing'), query: '', category: 'docs' },
];

const audit = (v: string | null): { label: string; cls: string } => ({
  pass: { label: t('Audit passed'), cls: 'pill-completed' },
  caution: { label: t('Audit: caution'), cls: 'pill-in-progress' },
  warning: { label: t('Audit: warning'), cls: 'pill-blocked' },
} as Record<string, { label: string; cls: string }>)[v ?? ''] ?? { label: t('Not audited'), cls: '' };
// The skill's public page (description, files, audit); slugs are validated owner/name pairs.
const skillPage = (slug: string) => `https://skillmd.com/skills/${slug}`;

export function SkillsDialog({ project, initialQuery = '', onClose, tools, onTerminal, embedded = false, initialTab = 'installed' }: Props) {
  const tabs = tabList();
  const canCreate = Boolean(tools && onTerminal);
  const [tab, setTab] = useState<Tab>(initialQuery ? 'add' : initialTab);
  const [addMode, setAddMode] = useState<AddMode>('find');
  const [query, setQuery] = useState(initialQuery.slice(0, 200));
  const [preset, setPreset] = useState('');
  const [scope, setScope] = useState<SkillScope>(recall('qa-skill-scope') === 'global' ? 'global' : 'project');
  const [criteria, setCriteria] = useState({ query: '', category: '' }); // of the results shown, for paging
  const [results, setResults] = useState<SkillSearchPage | null>(null);
  const listTop = useRef<HTMLDivElement>(null);
  const [installed, setInstalled] = useState<{ project: string[]; global: string[] }>({ project: [], global: [] });
  const [busy, setBusy] = useState('');
  const [loadingPage, setLoadingPage] = useState(1);
  const [done, setDone] = useState<InstallResult | null>(null);
  const [error, setError] = useState('');

  const loadInstalled = useCallback(() => { api.installedSkills(project.id).then(setInstalled).catch(() => { /* keep */ }); }, [project.id]);
  useEffect(loadInstalled, [loadInstalled]);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, embedded]);

  // The current page stays visible while the next one loads; status and errors show above the list.
  const search = async (q: string, category: string, page = 1) => {
    setBusy('search'); setLoadingPage(page); setError(''); setDone(null);
    listTop.current?.scrollIntoView({ block: 'start' });
    try {
      setResults(await api.searchSkills(q, category, page));
      setCriteria({ query: q, category });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };
  const goTo = (page: number) => { void search(criteria.query, criteria.category, page); };

  const submit = (e: FormEvent) => { e.preventDefault(); setPreset(''); if (query.trim()) void search(query, ''); };

  const install = async (s: RegistrySkill) => {
    const toClaude = scope === 'project' && Boolean(project.repository);
    const where = scope !== 'project' ? t('all projects (your user folder)')
      : toClaude ? t("the project {name}?\n\nThis CHANGES {folder}/.claude: the skill is written to its skills folder (the current .claude is backed up to the project's backups/ first)", { name: project.name, folder: project.repository })
      : t('the project {name}', { name: project.name });
    const warning = s.verdict === 'pass' ? '' : `\n\n${s.verdict ? t('The registry flagged this skill ({verdict}).', { verdict: s.verdict }) : t('The registry has not audited this skill.')} ${t('A skill can instruct the AI to run commands — review it before using it.')}`;
    if (!window.confirm(`${t('Install "{title}" ({slug}) for {where}', { title: s.title, slug: s.slug, where })}${toClaude ? '.' : '?'}${warning}`)) return;
    setBusy(s.slug); setError(''); setDone(null);
    try { setDone(await api.installSkill(project.id, s.slug, scope, toClaude)); loadInstalled(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };

  const isInstalled = (slug: string) => installed[scope].includes(slug.split('/')[1]);
  const current = tabs.find((tb) => tb.id === tab) ?? tabs[0];
  const openTab = (id: Tab) => { setTab(id); if (id === 'add') loadInstalled(); };

  const panel = (
    <>
        {!embedded && (
        <header className="modal-head">
          <div>
            <h2 id="skills-title">{t('Skills')}</h2>
            <p className="muted small">{current.intro}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        )}
        {embedded && <p className="muted small skills-intro">{current.intro}</p>}

        <div className="dialog-tabs" role="tablist" aria-label={t('Skills')}>
          {tabs.map((tb) => (
            <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} className={`dialog-tab${tab === tb.id ? ' on' : ''}`} onClick={() => openTab(tb.id)}>
              {tb.label}
            </button>
          ))}
        </div>
        {tab === 'add' && canCreate && (
          <div className="dialog-tabs" role="tablist" aria-label={t('Add a skill')}>
            <button type="button" role="tab" aria-selected={addMode === 'find'} className={`dialog-tab${addMode === 'find' ? ' on' : ''}`} onClick={() => setAddMode('find')}>{t('Find skills')}</button>
            <button type="button" role="tab" aria-selected={addMode === 'create'} className={`dialog-tab${addMode === 'create' ? ' on' : ''}`} onClick={() => setAddMode('create')}>{t('Create skill')}</button>
          </div>
        )}

        <div className="modal-body" role="tabpanel">
          {tab === 'add' && <div className="field inline">
            <span className="label">{t('Install for')}</span>
            <div className="choice-grid scope-grid">
              {([
                ['project', project.repository ? t('This repository only') : t('This project only'), project.repository ? `${project.repository}/.claude/skills` : project.name],
                ['global', t('All projects'), t('your user folder, every AI tool')],
              ] as const).map(([id, title, hint]) => (
                <label key={id} className={`choice${scope === id ? ' on' : ''}`}>
                  <input type="radio" name="scope" checked={scope === id} onChange={() => { setScope(id); remember('qa-skill-scope', id); }} />
                  <span className="choice-title">{title}</span>
                  <span className="choice-hint">{hint}</span>
                </label>
              ))}
            </div>
          </div>}

          {tab === 'installed' ? <InstalledSkills project={project} />
            : tab === 'plugins' ? <PluginsPanel project={project} />
            : tab === 'library' ? <SkillLibrary project={project} scope={scope} />
            : tab === 'add' && addMode === 'create' && canCreate && tools && onTerminal ? <SkillForm project={project} scope={scope} tools={tools} onTerminal={onTerminal} /> : (<>
          <form className="skill-search" onSubmit={submit}>
            <input type="search" value={query} maxLength={200} autoFocus onChange={(e) => setQuery(e.target.value)} placeholder={t('e.g. skills to help me write code')} />
            <button type="submit" className="btn" disabled={!query.trim() || Boolean(busy)}><IconSearch size={15} /> {t('Search')}</button>
          </form>

          <div className="chips" role="group" aria-label={t('Categories')}>
            {presets().map((p) => (
              <button key={p.query + p.category} type="button" className={`chip-btn${preset === p.query + p.category ? ' on' : ''}`} disabled={Boolean(busy)}
                onClick={() => { setPreset(p.query + p.category); void search(p.query, p.category); }}>{p.label}</button>
            ))}
          </div>

          <div ref={listTop} />
          {busy === 'search' && <p className="muted small">{loadingPage > 1 ? t('Loading page {n}…', { n: loadingPage }) : t('Searching…')} {t('The registry can take a few seconds.')}</p>}
          {(done || error) && (
            <div className={`result${error ? ' warn' : ''}`} role="status">
              {error && <p className="result-title">{error}</p>}
              {done && (
                <>
                  <p className="result-title"><IconCheck size={17} /> {t('Installed {name} ({n} files)', { name: done.name, n: done.files })}</p>
                  <ul className="small upload-list">{done.folders.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
                  {scope === 'project' && <p className="small">{t('The next request opened from this project tells the AI about it.')}</p>}
                  {done.backup && <p className="small">{t('Backup of the previous .claude:')} <code>{done.backup}</code></p>}
                  {done.unverified.length > 0 && <p className="small warn-text">{t('Downloaded from GitHub without a registry checksum:')} {done.unverified.join(', ')}</p>}
                </>
              )}
            </div>
          )}

          {results && (results.items.length === 0 ? <p className="muted small">{t('No skills found. Try other words, in English.')}</p> : (
            <ul className={`skill-list${busy === 'search' ? ' loading' : ''}`}>
              {results.items.map((s) => {
                const a = audit(s.verdict);
                const has = isInstalled(s.slug);
                return (
                  <li key={s.slug} className="skill-card">
                    <div className="skill-card-head">
                      <span className="choice-title">{s.title}</span>
                      <span className="muted small">{s.slug}</span>
                      <span className="statusbar-spacer" />
                      <button type="button" className="icon-btn" onClick={() => { void api.openLink(skillPage(s.slug)); }}
                        title={t('Open on SkillMD to review the skill and its files before installing')} aria-label={t('Open {title} on SkillMD', { title: s.title })}><IconExternal size={16} /></button>
                      <button type="button" className="btn btn-sm" disabled={has || Boolean(busy)} onClick={() => { void install(s); }}>
                        {has ? t('Installed') : busy === s.slug ? t('Installing…') : t('Install')}
                      </button>
                    </div>
                    <p className="skill-desc small">{s.description}</p>
                    <div className="chips">
                      {s.verified && <span className="pill pill-completed">{t('Verified')}</span>}
                      <span className={`pill ${a.cls}`}>{a.label}</span>
                      {s.category && <span className="chip">{s.category}</span>}
                      {s.rating > 0 && <span className="chip">★ {s.rating.toFixed(1)}</span>}
                      <span className="chip">{t('{n} installs', { n: s.installs })}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
          {results && results.pages > 1 && (
            <nav className="pager" aria-label={t('Result pages')}>
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy) || results.page <= 1} onClick={() => goTo(results.page - 1)}>{t('‹ Previous')}</button>
              <span className="muted small">{t('Page {page} of {pages} · {total} skills', { page: results.page, pages: `${results.pages}${results.capped ? '+' : ''}`, total: `${results.total}${results.capped ? '+' : ''}` })}</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy) || (results.page >= results.pages && !results.capped)} onClick={() => goTo(results.page + 1)}>{t('Next ›')}</button>
            </nav>
          )}
          </>)}
        </div>

        {!embedded && (
        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Close')}</button>
        </footer>
        )}
    </>
  );

  if (embedded) return <div className="skills-embedded">{panel}</div>;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="skills-title">
        {panel}
      </div>
    </div>
  );
}
