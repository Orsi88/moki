// Operations card of a project, in the right panel below the AI assistant, taking the room left: three tabs - the
// multi-agent operations linked to it (click to start one), its runs under way and the
// finished runs, each with its status. It opens on the runs under way when there are
// any, and goes back to them when a new run starts. The + links or unlinks operations
// made in Settings › Operations.

import { useEffect, useRef, useState } from 'react';
import { api, describeRun, statusLabel, type ActivityRun, type Operation, type OperationRun } from '../api';
import { t } from '../i18n';
import { IconCheck, IconPlay, IconProgress, IconX } from './Icons';
import { AddButton } from './AddButton';
import { ListTabs } from './ListPage';
import { launchForRun, type ActivityLaunch, type ActivityLaunchPhase } from '../activity-launches';

interface Props {
  project: string;
  tick: number; // bumped when files change, so statuses follow
  active: string | null; // the operation or run shown in the main area
  onStart: (operation: string) => void;
  onRun: (run: string) => void;
  launches: ActivityLaunch[];
  activityLaunchTick: number;
  onDismissLaunch: (id: string) => void;
  onActivityRun: (id: string) => void;
  onResumeActivity: (id: string) => void;
}

const ENDED = ['completed', 'cancelled'];
type Tab = 'start' | 'open' | 'ended';
type Kind = 'activities' | 'operations';
const pill = (status: string) => (status === 'completed' ? 'pill-completed' : status === 'paused' || status === 'cancelled' ? '' : status === 'in-progress' ? 'pill-in-progress' : 'pill-awaiting-approval');
const launchStatus = (phase: ActivityLaunchPhase) => ({
  sending: t('Sending request'), sent: t('Waiting for run registration'), prepared: t('Request prepared; waiting for you'),
  failed: t('Could not send the request'), unconfirmed: t('Request result not confirmed'),
})[phase];

