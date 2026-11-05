// An activity run, in the main area of the project — the same place an operation
// run opens. The right panel stays on the project. The run folder is not rewritten.
import { useEffect, useState } from 'react';
import { api, describeRun, statusLabel, type RunState } from '../api';
import { t } from '../i18n';
import { IconFolder, IconPlay, IconX } from './Icons';

interface Props {
  project: string;
  run: string;
  onOpenFile: (path: string) => void;
  onResume: () => void;
  onClose: () => void;
}

function ProducedFile({ project, path, onOpen }: { project: string; path: string; onOpen: (path: string) => void }) {
  const prefix = `workspace/projects/${project}/`;
  const rel = path.startsWith(prefix) ? path.slice(prefix.length) : null;
  if (!rel) return <li><span className="muted">{path}</span></li>;
  const parts = rel.split('/');
  const name = parts.pop();
  return (
    <li>
      <button type="button" className="run-detail-file" title={rel} onClick={() => onOpen(rel)}>
        <span>{name}</span>
        <small>{parts.join('/')}</small>
      </button>
    </li>
  );
}

export function ActivityRunView({ project, run, onOpenFile, onResume, onClose }: Props) {
  const [state, setState] = useState<RunState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.run(project, run).then(setState).catch((e: Error) => setError(e.message)); }, [project, run]);

  if (!state) return <div className="ops-run" role="region" aria-label={t('Activity')}>{error ? <p className="error">{error}</p> : <p className="muted">…</p>}</div>;
  const info = describeRun(state.id || run);
  const open = !['completed', 'cancelled'].includes(state.status);

  return (
    <div className="ops-run" role="region" aria-label={t('Activity')}>
      <header className="ops-run-head">
        <div>
          <h1>{info.title}</h1>
          <p className="muted small">
            <span className={`pill pill-${state.status}`}>{statusLabel(state.status)}</span>
            {info.date && <> · {info.date}</>}
            {(state.skill || state.workflow) && <> · {state.skill ?? state.workflow}</>}
          </p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void api.openFolder(project, `runs/${state.id || run}`); }}><IconFolder size={15} /> {t('Open folder')}</button>
          {open && <button type="button" className="btn btn-ghost btn-sm" onClick={onResume}><IconPlay size={14} /> {t('Continue in your AI tool')}</button>}
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close')} aria-label={t('Close')}><IconX size={18} /></button>
        </div>
      </header>
      {error && <p className="error small">{error}</p>}

      {state.currentStep && <section className="run-detail-current"><span className="muted small">{t('Current step:')}</span><strong>{state.currentStep}</strong></section>}

      {Boolean(state.completedSteps?.length) && (
        <section className="panel-section">
          <h3>{t('Completed steps')}</h3>
          <div className="chips">{state.completedSteps?.map((s) => <span key={s} className="chip">{s}</span>)}</div>
        </section>
      )}
      {Boolean(state.pending?.length) && (
        <section className="panel-section">
          <h3>{t('Pending ({n})', { n: state.pending?.length ?? 0 })}</h3>
          <ul className="panel-list">{state.pending?.map((p) => <li key={p.id}><strong>{p.id}</strong> {p.description}</li>)}</ul>
        </section>
      )}
      {Boolean(state.approvals?.length) && (
        <section className="panel-section">
          <h3>{t('Approvals')}</h3>
          <ul className="panel-list">{state.approvals?.map((a, i) => <li key={`${a.step}-${i}`}><strong>{a.step}</strong> — {a.decision}{a.notes ? ` (${a.notes})` : ''}</li>)}</ul>
        </section>
      )}
      {Boolean(state.artifacts?.length) && (
        <section className="panel-section">
          <h3>{t('Files produced')}</h3>
          <ul className="panel-list links">
            {state.artifacts?.map((a) => <ProducedFile key={a} project={project} path={a} onOpen={onOpenFile} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
