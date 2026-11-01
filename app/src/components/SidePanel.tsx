// Right panel: details of the activity the open file belongs to, or an overview
// of the project. It complements the file tree on the left and never repeats it:
// the tree shows WHAT is there (files, counts, every activity); this panel shows what
// to DO and what the tree cannot show (the AI tool, context state, what needs you,
// the linked folder, agents). It can be collapsed to a thin rail.

import { useEffect, useState, type ReactNode } from 'react';
import { api, describeRun, statusLabel, type ActivityInfo, type AgentInfo, type OpenRun, type ProjectSummary, type RunState, type TerminalRef, type ToolInfo, type ToolKind } from '../api';
import { conversationLanguage, t } from '../i18n';
import { recall, remember } from '../prefs';
import { IconChevron, IconCode, IconEdit, IconFolder, IconGraph, IconPanel, IconPlay, IconTerminal } from './Icons';
import { SectionIcon, type SectionIconName } from '../icons';
import { ActivityCatalog } from './ActivityCatalog';
import { ToolCatalog } from './ToolCatalog';
import { CatIcon } from './CatIcon';
import { ACTIVITY_CAT } from '../icons/cats';

interface Props {
  project: ProjectSummary;
  runId: string | null;
  refreshKey: number;
  tools: ToolInfo[];
  onOpenPath: (path: string) => void;
  onLaunch: (preset?: { activity: string; run?: string; skipActivity?: boolean }) => void;
  onTerminal: (terminal: TerminalRef) => void; // a terminal tool opened in a tab of the app
  onOperation?: (operation: string) => void; // an activity of an operation opens its start form
  onMyFolder: () => void; // opens the linked folder, or links one first
  onSetup: () => void; // description and the global skills the project uses
  collapsed: boolean; // shown as a thin rail
  onToggle: () => void; // collapse / expand
  graphOn: boolean;
  onGraph: () => void;
}

// Tools that open in one click with the project loaded. Web chat and "just show the
// request" need the full dialog (files to upload, text to copy).
const QUICK: ToolKind[] = ['terminal', 'editor'];
const KIND_ICON: Partial<Record<ToolKind, ReactNode>> = { terminal: <IconTerminal size={15} />, editor: <IconCode size={15} /> };
const toolName = (tool: ToolInfo) => t(tool.label).replace(/ \(.*\)$/, '');
const statusDot = (s: string): string => (s === 'completed' ? 'dot-ok' : s === 'cancelled' ? 'dot-muted' : s === 'blocked' ? 'dot-err' : 'dot-warn');
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const NEEDS_YOU = ['awaiting-approval', 'awaiting-input', 'blocked'];
const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

const onboarding = (status: string): string => ({ 'not-started': t('Not started'), partial: t('In progress'), complete: t('Complete') } as Record<string, string>)[status] ?? status;

