// Operations card of a project, in the right panel below the AI assistant, taking the room left: three tabs - the
// multi-agent operations linked to it (click to start one), its runs under way and the
// last five finished, each with its status. It opens on the runs under way when there are
// any, and goes back to them when a new run starts. The + links or unlinks operations
// made in Settings › Operations.

import { useEffect, useRef, useState } from 'react';
import { api, statusLabel, type Operation, type OperationRun } from '../api';
import { t } from '../i18n';
import { IconCheck, IconPlay, IconProgress } from './Icons';
import { AddButton } from './AddButton';
import { ListTabs } from './ListPage';

interface Props {
  project: string;
  tick: number; // bumped when files change, so statuses follow
  active: string | null; // the operation or run shown in the main area
  onStart: (operation: string) => void;
  onRun: (run: string) => void;
}

const ENDED = ['completed', 'cancelled'];
type Tab = 'start' | 'open' | 'ended';
const pill = (status: string) => (status === 'completed' ? 'pill-completed' : status === 'paused' || status === 'cancelled' ? '' : status === 'in-progress' ? 'pill-in-progress' : 'pill-awaiting-approval');

export function OperationsPanel({ project, tick, active, onStart, onRun }: Props) {
  const [linked, setLinked] = useState<Operation[]>([]);
  const [runs, setRuns] = useState<OperationRun[]>([]);
  const [all, setAll] = useState<Operation[] | null>(null); // the link menu, open
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Tab | null>(null); // null: the tab follows the runs

  useEffect(() => {
    api.projectOperations(project).then(setLinked).catch((e: Error) => setError(e.message));
    api.operationRuns(project).then(setRuns).catch(() => setRuns([]));
  }, [project, tick]);

  const toggle = (id: string) => {
    const ids = linked.some((o) => o.id === id) ? linked.filter((o) => o.id !== id).map((o) => o.id) : [...linked.map((o) => o.id), id];
    setChosen('start'); // linked or unlinked: show the list it changed
    api.setProjectOperations(project, ids).then(() => api.projectOperations(project)).then(setLinked).catch((e: Error) => setError(e.message));
  };
  const open = runs.filter((r) => !ENDED.includes(r.status));
  const ended = runs.filter((r) => ENDED.includes(r.status)).slice(0, 5);
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
    <section className="ops-side" aria-label={t('Operations')}>
      <div className="ops-side-head">
        <span>{t('Operations')}</span>
        <AddButton size="sm" variant="ghost" title={t('Link operations to this project')} onClick={() => { api.operations().then(setAll).catch((e: Error) => setError(e.message)); }} />
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
      <ListTabs<Tab> label={t('Operations')} value={tab} onChange={setChosen} tabs={[
        { id: 'start', label: t('Launch'), icon: <IconPlay size={14} /> },
        { id: 'open', label: t('Under way'), icon: <IconProgress size={14} />, count: open.length },
        { id: 'ended', label: t('Finished'), icon: <IconCheck size={14} />, count: ended.length },
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
      {tab === 'open' && (open.length ? <ul>{open.map(runRow)}</ul> : <p className="muted small ops-side-empty">{t('Nothing under way.')}</p>)}
      {tab === 'ended' && (ended.length ? <ul className="ops-side-ended">{ended.map(runRow)}</ul> : <p className="muted small ops-side-empty">{t('Nothing finished yet.')}</p>)}
      </div>
    </section>
  );
}
