// "Set up the project": what it is for, in the QA's own words, which global
// skills it uses (linked by name, nothing copied), which agents it enables and
// which optional app plugins (caveman, superpowers) its sessions load.
// New skills come from the registry (Find skills, prefilled with the
// description). The AI tool can then adapt the context to the description
// ("Prepare the project"), or, for a blank project, interview the user and
// leave a plan.json ("Plan the project"): this dialog then opens with the
// plan's skills, agents and context files checked, for the user to approve.

import { useCallback, useEffect, useState } from 'react';
import { api, type AgentInfo, type Plan, type ProjectSummary } from '../api';
import { t } from '../i18n';
import { SkillsDialog, pluginList } from './SkillsDialog';
import { IconCheck, IconSearch, IconX } from './Icons';

interface Props {
  project: ProjectSummary;
  onClose: () => void;
  onSaved: (activity: string | null) => void; // activity to open in the AI tool next, if any
}

export function SetupDialog({ project, onClose, onSaved }: Props) {
  const [description, setDescription] = useState(project.description);
  const [global, setGlobal] = useState<string[]>([]);
  const [artcraft, setArtcraft] = useState<string[]>([]);
  const [linked, setLinked] = useState<string[]>(project.linkedSkills);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [agentsChanged, setAgentsChanged] = useState(false);
  const [plugins, setPlugins] = useState<string[]>(project.plugins);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [prepare, setPrepare] = useState(true);
  const [finding, setFinding] = useState<string | null>(null); // Find skills query while open
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadGlobal = useCallback(() => { api.installedSkills(project.id).then((s) => { setGlobal(s.global); setArtcraft(s.artcraft); }).catch(() => { /* keep */ }); }, [project.id]);
  useEffect(loadGlobal, [loadGlobal]);

  // A plan waiting for approval preselects what the AI recommended.
  useEffect(() => {
    api.agents().then((list) => setAgents(list.filter((a) => a.usable))).catch(() => setAgents([]));
    Promise.all([api.readPlan(project.id).catch(() => null), api.projectAgents(project.id).catch(() => [])]).then(([p, current]) => {
      setPlan(p);
      if (p && !p.approved) {
        setLinked((s) => [...new Set([...s, ...p.skills])]);
        setEnabled(p.agents);
        setFiles(p.contextFiles.map((f) => f.path));
      } else setEnabled(current);
    });
  }, [project.id]);

  // While Find skills is open on top, Escape belongs to it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && finding === null) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finding, onClose]);

  const flip = (list: string[], name: string) => (list.includes(name) ? list.filter((x) => x !== name) : [...list, name]);
  const pending = Boolean(plan && !plan.approved);
  const suggested = (list: string[] | undefined, name: string) => pending && list?.includes(name) ? <span className="chip">{t('suggested by the AI')}</span> : null;

  // What the AI does next: create the approved files, interview for a blank project, or adapt the QA context.
  const next = pending
    ? { activity: 'plan', label: t('Then ask the AI to create the approved context files'), ready: true }
    : project.starter === 'blank' && !plan
      ? { activity: 'plan', label: t('Then the AI asks me what the project needs and proposes a plan to review here'), ready: true }
      : { activity: 'setup', label: t('Then ask the AI to adapt the project context to this description (it proposes, you approve)'), ready: Boolean(description.trim()) };

  const save = async () => {
    setBusy(true); setError('');
    try {
      // Links to skills that are no longer installed are dropped. Agents are only written when chosen here,
      // so a project without a list keeps getting every agent.
      await api.setupProject(project.id, {
        description, linkedSkills: linked.filter((n) => global.includes(n) || artcraft.includes(n)),
        ...(pending || agentsChanged ? { agents: enabled } : {}),
        ...(pending ? { contextFiles: files } : {}),
      });
      await api.setProjectPlugins(project.id, plugins);
      onSaved(prepare && next.ready ? next.activity : null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (<>
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <header className="modal-head">
          <div>
            <h2 id="setup-title">{pending ? t('Review the plan for {name}', { name: project.name }) : t('Set up {name}', { name: project.name })}</h2>
            <p className="muted small">{pending
              ? t('The AI recommended what is checked below (the full plan is in proposed-updates.md). Keep what you want; nothing is created before you save.')
              : t('Say what this project is for and choose the skills and agents it uses. You can change this later.')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="label">{t('What do you want to do? (optional)')}</span>
            <textarea rows={3} maxLength={2000} autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('e.g. "I want to start a project with React"')} />
          </label>

          <div className="field">
            <span className="label">{t('Skills for all projects to use here')}</span>
            <span className="muted small">{t('Linked by name: requests from this project tell the AI to use them. Nothing is copied.')}</span>
            {global.length === 0 ? <p className="muted small">{t('No skills installed for all projects yet.')}</p> : (
              <ul className="pick-list" role="listbox" aria-multiselectable="true" aria-label={t('Skills for all projects to use here')}>
                {global.map((n) => (
                  <li key={n}>
                    <button type="button" role="option" aria-selected={linked.includes(n)} className={`library-item${linked.includes(n) ? ' active' : ''}`} onClick={() => setLinked((s) => flip(s, n))}>
                      <span className="library-item-name">{n}</span>
                      {suggested(plan?.skills, n)}
                      {linked.includes(n) && <IconCheck size={15} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="row-actions">
              {pending && plan?.searchSkills.map((q) => (
                <button key={q} type="button" className="btn btn-ghost btn-sm" onClick={() => setFinding(q)} title={t('Suggested by the AI: not installed yet')}><IconSearch size={15} /> {t('Find “{q}”', { q })}</button>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFinding(description)}><IconSearch size={15} /> {t('Find new skills')}</button>
            </div>
          </div>

          {artcraft.length > 0 && (
            <div className="field">
              <span className="label">{t('ArtCraft skills')}</span>
              <span className="muted small">{t('Moki references for the Craft App Suite. Linked by name, like the skills above.')}</span>
              <ul className="pick-list" role="listbox" aria-multiselectable="true" aria-label={t('ArtCraft skills')}>
                {artcraft.map((n) => (
                  <li key={n}>
                    <button type="button" role="option" aria-selected={linked.includes(n)} className={`library-item${linked.includes(n) ? ' active' : ''}`} onClick={() => setLinked((s) => flip(s, n))}>
                      <span className="library-item-name">{n}</span>
                      {suggested(plan?.skills, n)}
                      {linked.includes(n) && <IconCheck size={15} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="field">
            <span className="label">{t('Agents in this project')}</span>
            <ul className="agent-toggles">
              {agents.map((a) => (
                <li key={a.name}>
                  <label title={a.description}>
                    <input type="checkbox" checked={enabled.includes(a.name)} onChange={() => { setEnabled((s) => flip(s, a.name)); setAgentsChanged(true); }} />
                    <span>{a.name}</span>
                    {a.source === 'custom' && <span className="chip">{t('yours')}</span>}
                    {suggested(plan?.agents, a.name)}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="field">
            <span className="label">{t('Plugins in this project')}</span>
            <span className="muted small">{t('ponytail and rtk are always on. These load only in the sessions opened from this project.')}</span>
            <ul className="file-pick">
              {pluginList().filter((p) => p.optional).map((p) => (
                <li key={p.name}>
                  <label className={plugins.includes(p.name) ? 'on' : ''}>
                    <input type="checkbox" checked={plugins.includes(p.name)} onChange={() => setPlugins((s) => flip(s, p.name))} />
                    <span className="file-name">{p.name}</span>
                    <span className="muted small">{p.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {pending && Boolean(plan?.contextFiles.length) && (
            <div className="field">
              <span className="label">{t('Context files the AI will create')}</span>
              <ul className="file-pick">
                {plan?.contextFiles.map((f) => (
                  <li key={f.path}>
                    <label className={files.includes(f.path) ? 'on' : ''}>
                      <input type="checkbox" checked={files.includes(f.path)} onChange={() => setFiles((s) => flip(s, f.path))} />
                      <span className="file-name">{f.path}</span>
                      {f.contains && <span className="muted small">{f.contains}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="field inline">
            <input type="checkbox" checked={prepare && next.ready} disabled={!next.ready} onChange={(e) => setPrepare(e.target.checked)} />
            <span>{next.label}</span>
          </label>
          {error && <p className="error small">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{pending ? t('Later') : t('Skip')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => { void save(); }}>{busy ? t('Saving…') : pending ? t('Approve plan') : t('Save')}</button>
        </footer>
      </div>
    </div>
    {finding !== null && <SkillsDialog project={project} initialQuery={finding} onClose={() => { setFinding(null); loadGlobal(); }} />}
  </>);
}
