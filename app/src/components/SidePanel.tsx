// Right panel: details of the activity the open file belongs to, or what to DO in the
// project: start an activity in an AI, call an agent to talk an idea through (no activity),
// the runs that need you and, filling the rest, the project's operations (OperationsPanel). Everything else is in the tree (context/, files), the ribbon
// (linked folder), Set up project (the pencil) or Settings (agents per project, by their
// tags). It can be collapsed to a thin rail.

import { useEffect, useState, type ReactNode } from 'react';
import { api, describeRun, statusLabel, type ActivityInfo, type AgentInfo, type OpenRun, type ProjectSummary, type RunState, type TerminalRef, type ToolInfo, type ToolKind } from '../api';
import { conversationLanguage, t } from '../i18n';
import { preferredTool } from '../prefs';
import { IconChevron, IconCode, IconEdit, IconGraph, IconPanel, IconPlay, IconTerminal, IconUsers } from './Icons';
import { ActivityCatalog } from './ActivityCatalog';
import { ToolCatalog } from './ToolCatalog';
import { AgentCatalog } from './AgentCatalog';
import { CatIcon } from './CatIcon';
import { ACTIVITY_CAT } from '../icons/cats';

interface Props {
  project: ProjectSummary;
  runId: string | null;
  refreshKey: number;
  tools: ToolInfo[];
  onOpenPath: (path: string) => void;
  onLaunch: (preset?: { activity: string; run?: string; skipActivity?: boolean; tool?: string }) => void;
  onTerminal: (terminal: TerminalRef) => void; // a terminal tool opened in a tab of the app
  onOperation?: (operation: string) => void; // an activity of an operation opens its start form
  onSetup: () => void; // description and the global skills the project uses
  collapsed: boolean; // shown as a thin rail
  onToggle: () => void; // collapse / expand
  graphOn: boolean;
  onGraph: () => void;
  onMyAis: () => void; // Settings › My AIs
  operations?: ReactNode; // the Operations card (OperationsPanel), below everything, taking the room left
}

// Tools that open in one click with the project loaded. Web chat and "just show the
// request" need the full dialog (files to upload, text to copy).
const QUICK: ToolKind[] = ['terminal', 'editor'];
const KIND_ICON: Partial<Record<ToolKind, ReactNode>> = { terminal: <IconTerminal size={15} />, editor: <IconCode size={15} /> };
const toolName = (tool: ToolInfo) => t(tool.label).replace(/ \(.*\)$/, '');
const statusDot = (s: string): string => (s === 'completed' ? 'dot-ok' : s === 'cancelled' ? 'dot-muted' : s === 'blocked' ? 'dot-err' : 'dot-warn');
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const NEEDS_YOU = ['awaiting-approval', 'awaiting-input', 'blocked'];

