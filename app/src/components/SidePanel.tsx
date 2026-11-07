// Right panel: what to DO in the project — one card with four starts, each stopping at its
// own depth: call an agent (an agent and an AI, nothing else), start an activity (the same
// two pickers plus what that activity needs) and start an operation (pick it; its steps,
// their agents and AIs and its inputs are in the operation's own start screen). Then the
// runs that need you and, filling the rest, the project's executions (OperationsPanel).
// An activity's own detail opens in the main area, like an operation run. An operation
// file still offers "Open operation" here. Everything else is in the tree (context/, files),
// the ribbon (linked folder), Set up project or Settings (agents per project, by their
// tags). It can be collapsed to a thin rail.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, describeRun, statusLabel, type ActivityInfo, type AgentInfo, type Operation, type OpenRun, type ProjectSummary, type RunState, type SkillInfo, type TerminalRef, type ToolInfo } from '../api';
import { conversationLanguage, t } from '../i18n';
import { preferredTool } from '../prefs';
import { IconAgent, IconCheck, IconChevron, IconEdit, IconGraph, IconLanes, IconList, IconPanel, IconPlay, IconSkill, IconUsers, IconX } from './Icons';
import { ActivityCatalog, ActivityPick } from './ActivityCatalog';
import { AiPick, QUICK_KINDS } from './ToolCatalog';
import { AgentPick } from './AgentCatalog';
import { SkillPick } from './SkillCatalog';
import { pluginList } from './SkillsDialog';
import { OperationPick } from './OperationCatalog';
import { ListTabs } from './ListPage';
import type { ActivityLaunchPhase } from '../activity-launches';

interface Props {
  project: ProjectSummary;
  runId: string | null;
  refreshKey: number;
  tools: ToolInfo[];
  onOpenPath: (path: string) => void;
  onLaunch: (preset?: { activity: string; run?: string; skipActivity?: boolean; tool?: string; agent?: string }) => void;
  onTerminal: (terminal: TerminalRef) => void; // a terminal tool opened in a tab of the app
  onActivityStart: (activity: string, label: string) => string | undefined;
  onActivityUpdate: (id: string | undefined, phase: ActivityLaunchPhase) => void;
  onOperation?: (operation: string) => void; // an activity of an operation opens its start form
  onOperationRun: (run: string) => void;
  onOpenRun: (run: string) => void; // a run from this panel opens in the main area
  onSetup: () => void; // description and the global skills the project uses
  onProjectChanged: () => void;
  collapsed: boolean; // shown as a thin rail
  onToggle: () => void; // collapse / expand
  graphOn: boolean;
  onGraph: () => void;
  onMyAis: () => void; // Settings › My AIs
  operations?: ReactNode; // the Operations card (OperationsPanel), below everything, taking the room left
}

type Start = 'agent' | 'activity' | 'operation' | 'skill'; // the starts of the card

const toolName = (tool: ToolInfo) => t(tool.label).replace(/ \(.*\)$/, '');
const statusDot = (s: string): string => (s === 'completed' ? 'dot-ok' : s === 'cancelled' ? 'dot-muted' : s === 'blocked' ? 'dot-err' : 'dot-warn');
const NEEDS_YOU = ['awaiting-approval', 'awaiting-input', 'blocked'];

