// Agent library: built-in agents (read-only) and the user's own agents, by
// category. A built-in agent is customized by duplicating it; the copy lives in
// workspace/library/agents/ and can be edited or deleted. Agents created for a
// project or for every project are listed under those headings.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AgentContract, type AgentDetail, type AgentInfo, type Category, type ProjectSummary, type ToolInfo } from '../api';
import { AgentContractFields } from '../components/AgentContractFields';
import { t } from '../i18n';
import { IconCopy, IconEdit, IconEye, IconFolder, IconHome, IconTrash, IconX } from '../components/Icons';
import { AddButton } from '../components/AddButton';

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
  /** Chooses that project (Settings): shown as the heading of its agents. */
  projectPicker?: ReactNode;
  /** Bumped after an agent is created, so that list reloads. */
  installedTick?: number;
}

export const accessLabel = (access: string): string => ({
  'read-only': t('Reads only — writes nothing'),
  'project-write': t('Writes only in the project folder'),
  'repository-write': t('May change a linked repository, after an approved plan'),
} as Record<string, string>)[access] ?? access;

const statusText = (status: string): string => ({ stable: t('Stable'), draft: t('Draft'), 'pending-migration': t('Pending migration'), planned: t('Planned') } as Record<string, string>)[status] ?? status;

export function Library({ onBack, backLabel, embedded = false, onCreate, creating = false, onBrowse, create, project = null, projectPicker, installedTick = 0 }: Props) {
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
  // Inputs, outputs, MCP servers and AI of one of your agents, edited apart from its text.
  const [contract, setContract] = useState<AgentContract | null>(null);
  const [mcps, setMcps] = useState<string[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
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
      const name = (list.find((a) => a.usable) ?? list[0])?.name;
      return name ? { kind: 'library', name } : null;
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
    setContract(null);
    api.agent(libraryName).then((d) => { setDetail(d); setDraft(d.text); }).catch((e: Error) => setError(e.message));
  }, [libraryName]);

  const shown: AgentContract | null = detail ? { inputs: detail.inputs, outputs: detail.outputs, outcomes: detail.outcomes ?? [], mcps: detail.mcps, ai: detail.ai } : null;
  const contractDirty = contract !== null && JSON.stringify(contract) !== JSON.stringify(shown);
  const dirty = (editing && detail !== null && draft !== detail.text) || contractDirty;
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
    setDetail(fresh); setDraft(fresh.text); setEditing(false);
    await load(detail.name);
  });

  const saveContract = () => run(async () => {
    if (!detail || !contract) return;
    await api.saveAgentContract(detail.name, contract);
    const fresh = await api.agent(detail.name);
    setDetail(fresh); setDraft(fresh.text); setContract(null);
  });

  const remove = () => run(async () => {
    if (!detail || !window.confirm(t('Delete the agent "{name}"? This removes its file from your library.', { name: detail.name }))) return;
    await api.deleteAgent(detail.name);
    await load(agents.find((a) => a.name !== detail.name)?.name);
  });

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
    setSel(agents[0] ? { kind: 'library', name: agents[0].name } : null);
    loadInstalled();
  });

  return (
    <div className="library">
      <aside className="home-list">
        {!embedded && <button type="button" className="btn btn-ghost btn-sm library-back" onClick={leave}><IconHome size={15} /> {backLabel}</button>}
        <div className="home-list-head">{t('Agents')}</div>
        {categories.map((c) => {
          const group = agents.filter((a) => a.category === c.id);
          if (!group.length) return null;
          return (
            <section key={c.id} className="library-group">
              <div className="library-group-head" title={c.description}>{c.label}</div>
              <ul>
                {group.map((a) => (
                  <li key={a.name}>
                    <button type="button" className={`library-item${sel?.kind === 'library' && a.name === sel.name ? ' active' : ''}`} onClick={() => choose({ kind: 'library', name: a.name })}>
                      <span className={`dot ${a.usable ? 'dot-ok' : 'dot-muted'}`} title={statusText(a.status)} />
                      <span className="library-item-name">{a.name}</span>
                      {a.source === 'custom' && <span className="chip">{t('yours')}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {([
          ['project', project?.name ?? t('This project'), projectAgents],
          ['global', t('All projects'), globalAgents],
        ] as const).map(([kind, label, group]) => (group.length > 0 || (kind === 'project' && projectPicker)) && (
          <section key={kind} className="library-group">
            <div className="library-group-head">{kind === 'project' && projectPicker ? projectPicker : label}</div>
            {kind === 'project' && !group.length && <p className="muted small library-group-empty">{t('No agents installed only for this project.')}</p>}
            <ul>
              {group.map((a) => (
                <li key={a.name}>
                  <button type="button" className={`library-item${sel?.kind === kind && a.name === sel.name ? ' active' : ''}`} onClick={() => choose({ kind, name: a.name })}>
                    <span className="dot dot-ok" />
                    <span className="library-item-name">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>

      <main className="library-main">
        {error && <div className="error-bar">{error}<button type="button" className="icon-btn" onClick={() => setError('')}><IconX size={14} /></button></div>}
        {creating && create ? <div className="library-detail library-create">{create}</div>
          : sel && sel.kind !== 'library' && scopeAgent ? (
            <div className="library-detail">
              <header className="library-head">
                <div>
                  <h1>{scopeAgent.name}</h1>
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
          <div className="library-detail">
            <header className="library-head">
              <div>
                <h1>{detail.name}</h1>
                <p className="muted">{detail.description}</p>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { void duplicate(); }} title={t('Copy to your library to customize it')}><IconCopy size={15} /> {t('Duplicate')}</button>
                {onCreate && (
                  <AddButton title={t('Create agent')} pressed={creating} onClick={onCreate} />
                )}
                {detail.source === 'custom' && !editing && <button type="button" className="btn btn-ghost btn-sm" disabled={contractDirty} onClick={() => setEditing(true)}><IconEdit size={15} /> {t('Edit')}</button>}
                {detail.source === 'custom' && editing && <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(detail.text); setEditing(false); }}><IconEye size={15} /> {t('Cancel')}</button>
                  <button type="button" className="btn btn-sm" disabled={busy || !dirty} onClick={() => { void save(); }}>{busy ? t('Saving…') : t('Save')}</button>
                </>}
                {detail.source === 'custom' && <button type="button" className="icon-btn" disabled={busy} onClick={() => { void remove(); }} title={t('Delete this agent')}><IconTrash size={17} /></button>}
              </div>
            </header>

            <dl className="facts library-facts">
              <div><dt>{t('Category')}</dt><dd>{categories.find((c) => c.id === detail.category)?.label ?? detail.category}</dd></div>
              <div><dt>{t('Status')}</dt><dd>{statusText(detail.status)}{detail.usable ? '' : ` — ${t('not available yet')}`}</dd></div>
              <div><dt>{t('Access')}</dt><dd>{accessLabel(detail.access)}</dd></div>
              <div><dt>{t('Version')}</dt><dd>{detail.version}</dd></div>
              <div><dt>{t('Origin')}</dt><dd>{detail.source === 'builtin' ? t('Built-in (read-only)') : detail.basedOn ? t('Yours, based on {agent}', { agent: detail.basedOn }) : t('Yours')}</dd></div>
              <div><dt>{t('Skills')}</dt><dd className="chips">{detail.skills.map((s) => <span key={s} className="chip">{s}</span>)}</dd></div>
            </dl>

            {shown && (detail.source === 'custom' && !editing
              ? (
                <>
                  <AgentContractFields value={contract ?? shown} onChange={setContract} mcps={mcps} tools={tools} access={detail.access} />
                  {contractDirty && (
                    <div className="row-actions contract-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setContract(null)}>{t('Cancel')}</button>
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void saveContract(); }}>{busy ? t('Saving…') : t('Save')}</button>
                    </div>
                  )}
                </>
              )
              : !editing && <AgentContractFields value={shown} tools={tools} access={detail.access} />)}

            {editing
              ? <textarea className="editor library-editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
              : <article className="markdown library-body" dangerouslySetInnerHTML={{ __html: detail.html }} />}
            <p className="muted small library-path">{detail.path}</p>
          </div>
        )}
      </main>
    </div>
  );
}
