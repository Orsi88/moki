// Executions card of a project, in the right panel below the AI assistant, taking the room left. Its
// Activities | Operations tabs are its header (no title). Each side has two buttons - the runs
// under way and the finished runs - the same shape on both. An operation is chosen on the
// assistant card, from every operation on this computer, not from a list kept on this card.

import { useEffect, useRef, useState } from 'react';
import { api, describeRun, statusLabel, type ActivityRun, type OperationRun } from '../api';
import { t } from '../i18n';
import { IconCheck, IconPlay, IconProgress, IconX } from './Icons';
import { ListTabs } from './ListPage';
import { launchForRun, type ActivityLaunch, type ActivityLaunchPhase } from '../activity-launches';

interface Props {
  project: string;
  tick: number; // bumped when files change, so statuses follow
  active: string | null; // the run shown in the main area
  onRun: (run: string) => void;
  launches: ActivityLaunch[];
  activityLaunchTick: number;
  onDismissLaunch: (id: string) => void;
  onActivityRun: (id: string) => void;
  onResumeActivity: (id: string) => void;
}

const ENDED = ['completed', 'cancelled'];
type Phase = 'open' | 'ended';
type Kind = 'activities' | 'operations';
const pill = (status: string) => (status === 'completed' ? 'pill-completed' : status === 'paused' || status === 'cancelled' ? '' : status === 'in-progress' ? 'pill-in-progress' : 'pill-awaiting-approval');
const launchStatus = (phase: ActivityLaunchPhase) => ({
  sending: t('Sending request'), sent: t('Waiting for run registration'), prepared: t('Request prepared; waiting for you'),
  failed: t('Could not send the request'), unconfirmed: t('Request result not confirmed'),
})[phase];

export function OperationsPanel({ project, tick, active, onRun, launches, activityLaunchTick, onDismissLaunch, onActivityRun, onResumeActivity }: Props) {
  const [runs, setRuns] = useState<OperationRun[]>([]);
  const [activityRuns, setActivityRuns] = useState<ActivityRun[]>([]);
  const [kind, setKind] = useState<Kind>('operations');
  const [activityTab, setActivityTab] = useState<Phase>('open');
  const [operationRunsError, setOperationRunsError] = useState('');
  const [activityRunsError, setActivityRunsError] = useState('');
  const [chosen, setChosen] = useState<Phase | null>(null); // null: the tab follows the runs

  useEffect(() => {
    let live = true;
    api.operationRuns(project).then((items) => { if (live) { setRuns(items); setOperationRunsError(''); } }).catch((e: Error) => { if (live) setOperationRunsError(e.message); });
    api.activityRuns(project).then((items) => { if (live) { setActivityRuns(items); setActivityRunsError(''); } }).catch((e: Error) => { if (live) setActivityRunsError(e.message); });
    return () => { live = false; };
  }, [project, tick]);
  useEffect(() => { if (activityLaunchTick > 0) { setKind('activities'); setActivityTab('open'); } }, [activityLaunchTick]);

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
  const tab: Phase = chosen ?? 'open';
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
    // The Activities | Operations tabs are the card's header: they already name the list, so there is no title above them.
    <section className="ops-side" aria-label={t('Executions')}>
      <ListTabs<Kind> label={t('Execution type')} value={kind} onChange={setKind} tabs={[
        { id: 'activities', label: t('Activities') }, { id: 'operations', label: t('Operations') },
      ]} />
      {kind === 'operations' ? <>
      {operationRunsError && <p className="error small ops-side-empty" role="alert">{t('Could not load executions: {error}', { error: operationRunsError })}</p>}
      <div className="ops-phases">
        <ListTabs<Phase> label={t('Operations')} value={tab} onChange={setChosen} tabs={[
          { id: 'open', label: t('Under way'), icon: <IconProgress size={14} />, count: operationRunsError ? undefined : open.length },
          { id: 'ended', label: t('Finished'), icon: <IconCheck size={14} />, count: operationRunsError ? undefined : ended.length },
        ]} />
      </div>
      <div className="ops-side-body">
      {!operationRunsError && <>
        {tab === 'open' && (open.length ? <ul>{open.map(runRow)}</ul> : <p className="muted small ops-side-empty">{t('Nothing under way.')}</p>)}
        {tab === 'ended' && (ended.length ? <ul className="ops-side-ended">{ended.map(runRow)}</ul> : <p className="muted small ops-side-empty">{t('Nothing finished yet.')}</p>)}
      </>}
      </div>
      </> : <>
        <div className="ops-phases">
          <ListTabs<'open' | 'ended'> label={t('Activity executions')} value={activityTab} onChange={setActivityTab} tabs={[
            { id: 'open', label: t('Under way'), icon: <IconProgress size={14} />, count: activityRunsError ? undefined : activityOpen.length + waiting.length },
            { id: 'ended', label: t('Finished'), icon: <IconCheck size={14} />, count: activityRunsError ? undefined : activityEnded.length },
          ]} />
        </div>
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
              <button type="button" className={`ops-side-row${active === run.id ? ' active' : ''}`} data-status={run.status} onClick={() => onActivityRun(run.id)} title={run.id}>
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
