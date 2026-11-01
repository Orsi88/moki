// Agent library: opens on the list of every agent (built-in, the user's own and the ones in
// the user folder) with filters; choosing one opens its page. Built-in agents are read-only, by
// category. A built-in agent is customized by duplicating it; the copy lives in
// workspace/library/agents/ and can be edited or deleted. Agents created for a
// project or for every project are listed under those headings. The tags of an agent say
// which projects it reaches (none = every project); the list filters by tag. One of your
// own agents also chooses its skills here.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AgentContract, type AgentDetail, type AgentInfo, type AgentProfile, type Category, type ProjectSummary, type SkillInfo, type ToolInfo } from '../api';
import { AgentContractFields } from '../components/AgentContractFields';
import { t } from '../i18n';
import { IconCopy, IconEdit, IconFolder, IconHome, IconTrash, IconX } from '../components/Icons';
import { AddButton } from '../components/AddButton';
import { TagField, TagFilter, matchesTag, useTagCatalog } from '../components/TagField';
import { SkillsField } from '../components/SkillsField';
import { BackArrow, ListHead, ListTabs, ListTools, countLabel, matchesQuery } from '../components/ListPage';

// The sections every agent's instructions keep (scripts/lib/agents.ts AGENT_SECTIONS).
const AGENT_SECTIONS = ['Role', 'When to use', 'How to work', 'Boundaries'];

const fromDetail = (d: AgentDetail): AgentProfile => ({
  description: d.description, body: d.body.replace(/^\n+/, ''), skills: d.skills,
  contract: { inputs: d.inputs, outputs: d.outputs, outcomes: d.outcomes ?? [], mcps: d.mcps, ai: d.ai },
});

interface ScopeAgent { name: string; description: string; contract?: AgentContract }
type Sel = { kind: 'library' | 'project' | 'global'; name: string };

interface Props {
  onBack: () => void;
  backLabel: string;
  embedded?: boolean;
  /** Yellow plus in the list. Opens the create-agent form in this tab. */
  onCreate?: () => void;
  creating?: boolean;
  /** Called when an agent in the list is chosen, so the form can close. */
  onBrowse?: () => void;
  create?: ReactNode;
  /** Project whose installed agents are listed beside the library. */
  project?: ProjectSummary | null;
  /** Bumped after an agent is created, so that list reloads. */
  installedTick?: number;
}

export const accessLabel = (access: string): string => ({
  'read-only': t('Reads only — writes nothing'),
  'project-write': t('Writes only in the project folder'),
  'repository-write': t('May change a linked repository, after an approved plan'),
} as Record<string, string>)[access] ?? access;

const statusText = (status: string): string => ({ stable: t('Stable'), draft: t('Draft'), 'pending-migration': t('Pending migration'), planned: t('Planned') } as Record<string, string>)[status] ?? status;