export function OperationsPanel({ project, tick, active, onStart, onRun, launches, activityLaunchTick, onDismissLaunch, onActivityRun, onResumeActivity }: Props) {
  const [linked, setLinked] = useState<Operation[]>([]);
  const [runs, setRuns] = useState<OperationRun[]>([]);
  const [activityRuns, setActivityRuns] = useState<ActivityRun[]>([]);
  const [kind, setKind] = useState<Kind>('operations');
  const [activityTab, setActivityTab] = useState<'open' | 'ended'>('open');
  const [all, setAll] = useState<Operation[] | null>(null); // the link menu, open
  const [error, setError] = useState('');
  const [operationRunsError, setOperationRunsError] = useState('');
  const [activityRunsError, setActivityRunsError] = useState('');
  const [chosen, setChosen] = useState<Tab | null>(null); // null: the tab follows the runs

  useEffect(() => {
    let live = true;
    api.projectOperations(project).then((items) => { if (live) setLinked(items); }).catch((e: Error) => { if (live) setError(e.message); });
    api.operationRuns(project).then((items) => { if (live) { setRuns(items); setOperationRunsError(''); } }).catch((e: Error) => { if (live) setOperationRunsError(e.message); });
    api.activityRuns(project).then((items) => { if (live) { setActivityRuns(items); setActivityRunsError(''); } }).catch((e: Error) => { if (live) setActivityRunsError(e.message); });
    return () => { live = false; };
  }, [project, tick]);
  useEffect(() => { if (activityLaunchTick > 0) { setKind('activities'); setActivityTab('open'); } }, [activityLaunchTick]);

  const toggle = (id: string) => {
    const ids = linked.some((o) => o.id === id) ? linked.filter((o) => o.id !== id).map((o) => o.id) : [...linked.map((o) => o.id), id];
    setChosen('start'); // linked or unlinked: show the list it changed
    api.setProjectOperations(project, ids).then(() => api.projectOperations(project)).then(setLinked).catch((e: Error) => setError(e.message));
  };
  const open = runs.filter((r) => !ENDED.includes(r.status));
  const ended = runs.filter((r) => ENDED.includes(r.status));
  const activityOpen = activityRuns.filter((r) => !ENDED.includes(r.status));
  const activityEnded = activityRuns.filter((r) => ENDED.includes(r.status));
  const waiting = launches.filter((launch) => !activityRuns.some((run) => launchForRun(run.id, [launch])));
  // A run that started since the last look takes the panel back to the runs under way.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(open.map((r) => r.id));
    if (seen.current && [...ids].some((id) => !seen.current?.has(id))) setChosen(null);
    seen.current = ids;
  }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setChosen(null); seen.current = null; }, [project]);
  const tab: Tab = chosen ?? (open.length ? 'open' : 'start');
  const current = (r: OperationRun) => r.steps.find((s) => s.id === r.visits?.find((v) => v.slot === r.currentStep)?.step);

  const runRow = (r: OperationRun) => (
    <li key={r.id}>
      <button type="button" className={`ops-side-row${active === r.id ? ' active' : ''}`} data-status={r.status} onClick={() => onRun(r.id)} title={r.id}>
        <span className="ops-side-name">{r.operation.name}</span>
        <span className="ops-side-meta">
          <span className={`pill ${pill(r.status)}`}>{statusLabel(r.status)}</span>
          {!ENDED.includes(r.status) && current(r) && <span className="muted small">{current(r)?.name}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <section className="ops-side" aria-label={t('Executions')}>
      <div className="ops-side-head">
        <span>{t('Executions')}</span>
        {kind === 'operations' && <AddButton size="sm" variant="ghost" title={t('Link operations to this project')} onClick={() => { api.operations().then(setAll).catch((e: Error) => setError(e.message)); }} />}
      </div>
      {all && (
        <div className="menu-backdrop" onMouseDown={() => setAll(null)}>
          <ul className="term-menu ops-link-menu" role="menu" aria-label={t('Link operations to this project')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setAll(null); }}>
            {!all.length && <li className="muted small ops-link-empty">{t('No operations yet. Create them in Settings › Operations.')}</li>}
            {all.map((o) => {
              const on = linked.some((x) => x.id === o.id);
              return (
                <li key={o.id}>
                  <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(o.id)}>
                    <span className="ops-link-check">{on && <IconCheck size={13} />}</span> {o.name} <span className="muted small">{t('{n} steps', { n: o.steps.length })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
      <ListTabs<Kind> label={t('Execution type')} value={kind} onChange={setKind} tabs={[
        { id: 'activities', label: t('Activities') }, { id: 'operations', label: t('Operations') },
      ]} />
      {kind === 'operations' ? <>
      {operationRunsError && <p className="error small ops-side-empty" role="alert">{t('Could not load executions: {error}', { error: operationRunsError })}</p>}
      <ListTabs<Tab> label={t('Operations')} value={tab} onChange={setChosen} tabs={[
        { id: 'start', label: t('Launch'), icon: <IconPlay size={14} /> },
        { id: 'open', label: t('Under way'), icon: <IconProgress size={14} />, count: operationRunsError ? undefined : open.length },
        { id: 'ended', label: t('Finished'), icon: <IconCheck size={14} />, count: operationRunsError ? undefined : ended.length },
      ]} />
      <div className="ops-side-body">
      {tab === 'start' && (!linked.length
        ? <p className="muted small ops-side-empty">{t('Link the operations this project uses with the +.')}</p>
        : (
          <ul>
            {linked.map((o) => (
              <li key={o.id}>
                <button type="button" className={`ops-side-row${active === o.id ? ' active' : ''}`} data-status="start" onClick={() => onStart(o.id)} title={o.description || t('Start {name}', { name: o.name })}>
                  <span className="ops-side-name"><IconPlay size={12} /> {o.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      {!operationRunsError && <>
        {tab === 'open' && (open.length ? <ul>{open.map(runRow)}</ul> : <p className="muted small ops-side-empty">{t('Nothing under way.')}</p>)}
        {tab === 'ended' && (ended.length ? <ul className="ops-side-ended">{ended.map(runRow)}</ul> : <p className="muted small ops-side-empty">{t('Nothing finished yet.')}</p>)}
      </>}
      </div>
      </> : <>
        <ListTabs<'open' | 'ended'> label={t('Activity executions')} value={activityTab} onChange={setActivityTab} tabs={[
          { id: 'open', label: t('Under way'), icon: <IconProgress size={14} />, count: activityRunsError ? undefined : activityOpen.length + waiting.length },
          { id: 'ended', label: t('Finished'), icon: <IconCheck size={14} />, count: activityRunsError ? undefined : activityEnded.length },
        ]} />
        <div className="ops-side-body">
          {activityRunsError && <p className="error small ops-side-empty" role="alert">{t('Could not load executions: {error}', { error: activityRunsError })}</p>}
          {activityTab === 'open' && waiting.map((item) => (
            <div key={item.id} className="activity-launch-row" data-phase={item.phase}>
              <div className="ops-side-row"><span className="ops-side-name">{item.label}</span><span className="muted small">{launchStatus(item.phase)}</span></div>
              <button type="button" className="icon-btn" title={t('Remove request from this list')} aria-label={t('Remove request from this list')} onClick={() => onDismissLaunch(item.id)}><IconX size={14} /></button>
            </div>
          ))}
          {!activityRunsError && (activityTab === 'open' ? activityOpen : activityEnded).map((run) => {
            const launch = launchForRun(run.id, launches);
            const title = launch?.label ?? describeRun(run.id).title;
            return <div key={run.id} className="activity-launch-row">
              <button type="button" className="ops-side-row" data-status={run.status} onClick={() => onActivityRun(run.id)} title={run.id}>
                <span className="ops-side-name">{title}</span><span className="ops-side-meta"><span className={`pill ${pill(run.status)}`}>{statusLabel(run.status)}</span>{run.currentStep && <span className="muted small">{run.currentStep}</span>}</span>
              </button>
              {activityTab === 'open' && run.status !== 'blocked' && <button type="button" className="icon-btn" onClick={() => onResumeActivity(run.id)} title={t('Continue in your AI tool')} aria-label={t('Continue in your AI tool')}><IconPlay size={14} /></button>}
            </div>;
          })}
          {!activityRunsError && activityTab === 'open' && !waiting.length && !activityOpen.length && <p className="muted small ops-side-empty">{t('Nothing under way.')}</p>}
          {!activityRunsError && activityTab === 'ended' && !activityEnded.length && <p className="muted small ops-side-empty">{t('Nothing finished yet.')}</p>}
        </div>
      </>}
    </section>
  );
}