export function SidePanel({ project, runId, refreshKey, tools, onOpenPath, onLaunch, onOperation, onTerminal, onSetup, collapsed, onToggle, graphOn, onGraph, onMyAis, operations }: Props) {
  const [run, setRun] = useState<RunState | null>(null);
  const [runs, setRuns] = useState<OpenRun[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]); // usable and on in this project, for "Call an agent"
  const [agentCatalog, setAgentCatalog] = useState(false);
  const [planPending, setPlanPending] = useState(false); // the AI left a plan.json to review
  const quick = tools.filter((x) => x.available && QUICK.includes(x.kind));
  // Starts on the default AI (Settings › My AIs); another choice here is for this panel only.
  const [toolId, setToolId] = useState('');
  const tool = quick.find((x) => x.id === toolId) ?? preferredTool(quick);
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState('');
  // What to do first (picked in the activity catalog, nothing chosen at first), then where.
  const [activities, setActivities] = useState<ActivityInfo[]>([]);
  const [activityId, setActivityId] = useState('');
  const choices = activities.filter((a) => a.id !== 'resume' && a.available);
  const [catalog, setCatalog] = useState(false);
  const [toolCatalog, setToolCatalog] = useState(false);
  const activity = choices.find((a) => a.id === activityId);

  useEffect(() => {
    if (runId) api.run(project.id, runId).then(setRun).catch(() => setRun(null));
    else setRun(null);
  }, [project.id, runId, refreshKey]);

  useEffect(() => { api.activities(project.id).then((r) => setActivities(r.activities)).catch(() => setActivities([])); }, [project.id]);

  useEffect(() => {
    api.openRuns(project.id).then(setRuns).catch(() => setRuns([]));
    Promise.all([api.agents(), api.projectAgents(project.id)])
      .then(([list, on]) => setAgents(list.filter((a) => a.usable && on.includes(a.name))))
      .catch(() => setAgents([]));
    api.readPlan(project.id).then((p) => setPlanPending(Boolean(p && !p.approved))).catch(() => setPlanPending(false));
  }, [project.id, refreshKey]);

  const pickTool = (id: string) => { setToolId(id); setLaunchMsg(''); };
  const pickActivity = (id: string) => { setActivityId(id); setLaunchMsg(''); };

  // Activities that need inbox files go through the dialog (already past "what to do");
  // the others start right away in the chosen tool.
  const start = () => {
    if (!activity) { setCatalog(true); return; }
    const id = activity.id;
    if (activity.target.kind === 'operation') { onOperation?.(activity.target.name); return; }
    if (activity.needsFiles) { onLaunch({ activity: id, skipActivity: true, tool: tool?.id }); return; }
    void quickOpen(id);
  };

  // One click: the chosen activity, no files, in the chosen tool. With an agent and "talk": a conversation with it.
  const quickOpen = async (id = 'open', agent?: string, note = '') => {
    if (!tool) return;
    setLaunching(true); setLaunchMsg('');
    try {
      const r = await api.launch({ project: project.id, activity: id, tool: tool.id, files: [], note, language: conversationLanguage(), ...(agent ? { agent } : {}) });
      if (r.terminal) { onTerminal(r.terminal); return; }
      if (!r.opened) setLaunchMsg(r.message || t('Could not open the tool.'));
      else setLaunchMsg(r.copied ? t('Request copied. Paste it in the AI chat of {tool}.', { tool: toolName(tool) }) : (r.message || ''));
    } catch (e) { setLaunchMsg(e instanceof Error ? e.message : String(e)); } finally { setLaunching(false); }
  };

  const prefix = `workspace/projects/${project.id}/`;
  const local = (p: string) => (p.startsWith(prefix) ? p.slice(prefix.length) : null);

  const needsYou = runs.filter((r) => NEEDS_YOU.includes(r.status));
  const collapseBtn = <button type="button" className="icon-btn pp-collapse" onClick={onToggle} title={t('Collapse the panel')} aria-label={t('Collapse the panel')} aria-expanded="true"><IconPanel size={16} /></button>;

  if (collapsed) {
    return (
      <aside className="panel panel-rail" aria-label={t('Project panel')}>
        <button type="button" className="icon-btn" onClick={onToggle} title={t('Expand the panel')} aria-label={t('Expand the panel')} aria-expanded="false"><IconPanel size={17} /></button>
        <button type="button" className="icon-btn accent" disabled={launching} onClick={() => { if (tool) start(); else onLaunch(); }}
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

  if (run) {
    const info = describeRun(run.id);
    const open = !['completed', 'cancelled'].includes(run.status);
    return (
      <aside className="panel">
        <div className="pp-label-row"><div className="panel-label">{t('Activity')}</div>{collapseBtn}</div>
        <h2 className="panel-title">{info.title}</h2>
        <p className="muted small">{info.date}{run.skill || run.workflow ? ` · ${run.skill ?? run.workflow}` : ''}</p>
        <span className={`pill pill-${run.status}`}>{statusLabel(run.status)}</span>
        {run.currentStep && <p className="small"><span className="muted">{t('Current step:')}</span> {run.currentStep}</p>}

        {open && (
          <button type="button" className="btn btn-block" onClick={() => onLaunch({ activity: 'resume', run: run.id })}>
            <IconPlay size={15} /> {t('Continue in your AI tool')}
          </button>
        )}

        {Boolean(run.completedSteps?.length) && (
          <section className="panel-section">
            <h3>{t('Done')}</h3>
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
                return <li key={a}>{rel ? <button type="button" className="link" onClick={() => onOpenPath(rel)}>{rel.split('/').pop()}</button> : <span className="muted">{a}</span>}</li>;
              })}
            </ul>
          </section>
        )}
        {operations}
      </aside>
    );
  }

  return (
    <aside className="panel pp">
      <header className="pp-head">
        <div className="pp-label-row"><div className="panel-label">{t('Project')}</div>{collapseBtn}</div>
        <div className="pp-title-row">
          <h2 className="panel-title">{project.name}</h2>
          <button type="button" className="icon-btn pp-edit" onClick={onSetup} title={t('Set up project')}><IconEdit size={15} /></button>
        </div>
        {project.description
          ? <p className="pp-desc small" title={project.description}>{project.description}</p>
          : <button type="button" className="link small" onClick={onSetup}>{t('Add a description')}</button>}
      </header>

      {planPending && <button type="button" className="pp-banner" onClick={onSetup}>{t('The AI proposed a plan — review it')}<IconChevron size={14} /></button>}

      <section className="pp-card" aria-labelledby="pp-ai">
        <h3 id="pp-ai" className="pp-card-title">{t('AI assistant')}</h3>
        {tool ? (
          <>
            <div className="pp-field">
              <span className="pp-field-label">{t('What to do')}</span>
              <button type="button" className={`pp-pick${activity ? '' : ' empty'}`} onClick={() => setCatalog(true)} aria-haspopup="dialog">
                {activity && <CatIcon id={ACTIVITY_CAT[activity.id] ?? 'run'} size={26} />}
                <span className="pp-pick-label">{activity ? t(activity.label) : t('Choose an activity')}</span>
                <IconChevron size={14} />
              </button>
              {activity?.hint && <span className="pp-hint">{capitalize(t(activity.hint))}</span>}
              {activity?.needsFiles && <span className="pp-hint">{t('Next, you pick the inbox files it should use.')}</span>}
            </div>
            <div className="pp-field">
              <span className="pp-field-label">{t('In')}</span>
              <button type="button" className="pp-pick" onClick={() => setToolCatalog(true)} aria-haspopup="dialog">
                <span className="pp-pick-kind" aria-hidden="true">{KIND_ICON[tool.kind]}</span>
                <span className="pp-pick-label">{toolName(tool)}</span>
                <IconChevron size={14} />
              </button>
              {tool.kind === 'editor' && <span className="pp-hint">{t('Opens your editor with its AI. The request is copied: paste it in the AI chat.')}</span>}
            </div>
            <button type="button" className="btn btn-block" disabled={launching || !activity} onClick={start}>
              <IconPlay size={15} /> {launching ? t('Starting…') : t('Start activity')}
            </button>
            <button type="button" className="btn btn-ghost btn-block pp-talk" disabled={launching} onClick={() => setAgentCatalog(true)} aria-haspopup="dialog"
              title={t('Talk an idea through with an agent, without an activity')}>
              <IconUsers size={15} /> {t('Call an agent')}
            </button>
            {launchMsg && <p className="pp-msg" role="status">{launchMsg}</p>}
          </>
        ) : (
          <>
            <p className="pp-hint">{t('No AI tool found on this computer.')} <button type="button" className="link" onClick={onMyAis}>{t('Install in Settings › My AIs')}</button></p>
            <button type="button" className="btn btn-block" onClick={() => onLaunch()}><IconPlay size={15} /> {t('Open in your AI tool')}</button>
          </>
        )}
      </section>
      {catalog && <ActivityCatalog activities={activities} selected={activity?.id ?? ''} onPick={pickActivity} onClose={() => setCatalog(false)} />}
      {agentCatalog && tool && <AgentCatalog agents={agents} tool={toolName(tool)} onPick={(agent, note) => { void quickOpen('talk', agent, note); }} onClose={() => setAgentCatalog(false)} />}
      {toolCatalog && <ToolCatalog tools={tools.filter((x) => QUICK.includes(x.kind))} selected={tool?.id ?? ''} onPick={pickTool} onClose={() => setToolCatalog(false)} onInstall={onMyAis} />}

      {needsYou.length > 0 && (
        <section className="panel-section pp-needs">
          <h3>{t('Needs you')}</h3>
          <ul className="pp-runs">
            {needsYou.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpenPath(`runs/${r.id}/state.json`)} title={r.currentStep || undefined}>
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