export function SidePanel({ project, runId, refreshKey, tools, onOpenPath, onLaunch, onOperation, onOperationRun, onOpenRun, onTerminal, onActivityStart, onActivityUpdate, onSetup, onProjectChanged, collapsed, onToggle, graphOn, onGraph, onMyAis, operations }: Props) {
  const [run, setRun] = useState<RunState | null>(null);
  const [runs, setRuns] = useState<OpenRun[]>([]);
  const [agentCatalog, setAgentCatalog] = useState<AgentInfo[]>([]);
  const [agentsOn, setAgentsOn] = useState<string[]>([]); // the project's own choice (project.json)
  const agents = useMemo(() => agentCatalog.filter((a) => a.usable && agentsOn.includes(a.name)), [agentCatalog, agentsOn]); // usable and on in this project
  const [planPending, setPlanPending] = useState(false); // the AI left a plan.json to review
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [descriptionMode, setDescriptionMode] = useState<'closed' | 'view' | 'edit'>('closed');
  const [descriptionDraft, setDescriptionDraft] = useState(project.description);
  const [savingProject, setSavingProject] = useState(false);
  const [projectError, setProjectError] = useState('');
  const quick = tools.filter((x) => x.available && QUICK_KINDS.includes(x.kind));
  // Starts on the default AI (Settings › My AIs); another choice here is for this panel only.
  // It is the one AI of the card: calling an agent and starting an activity use the same pick.
  const [toolId, setToolId] = useState('');
  const tool = quick.find((x) => x.id === toolId) ?? preferredTool(quick);
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState('');
  const [start, setStart] = useState<Start>('activity');
  // Call an agent: the agent (required).
  const [talkAgent, setTalkAgent] = useState('');
  // Start an activity: what to do (nothing chosen at first), and an agent that is optional. null = the activity's own
  // agent, when it points to one; '' = none, the skill decides.
  const [activities, setActivities] = useState<ActivityInfo[]>([]);
  const [activityId, setActivityId] = useState('');
  const [activityAgent, setActivityAgent] = useState<string | null>(null);
  const choices = activities.filter((a) => a.id !== 'resume' && a.available);
  const [catalog, setCatalog] = useState(false); // the collapsed rail has no card: its play button picks the activity
  const activity = choices.find((a) => a.id === activityId);
  const ownAgent = activity?.target.kind === 'agent' && agents.some((a) => a.name === activity.target.name) ? activity.target.name : '';
  const agent = activityAgent ?? ownAgent;
  // Start an operation: every operation on this computer, the same catalog as activities and agents.
  const [operationList, setOperationList] = useState<Operation[]>([]);
  const [operationId, setOperationId] = useState('');
  const [skillList, setSkillList] = useState<SkillInfo[]>([]);
  const [skillId, setSkillId] = useState('');
  const [pluginOn, setPluginOn] = useState<string[]>(project.plugins);
  const [pluginBusy, setPluginBusy] = useState(false);
  useEffect(() => { setPluginOn(project.plugins); }, [project.id, project.plugins]);

  useEffect(() => {
    if (runId) api.run(project.id, runId).then(setRun).catch(() => setRun(null));
    else setRun(null);
  }, [project.id, runId, refreshKey]);

  useEffect(() => { api.activities(project.id).then((r) => setActivities(r.activities)).catch(() => setActivities([])); }, [project.id]);

  // The catalogs of this computer (agents, operations, skills) do not change with the project's files: once per project,
  // not at every change burst. Leaving Settings mounts this panel again, so a new agent or skill shows up then.
  useEffect(() => {
    api.agents().then(setAgentCatalog).catch(() => setAgentCatalog([]));
    api.operations().then(setOperationList).catch(() => setOperationList([]));
    api.skills().then((list) => setSkillList(list.filter((s) => s.status === 'draft' || s.status === 'stable'))).catch(() => setSkillList([]));
  }, [project.id]);
  useEffect(() => {
    api.openRuns(project.id).then(setRuns).catch(() => setRuns([]));
    api.projectAgents(project.id).then(setAgentsOn).catch(() => setAgentsOn([]));
    api.readPlan(project.id).then((p) => setPlanPending(Boolean(p && !p.approved))).catch(() => setPlanPending(false));
  }, [project.id, refreshKey]);
  useEffect(() => { if (operationId && !operationList.some((o) => o.id === operationId)) setOperationId(''); }, [operationList, operationId]);

  const pickTool = (id: string) => { setToolId(id); setLaunchMsg(''); };
  const pickActivity = (id: string) => { setActivityId(id); setActivityAgent(null); setLaunchMsg(''); };
  const saveProject = async (field: 'name' | 'description') => {
    setSavingProject(true); setProjectError('');
    try {
      if (field === 'name') await api.setProjectName(project.id, nameDraft);
      else await api.setProjectDescription(project.id, descriptionDraft);
      onProjectChanged();
      if (field === 'name') setEditingName(false); else setDescriptionMode('closed');
    } catch (e) { setProjectError(e instanceof Error ? e.message : String(e)); }
    finally { setSavingProject(false); }
  };

  // Call an agent stops here: the agent and the AI, in a conversation (no activity, files or notes).
  const callAgent = () => { if (talkAgent) void quickOpen('talk', talkAgent); };
  const callSkill = () => { if (skillId) void quickOpen('skill', undefined, '', skillId); };
  const togglePlugin = (name: string) => {
    const next = pluginOn.includes(name) ? pluginOn.filter((p) => p !== name) : [...pluginOn, name];
    setPluginOn(next);
    setPluginBusy(true);
    api.setProjectPlugins(project.id, next).then(() => onProjectChanged()).catch((e: Error) => { setPluginOn(project.plugins); setLaunchMsg(e.message); }).finally(() => setPluginBusy(false));
  };

  // Start an activity: the agent and the AI chosen here arrive filled. Activities that need inbox files go
  // through the dialog (already past "what to do"); the others start right away in the chosen tool.
  const startActivity = () => {
    if (!activity) { setCatalog(true); return; }
    const id = activity.id;
    if (activity.target.kind === 'operation') { onOperation?.(activity.target.name); return; }
    if (activity.needsFiles) { onLaunch({ activity: id, skipActivity: true, tool: tool?.id, ...(agent ? { agent } : {}) }); return; }
    void quickOpen(id, agent);
  };

  // Start an operation: its own start screen has the steps with their agents and AIs, and what the agents need.
  const startOperation = () => { if (operationId) onOperation?.(operationId); };

  // One click: the chosen activity, no files, in the chosen tool. With an agent and "talk": a conversation with it.
  const quickOpen = async (id = 'open', agent?: string, note = '', skill = '') => {
    if (!tool) return;
    const chosen = activities.find((a) => a.id === id);
    const trackingId = onActivityStart(id, skill || (chosen ? t(chosen.label) : id));
    setLaunching(true); setLaunchMsg('');
    try {
      const r = await api.launch({ project: project.id, activity: id, tool: tool.id, files: [], note, language: conversationLanguage(), ...(agent ? { agent } : {}), ...(skill ? { skill } : {}), ...(trackingId ? { trackingId } : {}) });
      onActivityUpdate(trackingId, r.copied ? 'prepared' : r.terminal || r.opened ? 'sent' : r.prompt && !r.message ? 'prepared' : 'failed');
      if (r.terminal) { onTerminal(r.terminal); return; }
      if (!r.opened) setLaunchMsg(r.message || t('Could not open the tool.'));
      else setLaunchMsg(r.copied ? t('Request copied. Paste it in the AI chat of {tool}.', { tool: toolName(tool) }) : (r.message || ''));
    } catch (e) { onActivityUpdate(trackingId, 'failed'); setLaunchMsg(e instanceof Error ? e.message : String(e)); } finally { setLaunching(false); }
  };

  const prefix = `workspace/projects/${project.id}/`;
  const local = (p: string) => (p.startsWith(prefix) ? p.slice(prefix.length) : null);

  const needsYou = runs.filter((r) => NEEDS_YOU.includes(r.status));
  const collapseBtn = <button type="button" className="icon-btn pp-collapse" onClick={onToggle} title={t('Collapse the panel')} aria-label={t('Collapse the panel')} aria-expanded="true"><IconPanel size={16} /></button>;

  if (collapsed) {
    return (
      <aside className="panel panel-rail" aria-label={t('Project panel')}>
        <button type="button" className="icon-btn" onClick={onToggle} title={t('Expand the panel')} aria-label={t('Expand the panel')} aria-expanded="false"><IconPanel size={17} /></button>
        <button type="button" className="icon-btn accent" disabled={launching} onClick={() => { if (tool) startActivity(); else onLaunch(); }}
          title={tool ? t('Open with {tool}', { tool: toolName(tool) }) : t('Open in your AI tool')}><IconPlay size={17} /></button>
        <button type="button" className={`icon-btn${graphOn ? ' on' : ''}`} onClick={onGraph} title={t('Graph view')} aria-label={t('Graph view')} aria-pressed={graphOn}><IconGraph size={17} /></button>
        {needsYou.length > 0 && (
          <button type="button" className="rail-badge" onClick={onToggle} title={t('{n} need you', { n: needsYou.length })}>{needsYou.length}</button>
        )}
        {launchMsg && <span className="rail-msg-dot" title={launchMsg} />}
        {catalog && <ActivityCatalog activities={activities} selected={activity?.id ?? ''} onPick={pickActivity} onClose={() => setCatalog(false)} />}
      </aside>
    );
  }

  if (run?.operation) {
    const info = describeRun(run.id);
    return (
      <aside className="panel run-detail" aria-label={t('Operation')}>
        <header className="run-detail-head">
          <div className="pp-label-row"><div className="panel-label">{t('Operation')}</div>{collapseBtn}</div>
          <h2 className="panel-title">{run.operation.name}</h2>
          <p className="muted small">{info.date}</p>
          <span className={`pill pill-${run.status}`}>{statusLabel(run.status)}</span>
        </header>
        {run.currentStep && <section className="run-detail-current"><span className="muted small">{t('Current step:')}</span><strong>{run.currentStep}</strong></section>}

        <button type="button" className="btn btn-block" onClick={() => onOperationRun(run.id)}><IconPlay size={15} /> {t('Open operation')}</button>

        {Boolean(run.completedSteps?.length) && (
          <section className="panel-section">
            <h3>{t('Completed steps')}</h3>
            <div className="chips">{run.completedSteps?.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          </section>
        )}
        {Boolean(run.pending?.length) && (
          <section className="panel-section">
            <h3>{t('Pending ({n})', { n: run.pending?.length ?? 0 })}</h3>
            <ul className="panel-list">{run.pending?.map((p) => <li key={p.id}><strong>{p.id}</strong> {p.description}</li>)}</ul>
          </section>
        )}
        {Boolean(run.approvals?.length) && (
          <section className="panel-section">
            <h3>{t('Approvals')}</h3>
            <ul className="panel-list">{run.approvals?.map((a, i) => <li key={`${a.step}-${i}`}><strong>{a.step}</strong> — {a.decision}{a.notes ? ` (${a.notes})` : ''}</li>)}</ul>
          </section>
        )}
        {Boolean(run.artifacts?.length) && (
          <section className="panel-section">
            <h3>{t('Files produced')}</h3>
            <ul className="panel-list links">
              {run.artifacts?.map((a) => {
                const rel = local(a);
                const parts = rel?.split('/') ?? [];
                return <li key={a}>{rel ? <button type="button" className="run-detail-file" title={rel} onClick={() => onOpenPath(rel)}><span>{parts.pop()}</span><small>{parts.join('/')}</small></button> : <span className="muted">{a}</span>}</li>;
              })}
            </ul>
          </section>
        )}
      </aside>
    );
  }

  return (
    <aside className="panel pp">
      <header className="pp-head">
        <div className="pp-label-row"><div className="panel-label">{t('Project')}</div>{collapseBtn}</div>
        <div className="pp-title-row">
          {editingName ? <form className="pp-name-form" onSubmit={(e) => { e.preventDefault(); void saveProject('name'); }}>
            <input aria-label={t('Project name')} autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setEditingName(false); setProjectError(''); } }} />
            <button type="submit" className="icon-btn" title={t('Save')} aria-label={t('Save')} disabled={savingProject || !nameDraft.trim()}><IconCheck size={15} /></button>
            <button type="button" className="icon-btn" title={t('Cancel')} aria-label={t('Cancel')} disabled={savingProject} onClick={() => { setEditingName(false); setProjectError(''); }}><IconX size={15} /></button>
          </form> : <>
            <h2 className="panel-title">{project.name}</h2>
            <button type="button" className="icon-btn pp-edit" onClick={() => { setNameDraft(project.name); setProjectError(''); setEditingName(true); }} title={t('Edit project name')} aria-label={t('Edit project name')}><IconEdit size={15} /></button>
          </>}
        </div>
        {project.description
          ? <><p className="pp-desc small">{project.description}</p><button type="button" className="link small pp-description-link" onClick={() => { setProjectError(''); setDescriptionMode('view'); }}>{t('See full description…')}</button></>
          : <button type="button" className="link small pp-description-link" onClick={() => { setDescriptionDraft(project.description); setProjectError(''); setDescriptionMode('edit'); }}>{t('Add a description')}</button>}
        {descriptionMode !== 'closed' && <div className="pp-description-card" role="region" aria-label={t('Description')}>
          <div className="pp-description-head"><strong>{t('Description')}</strong><button type="button" className="icon-btn" title={t('Close')} aria-label={t('Close')} disabled={savingProject} onClick={() => { setDescriptionMode('closed'); setProjectError(''); }}><IconX size={15} /></button></div>
          {descriptionMode === 'view' ? <><p className="pp-description-full">{project.description}</p><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDescriptionDraft(project.description); setDescriptionMode('edit'); }}>{t('Edit description')}</button></>
            : <form onSubmit={(e) => { e.preventDefault(); void saveProject('description'); }}>
              <textarea aria-label={t('Description')} autoFocus rows={4} maxLength={2000} value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} />
              <div className="form-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={savingProject} onClick={() => { setDescriptionMode('closed'); setProjectError(''); }}>{t('Cancel')}</button><button type="submit" className="btn btn-sm" disabled={savingProject}>{savingProject ? t('Saving…') : t('Save')}</button></div>
            </form>}
        </div>}
        {projectError && <p className="error small" role="alert">{projectError}</p>}
      </header>

      {planPending && <button type="button" className="pp-banner" onClick={onSetup}>{t('The AI proposed a plan — review it')}<IconChevron size={14} /></button>}

      {/* The tabs are the card's header: where you start something, no title above them. */}
      <section className="pp-card" aria-label={t('AI assistant')}>
        <ListTabs<Start> label={t('Start')} value={start} onChange={(next) => { setStart(next); setLaunchMsg(''); }} tabs={[
          { id: 'agent', label: t('Agent'), icon: <IconAgent size={16} /> },
          { id: 'activity', label: t('Activity'), icon: <IconList size={16} /> },
          { id: 'operation', label: t('Operation'), icon: <IconLanes size={16} /> },
          { id: 'skill', label: t('Skill'), icon: <IconSkill size={16} /> },
        ]} />
        {start === 'operation' ? (
          <>
            <OperationPick label={t('Operation')} operations={operationList} value={operationId} onChange={setOperationId} />
            {!operationList.length && <p className="pp-hint">{t('No operations yet. Create them in Settings › Operations.')}</p>}
            <button type="button" className="btn btn-block" disabled={!operationId} onClick={startOperation}>
              <IconPlay size={15} /> {t('Start operation')}
            </button>
          </>
        ) : tool ? (
          <>
            {start === 'agent' ? (
              <AgentPick label={t('Agent')} agents={agents} value={talkAgent} onChange={(name) => { setTalkAgent(name); setLaunchMsg(''); }}
                title={t('Who do you want to talk to?')} hint={t('A conversation with the agent in {tool}, about anything: no activity starts and nothing is written unless you ask.', { tool: toolName(tool) })} />
            ) : start === 'skill' ? (
              <SkillPick skills={skillList} value={skillId} onChange={(name) => { setSkillId(name); setLaunchMsg(''); }} />
            ) : (
              <>
                <ActivityPick label={t('What to do')} activities={choices} value={activity?.id ?? ''} onChange={pickActivity} />
                <AgentPick label={t('Agent')} agents={agents} value={agent} onChange={(name) => { setActivityAgent(name); setLaunchMsg(''); }} optional />
                {activity && !agent && ownAgent && <span className="pp-hint">{t('The activity still uses its own agent, {agent}.', { agent: ownAgent })}</span>}
              </>
            )}
            <AiPick label={t('In')} tools={tools} value={tool.id} onChange={pickTool} onInstall={onMyAis} />
            {start === 'agent' ? (
              <button type="button" className="btn btn-block" disabled={launching || !talkAgent} onClick={callAgent}
                title={t('Talk an idea through with an agent, without an activity')}>
                <IconUsers size={15} /> {launching ? t('Starting…') : t('Call an agent')}
              </button>
            ) : start === 'skill' ? (
              <button type="button" className="btn btn-block" disabled={launching || !skillId} onClick={callSkill}
                title={t('The request opens in {tool} and names this skill.', { tool: toolName(tool) })}>
                <IconPlay size={15} /> {launching ? t('Starting…') : t('Use a skill')}
              </button>
            ) : (
              <button type="button" className="btn btn-block" disabled={launching || !activity} onClick={startActivity}>
                <IconPlay size={15} /> {launching ? t('Starting…') : t('Start activity')}
              </button>
            )}
            {launchMsg && <p className="pp-msg" role="status">{launchMsg}</p>}
          </>
        ) : (
          <>
            <p className="pp-hint">{t('No AI tool found on this computer.')} <button type="button" className="link" onClick={onMyAis}>{t('Install in Settings › My AIs')}</button></p>
            <button type="button" className="btn btn-block" onClick={() => onLaunch()}><IconPlay size={15} /> {t('Open in your AI tool')}</button>
          </>
        )}
        {start === 'skill' && (
          <div className="pp-plugins">
            <span className="pp-field-label">{t('Plugins')}</span>
            {pluginList().filter((p) => p.optional).map((p) => (
              <label key={p.name} className="check-row" title={p.text}>
                <input type="checkbox" checked={pluginOn.includes(p.name)} disabled={pluginBusy} onChange={() => togglePlugin(p.name)} />
                <span>{p.name}</span>
              </label>
            ))}
            <p className="pp-hint">{t('When on, these load in every AI session opened from this project.')}</p>
          </div>
        )}
      </section>

      {needsYou.length > 0 && (
        <section className="panel-section pp-needs">
          <h3>{t('Needs you')}</h3>
          <ul className="pp-runs">
            {needsYou.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpenRun(r.id)} title={r.currentStep || undefined}>
                  <span className={`dot ${statusDot(r.status)}`} />
                  <span className="pp-run-title">{describeRun(r.id).title}</span>
                  <span className="pp-run-status">{statusLabel(r.status)}</span>
                </button>
                {r.status !== 'blocked' && (
                  <button type="button" className="pp-resume" onClick={() => onLaunch({ activity: 'resume', run: r.id })} title={t('Continue in your AI tool')}><IconPlay size={13} /></button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {operations}
    </aside>
  );
}