export function SidePanel({ project, runId, refreshKey, tools, onOpenPath, onLaunch, onOperation, onTerminal, onMyFolder, onSetup, collapsed, onToggle, graphOn, onGraph }: Props) {
  const [run, setRun] = useState<RunState | null>(null);
  const [runs, setRuns] = useState<OpenRun[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [agentError, setAgentError] = useState('');
  const [planPending, setPlanPending] = useState(false); // the AI left a plan.json to review
  const quick = tools.filter((x) => x.available && QUICK.includes(x.kind));
  const [toolId, setToolId] = useState(() => recall('qa-tool') ?? '');
  const tool = quick.find((x) => x.id === toolId) ?? quick[0];
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
    api.agents().then((list) => setAgents(list.filter((a) => a.usable))).catch(() => setAgents([]));
    api.projectAgents(project.id).then(setEnabled).catch(() => setEnabled([]));
    api.readPlan(project.id).then((p) => setPlanPending(Boolean(p && !p.approved))).catch(() => setPlanPending(false));
  }, [project.id, refreshKey]);

  const toggleAgent = (name: string) => {
    const next = enabled.includes(name) ? enabled.filter((n) => n !== name) : [...enabled, name];
    setAgentError('');
    api.setProjectAgents(project.id, next).then(setEnabled).catch((e: Error) => setAgentError(e.message));
  };

  const pickTool = (id: string) => { setToolId(id); setLaunchMsg(''); remember('qa-tool', id); };
  const pickActivity = (id: string) => { setActivityId(id); setLaunchMsg(''); };

  // Activities that need inbox files go through the dialog (already past "what to do");
  // the others start right away in the chosen tool.
  const start = () => {
    if (!activity) { setCatalog(true); return; }
    const id = activity.id;
    if (activity.target.kind === 'operation') { onOperation?.(activity.target.name); return; }
    if (activity.needsFiles) { if (tool) remember('qa-tool', tool.id); onLaunch({ activity: id, skipActivity: true }); return; }
    void quickOpen(id);
  };

  // One click: the chosen activity, no files, in the chosen tool.
  const quickOpen = async (id = 'open') => {
    if (!tool) return;
    setLaunching(true); setLaunchMsg('');
    remember('qa-tool', tool.id);
    try {
      const r = await api.launch({ project: project.id, activity: id, tool: tool.id, files: [], note: '', language: conversationLanguage() });
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
      </aside>
    );
  }

  // Only what the tree cannot show: inbox and activity counts live on the tree's folders.
  const stats: { icon: SectionIconName; label: string; value: string }[] = [
    { icon: 'context', label: t('Context'), value: onboarding(project.onboardingStatus) },
  ];
  const activeAgents = agents.filter((a) => enabled.includes(a.name)).length;

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
            {launchMsg && <p className="pp-msg" role="status">{launchMsg}</p>}
          </>
        ) : (
          <>
            <p className="pp-hint">{t('No AI tool found on this computer.')}</p>
            <button type="button" className="btn btn-block" onClick={() => onLaunch()}><IconPlay size={15} /> {t('Open in your AI tool')}</button>
          </>
        )}
      </section>
      {catalog && <ActivityCatalog activities={activities} selected={activity?.id ?? ''} onPick={pickActivity} onClose={() => setCatalog(false)} />}
      {toolCatalog && <ToolCatalog tools={tools.filter((x) => QUICK.includes(x.kind))} selected={tool?.id ?? ''} onPick={pickTool} onClose={() => setToolCatalog(false)} />}

      <ul className="pp-stats">
        {stats.map((s) => (
          <li key={s.icon}>
            <SectionIcon name={s.icon} size={18} />
            <span className="pp-stat-label">{s.label}</span>
            <span className="pp-stat-value">{s.value}</span>
          </li>
        ))}
        <li>
          <span className="pp-stat-glyph" aria-hidden="true">Aa</span>
          <span className="pp-stat-label">{t('Deliverables')}</span>
          <span className="pp-stat-value">{t(project.deliverableLanguage)}</span>
        </li>
      </ul>

      <section className="panel-section">
        <h3>{t('My folder')}</h3>
        {project.repository
          ? <button type="button" className="pp-folder" onClick={onMyFolder} title={project.repository}><IconFolder size={15} /><span className="pp-folder-name">{folderName(project.repository)}</span><span className="pp-folder-path">{project.repository}</span></button>
          : <button type="button" className="btn btn-ghost btn-sm" onClick={onMyFolder} title={t('Link a folder of this computer to the project')}><IconFolder size={15} /> {t('Choose my folder')}</button>}
      </section>

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

      {agents.length > 0 && (
        <details className="pp-agents panel-section">
          <summary><span>{t('Agents in this project')}</span><span className="pp-count">{t('{n} of {total}', { n: activeAgents, total: agents.length })}</span></summary>
          <ul className="agent-toggles">
            {agents.map((a) => (
              <li key={a.name}>
                <label title={a.description}>
                  <input type="checkbox" checked={enabled.includes(a.name)} onChange={() => toggleAgent(a.name)} />
                  <span>{a.name}</span>
                  {a.source === 'custom' && <span className="chip">{t('yours')}</span>}
                </label>
              </li>
            ))}
          </ul>
          {agentError && <p className="error small">{agentError}</p>}
        </details>
      )}

      <button type="button" className="pp-setup" onClick={onSetup} title={t('Description and the global skills this project uses')}>
        <span>{t('Set up project')}</span>
        {project.linkedSkills.length > 0 && <span className="pp-count">{project.linkedSkills.length === 1 ? t('1 linked skill') : t('{n} linked skills', { n: project.linkedSkills.length })}</span>}
        <IconChevron size={14} />
      </button>
    </aside>
  );
}