export function Library({ onBack, backLabel, embedded = false, onCreate, creating = false, onBrowse, create, project = null, installedTick = 0 }: Props) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [projectAgents, setProjectAgents] = useState<ScopeAgent[]>([]);
  const [globalAgents, setGlobalAgents] = useState<ScopeAgent[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One of your agents edited on its page (description, instructions, skills, contract), saved at once.
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [mcps, setMcps] = useState<string[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [catalog, reloadCatalog] = useTagCatalog();
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'builtin' | 'custom' | 'global'>('all');
  const [category, setCategory] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  useEffect(() => {
    api.agentTags().then(setTags).catch(() => setTags({}));
    api.skills().then(setSkills).catch(() => setSkills([]));
  }, []);
  useEffect(() => {
    api.knownMcps(project?.id).then(setMcps).catch(() => setMcps([]));
    api.integrations().then(setTools).catch(() => setTools([]));
  }, [project?.id]);

  const load = useCallback(async (select?: string) => {
    const [list, cats] = await Promise.all([api.agents(), api.categories()]);
    setAgents(list);
    setCategories(cats);
    setSel((cur) => {
      if (select) return { kind: 'library', name: select };
      if (cur?.kind === 'library' && list.some((a) => a.name === cur.name)) return cur;
      if (cur && cur.kind !== 'library') return cur;
      return null; // the list
    });
  }, []);

  const loadInstalled = useCallback(() => {
    const local = project ? api.projectItems(project.id).then((items) => items.agents) : Promise.resolve([]);
    Promise.all([local, api.globalItems().then((items) => items.agents)])
      .then(([localAgents, global]) => { setProjectAgents(localAgents); setGlobalAgents(global); })
      .catch((e: Error) => setError(e.message));
  }, [project]);

  useEffect(() => { load().catch((e: Error) => setError(e.message)); }, [load]);
  useEffect(() => { loadInstalled(); }, [loadInstalled, installedTick]);

  const libraryName = sel?.kind === 'library' ? sel.name : null;
  useEffect(() => {
    setEditing(false);
    if (!libraryName) { setDetail(null); return; }
    api.agent(libraryName).then((d) => { setDetail(d); setDraft(d.text); setProfile(d.source === 'custom' ? fromDetail(d) : null); }).catch((e: Error) => setError(e.message));
  }, [libraryName]);

  const shown: AgentContract | null = detail ? { inputs: detail.inputs, outputs: detail.outputs, outcomes: detail.outcomes ?? [], mcps: detail.mcps, ai: detail.ai } : null;
  const profileDirty = profile !== null && detail !== null && JSON.stringify(profile) !== JSON.stringify(fromDetail(detail));
  const dirty = (editing && detail !== null && draft !== detail.text) || profileDirty;
  const missing = profile ? AGENT_SECTIONS.filter((h) => !new RegExp(`^## ${h}\\s*$`, 'm').test(profile.body)) : [];
  const back = () => {
    if (creating) { onBrowse?.(); return; }
    if (dirty && !window.confirm(t('Discard unsaved changes?'))) return;
    setError(''); setSel(null);
  };
  const choose = (next: Sel) => {
    if (dirty && !window.confirm(t('Discard unsaved changes?'))) return;
    setError('');
    setSel(next);
    if (creating) onBrowse?.();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const duplicate = () => run(async () => {
    if (!detail) return;
    const copy = await api.duplicateAgent(detail.name);
    await load(copy.name);
  });

  const save = () => run(async () => {
    if (!detail) return;
    await api.saveAgent(detail.name, draft);
    const fresh = await api.agent(detail.name);
    setDetail(fresh); setDraft(fresh.text); setProfile(fromDetail(fresh)); setEditing(false);
    await load(detail.name);
  });

  const saveProfile = () => run(async () => {
    if (!detail || !profile) return;
    await api.saveAgentProfile(detail.name, profile);
    const fresh = await api.agent(detail.name);
    setDetail(fresh); setDraft(fresh.text); setProfile(fromDetail(fresh));
    await load(detail.name);
  });

  const remove = () => run(async () => {
    if (!detail || !window.confirm(t('Delete the agent "{name}"? This removes its file from your library.', { name: detail.name }))) return;
    await api.deleteAgent(detail.name);
    await load(agents.find((a) => a.name !== detail.name)?.name);
  });

  const saveTags = (next: string[]) => run(async () => {
    if (!detail) return;
    const kept = await api.setAgentTags(detail.name, next);
    setTags((m) => ({ ...m, [detail.name]: kept }));
  });

  const shownAgents = agents.filter((a) => (kind === 'all' || kind === a.source) && (!category || a.category === category)
    && matchesQuery(query, a.name, a.description) && matchesTag(tags[a.name] ?? [], filter, catalog));
  const shownGlobal = kind === 'all' || kind === 'global' ? globalAgents.filter((a) => !filter && !category && matchesQuery(query, a.name, a.description)) : [];
  const tagName = (id: string) => (id.startsWith('project:') ? `📁 ${catalog?.projects.find((p) => p.id === id)?.name ?? id.slice(8)}` : `# ${catalog?.tags.find((tg) => tg.id === id)?.name ?? id}`);

  const leave = () => { if (!dirty || window.confirm(t('Discard unsaved changes?'))) onBack(); };

  const scopeAgent = sel?.kind === 'project' ? projectAgents.find((a) => a.name === sel.name)
    : sel?.kind === 'global' ? globalAgents.find((a) => a.name === sel.name) : undefined;

  const removeScope = () => run(async () => {
    if (!sel || sel.kind === 'library' || !scopeAgent) return;
    if (sel.kind === 'project' && project) {
      const where = project.repository
        ? t("the repository {folder}?\n\nThis CHANGES its .claude (the current .claude is backed up to the project's backups/ first).", { folder: project.repository })
        : t('the project {name}?', { name: project.name });
      if (!window.confirm(`${t('Remove the agent "{name}" from', { name: sel.name })} ${where} ${t('It goes to the trash.')}`)) return;
      await api.removeProjectItem(project.id, 'agent', sel.name, Boolean(project.repository));
    } else {
      if (!window.confirm(t('Remove the agent "{name}" from all projects? It goes to the trash.', { name: sel.name }))) return;
      await api.removeGlobal('agent', sel.name);
    }
    setSel(null);
    loadInstalled();
  });

  return (
    <div className="library library-single">
      <main className="library-main">
        {error && <div className="error-bar">{error}<button type="button" className="icon-btn" onClick={() => setError('')}><IconX size={14} /></button></div>}
        {creating && create ? <div className="library-detail library-create"><BackArrow label={t('Agents')} onBack={back} />{create}</div>
          : !sel ? (
            <div className="list-page">
              {!embedded && <button type="button" className="btn btn-ghost btn-sm library-back" onClick={leave}><IconHome size={15} /> {backLabel}</button>}
              <ListHead title={t('Agents')} intro={t('Roles with instructions that use skills. Built-in agents come with Moki; duplicate one to make it yours. Tags say which projects each one reaches.')}
                action={onCreate && <button type="button" className="btn" onClick={onCreate}>{t('Create agent')}</button>} />
              <ListTabs label={t('Agents')} value={kind} onChange={setKind} tabs={[
                { id: 'all', label: t('All'), count: agents.length + globalAgents.length },
                { id: 'builtin', label: t('Built-in'), count: agents.filter((a) => a.source === 'builtin').length },
                { id: 'custom', label: t('Your own'), count: agents.filter((a) => a.source === 'custom').length },
                { id: 'global', label: t('In your user folder'), count: globalAgents.length },
              ]} />
              <ListTools query={query} onQuery={setQuery} placeholder={t('Search agents')} count={countLabel(shownAgents.length + shownGlobal.length, '1 agent', '{n} agents')}>
                <TagFilter catalog={catalog} value={filter} onChange={setFilter} />
                <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('Category')}>
                  <option value="">{t('All categories')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </ListTools>
              {categories.map((c) => {
                const group = shownAgents.filter((a) => a.category === c.id);
                if (!group.length) return null;
                return (
                  <section key={c.id} className="list-group">
                    <h2 className="list-group-head" title={c.description}>{c.label}</h2>
                    <ul className="list-cards">
                      {group.map((a) => (
                        <li key={a.name}>
                          <button type="button" className="list-card library-item" onClick={() => choose({ kind: 'library', name: a.name })}>
                            <span className="list-card-title"><span className={`dot ${a.usable ? 'dot-ok' : 'dot-muted'}`} title={statusText(a.status)} />{a.name}</span>
                            <span className="list-card-desc">{a.description}</span>
                            <span className="chips">
                              {a.source === 'custom' && <span className="chip chip-accent">{t('yours')}</span>}
                              {(tags[a.name] ?? []).length
                                ? (tags[a.name] ?? []).map((tg) => <span key={tg} className="chip">{tagName(tg)}</span>)
                                : <span className="chip">{t('Every project')}</span>}
                              <span className="chip">{a.skills.length === 1 ? t('1 skill') : t('{n} skills', { n: a.skills.length })}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              {shownGlobal.length > 0 && (
                <section className="list-group">
                  <h2 className="list-group-head">{t('In your user folder')}</h2>
                  <ul className="list-cards">
                    {shownGlobal.map((a) => (
                      <li key={a.name}>
                        <button type="button" className="list-card library-item" onClick={() => choose({ kind: 'global', name: a.name })}>
                          <span className="list-card-title"><span className="dot dot-ok" />{a.name}</span>
                          {a.description && <span className="list-card-desc">{a.description}</span>}
                          <span className="chips"><span className="chip">~/.claude/agents</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {!shownAgents.length && !shownGlobal.length && <p className="list-empty">{t('No agent with these filters.')}</p>}
            </div>
          )
          : sel.kind !== 'library' && scopeAgent ? (
            <div className="library-detail">
              <header className="library-head">
                <div>
                  <div className="title-row"><BackArrow label={t('Agents')} onBack={back} /><h1>{scopeAgent.name}</h1></div>
                  {scopeAgent.description && <p className="muted">{scopeAgent.description}</p>}
                </div>
                <div className="row-actions">
                  {onCreate && <AddButton title={t('Create agent')} pressed={creating} onClick={onCreate} />}
                  {sel.kind === 'global' && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { api.openGlobal('agent', scopeAgent.name).catch((e: Error) => setError(e.message)); }} title={t('Open the agent file')}><IconFolder size={15} /> {t('Open')}</button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { void removeScope(); }}>{busy ? t('Removing…') : t('Remove')}</button>
                </div>
              </header>
              <p className="muted small">{sel.kind === 'project' ? t('Installed for this project.') : t('Installed for all projects.')}</p>
              {scopeAgent.contract && <AgentContractFields value={scopeAgent.contract} tools={tools} />}
            </div>
          ) : !detail ? <div className="welcome"><p className="muted">{t('No agents found.')}</p></div> : (
          <div className="library-detail agent-page">
            <header className="library-head">
              <div>
                <div className="title-row"><BackArrow label={t('Agents')} onBack={back} /><h1>{detail.name}</h1></div>
                <div className="agent-badges">
                  <span className="chip">{categories.find((c) => c.id === detail.category)?.label ?? detail.category}</span>
                  <span className="chip"><span className={`dot ${detail.usable ? 'dot-ok' : 'dot-muted'}`} /> {statusText(detail.status)}</span>
                  <span className="chip">{detail.source === 'builtin' ? t('Built-in (read-only)') : detail.basedOn ? t('Yours, based on {agent}', { agent: detail.basedOn }) : t('Yours')}</span>
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { void duplicate(); }} title={t('Copy to your library to customize it')}><IconCopy size={15} /> {t('Duplicate')}</button>
                {detail.source === 'custom' && !editing && <button type="button" className="btn btn-ghost btn-sm" disabled={profileDirty} onClick={() => setEditing(true)} title={t('Edit the whole file, frontmatter included')}><IconEdit size={15} /> {t('Edit file')}</button>}
                {detail.source === 'custom' && <button type="button" className="icon-btn" disabled={busy} onClick={() => { void remove(); }} title={t('Delete this agent')}><IconTrash size={17} /></button>}
                {onCreate && <AddButton title={t('Create agent')} pressed={creating} onClick={onCreate} />}
              </div>
            </header>
            {detail.source === 'builtin' && <p className="agent-note muted small">{t('Built-in agents are read-only. Duplicate it to write your own version; its tags can be chosen here.')}</p>}

            {editing ? (
              <section className="agent-card">
                <div className="agent-card-head"><h2>{t('Agent file')}</h2><span className="muted small">{detail.path}</span></div>
                <textarea className="editor library-editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label={t('Agent file')} />
                <div className="agent-savebar">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(detail.text); setEditing(false); }}>{t('Cancel')}</button>
                  <button type="button" className="btn btn-sm" disabled={busy || draft === detail.text} onClick={() => { void save(); }}>{busy ? t('Saving…') : t('Save')}</button>
                </div>
              </section>
            ) : (
              <div className="agent-layout">
                <div className="agent-main">
                  <section className="agent-card">
                    <div className="agent-card-head"><h2>{t('Description')}</h2></div>
                    <p className="muted small">{t('When to use this agent. It shows in the lists and helps the AI pick it.')}</p>
                    {profile
                      ? <textarea className="agent-description" rows={3} maxLength={1024} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} placeholder={t('e.g. Reviews user stories before development and lists the open questions.')} aria-label={t('Description')} />
                      : <p>{detail.description}</p>}
                  </section>

                  <section className="agent-card">
                    <div className="agent-card-head"><h2>{t('Instructions')}</h2></div>
                    {profile && <p className="muted small">{t('How the agent works, in Markdown. Keep the sections {sections}.', { sections: AGENT_SECTIONS.map((s) => `## ${s}`).join(', ') })}</p>}
                    {profile
                      ? (
                        <>
                          <textarea className="agent-notes" value={profile.body} onChange={(e) => setProfile({ ...profile, body: e.target.value })} spellCheck={false}
                            placeholder={t('Write here how the agent works: its role, when to use it, the steps it follows and what it must not do.')} aria-label={t('Instructions')} />
                          {missing.length > 0 && <p className="agent-missing small">{t('Missing sections: {sections}', { sections: missing.map((s) => `## ${s}`).join(', ') })}</p>}
                        </>
                      )
                      : <article className="markdown library-body" dangerouslySetInnerHTML={{ __html: detail.html }} />}
                  </section>

                  <AgentContractFields value={profile?.contract ?? shown!} onChange={profile ? (contract) => setProfile({ ...profile, contract }) : undefined} mcps={mcps} tools={tools} access={detail.access} />
                </div>

                <aside className="agent-side">
                  <section className="agent-card">
                    <div className="agent-card-head"><h2>{t('Skills')}</h2><span className="muted small">{(profile?.skills ?? detail.skills).length}</span></div>
                    <p className="muted small">{profile ? t('What the agent knows how to do. Search to add one.') : t('Duplicate it to choose other skills.')}</p>
                    <SkillsField value={profile?.skills ?? detail.skills} skills={skills} onChange={profile ? (next) => setProfile({ ...profile, skills: next }) : undefined} />
                  </section>

                  <section className="agent-card">
                    <div className="agent-card-head"><h2>{t('Projects')}</h2></div>
                    <TagField label="" value={tags[detail.name] ?? []} onChange={(next) => { void saveTags(next); }} catalog={catalog} onCatalog={reloadCatalog} />
                  </section>

                  <section className="agent-card">
                    <div className="agent-card-head"><h2>{t('Details')}</h2></div>
                    <dl className="facts agent-facts">
                      <div><dt>{t('Access')}</dt><dd>{accessLabel(detail.access)}</dd></div>
                      <div><dt>{t('Version')}</dt><dd>{detail.version}</dd></div>
                      <div><dt>{t('Status')}</dt><dd>{statusText(detail.status)}{detail.usable ? '' : ` — ${t('not available yet')}`}</dd></div>
                    </dl>
                    <p className="muted small library-path">{detail.path}</p>
                  </section>
                </aside>
              </div>
            )}

            {profileDirty && (
              <div className="agent-savebar sticky">
                <span className="muted small">{t('Unsaved changes')}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProfile(fromDetail(detail))}>{t('Cancel')}</button>
                <button type="button" className="btn btn-sm" disabled={busy || !profile?.description.trim()} onClick={() => { void saveProfile(); }}>{busy ? t('Saving…') : t('Save')}</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
