// An operation run, in the main area of the project. By default, the board of the
// operation with each step's state (OperationRunBoard) and, beside it, the selected
// step: each time it ran (a loop shows it again), the arrow it came by, its AI, how
// long it took, its result, summary and files, the question it waits on, why it
// failed. The question an agent waits on is answered here: typed into its terminal
// when it is open, or the step reopens in a new terminal with the answer (its own is
// gone: closed, or Moki restarted). A list of the visits is the other view (and the only one for runs started
// before the board was kept). Approve the step waiting for you or reject it (the
// step before runs again with your reasons, or the operation ends), try a failed
// step again, pick the way on when no arrow fits a result or a loop reached its
// limit, start a step that did not open, pause (the running step ends, nothing new
// starts), resume or cancel (its terminal closes). A step's summary and files show here
// (RunVisitFiles), so following a run never needs another window. The side panel keeps the
// status while this is closed.

import { useEffect, useState } from 'react';
import { api, statusLabel, type OperationRun, type OperationVisit, type ToolInfo } from '../api';
import { conversationLanguage, t } from '../i18n';
import { recall, remember } from '../prefs';
import { IconPause, IconPlay, IconStop, IconTerminal, IconX } from './Icons';
import { hasBoard, OperationRunBoard, visitText } from './OperationRunBoard';
import { RunVisitFiles } from './RunVisitFiles';

interface Props {
  project: string;
  run: string;
  tick: number;
  tools: ToolInfo[];
  hasTerminal: (id: string) => boolean;
  onTerminal: (terminal: { id: string; title: string }) => void;
  onOpenFile: (path: string) => void;
  onClose: () => void;
  onChanged: () => void; // something changed here: the side panel and the next steps follow
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
// How long a visit took (or has been running).
const took = (from?: string, to?: string) => {
  if (!from) return '';
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000));
  return s < 60 ? t('{n} s', { n: s }) : s < 3600 ? t('{n} min', { n: Math.round(s / 60) }) : t('{h} h {m} min', { h: Math.floor(s / 3600), m: Math.round((s % 3600) / 60) });
};

export function OperationRunView({ project, run, tick, tools, hasTerminal, onTerminal, onOpenFile, onClose, onChanged }: Props) {
  const [state, setState] = useState<OperationRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState<'board' | 'list'>(() => (recall('qa-ops-run-view') === 'list' ? 'list' : 'board'));
  const [picked, setPicked] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');
  const [reply, setReply] = useState('');
  const [retryAi, setRetryAi] = useState(''); // another AI tool for a failed step ('' = its own)

  useEffect(() => { api.operationRun(project, run).then(setState).catch((e: Error) => setError(e.message)); }, [project, run, tick]);
  // On the board, the selected step's panel takes the place of the project panel on the right (Workspace listens): one at a time.
  const docked = Boolean(state && hasBoard(state) && view === 'board');
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('moki:doc-side', { detail: docked }));
    return () => { window.dispatchEvent(new CustomEvent('moki:doc-side', { detail: false })); };
  }, [docked]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); setState(await api.operationRun(project, run)); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const startStep = (slot: string) => act(async () => {
    const r = await api.startOperationStep(project, run, slot, conversationLanguage());
    if (r.terminal) onTerminal(r.terminal); else if (!r.opened) setMessage(r.message ?? t('Could not open the tool.'));
  });
  const sendReject = (redo: boolean) => act(async () => { await api.rejectOperationStep(project, run, notes, redo); setRejecting(false); setNotes(''); });
  const sendAnswer = () => act(async () => {
    const r = await api.answerOperationStep(project, run, reply);
    setReply('');
    setMessage(r.sent === 'terminal' ? t('Sent to its terminal.') : t('The step starts again in a new terminal, with your answer.'));
  });
  const reopen = (v: OperationVisit) => {
    if (!v.terminal && !window.confirm(t('This step was started outside Moki and may still be running there. Start it again in Moki?'))) return;
    void act(() => api.reopenOperationStep(project, run));
  };
  const show = (v: 'board' | 'list') => { setView(v); remember('qa-ops-run-view', v); };

  if (!state) return <div className="ops-run">{error ? <p className="error">{error}</p> : <p className="muted">…</p>}</div>;
  const ended = ['completed', 'cancelled'].includes(state.status);
  const label = (id: string) => tools.find((x) => x.id === id)?.label.replace(/ \(.*\)$/, '') ?? id;
  const stepName = (id: string) => state.steps.find((s) => s.id === id)?.name ?? id;
  const folder = `runs/${state.id}`;
  const last = state.visits[state.visits.length - 1];
  const d = state.decision;
  const board = hasBoard(state) && view === 'board';
  const selected = state.steps.some((s) => s.id === picked) ? picked : last?.step ?? state.steps[0]?.id ?? '';

  // What a visit shows and lets you do: its question, its files, approval, start, try again, its summary.
  const visitBody = (v: OperationVisit) => {
    const step = state.steps.find((s) => s.id === v.step);
    const isLast = v === last && !ended;
    const prev = state.visits.find((x) => x.slot === v.from);
    return (
      <>
        {v.notes && <p className="small ops-notes"><strong>{t('Sent back with your reasons:')}</strong> {v.notes}</p>}
        {isLast && v.status === 'running' && (v.question || !v.live) && (
          <div className={v.question ? 'ops-question' : 'ops-lost'} role="status">
            {v.question && (
              <p>
                <strong>{t('{agent} asks:', { agent: step?.name ?? v.step })}</strong> {v.question}{' '}
                <button type="button" className="link small" onClick={() => onOpenFile(`${folder}/waiting/${v.slot}.md`)}>{t('See the whole question')}</button>
              </p>
            )}
            {!v.live && <p className="small warn-text">{t('Its terminal is not open in Moki (it was closed, or Moki was restarted).')}</p>}
            {v.question ? (
              <form className="ops-answer" onSubmit={(e) => { e.preventDefault(); void sendAnswer(); }}>
                <textarea rows={2} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} aria-label={t('Your answer')}
                  placeholder={v.live ? t('Your answer (sent to its terminal)') : t('Your answer (the step starts again with it)')}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sendAnswer(); } }} />
                <div className="row-actions">
                  <button type="submit" className="btn btn-sm" disabled={busy || !reply.trim()}>{v.live ? t('Send answer') : t('Answer and resume')}</button>
                  {v.live && v.terminal && hasTerminal(v.terminal) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onTerminal({ id: v.terminal as string, title: label(step?.ai ?? '') })}><IconTerminal size={13} /> {t('Show its terminal')}</button>}
                  {!v.live && <button type="button" className="link small" disabled={busy} onClick={() => reopen(v)}>{t('Reopen without answering')}</button>}
                </div>
              </form>
            ) : (
              <div className="row-actions">
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => reopen(v)}><IconPlay size={13} /> {t('Reopen the step')}</button>
              </div>
            )}
          </div>
        )}
        {isLast && v.status === 'running' && (
          <p className="small muted">
            {v.missing?.length ? t('Still to deliver: {files}', { files: v.missing.join(', ') }) : t('Its files are there; it ends when it writes its summary.')}
            {!v.question && v.live && v.terminal && hasTerminal(v.terminal) && <> <button type="button" className="link" onClick={() => onTerminal({ id: v.terminal as string, title: label(step?.ai ?? '') })}><IconTerminal size={13} /> {t('Show its terminal')}</button></>}
          </p>
        )}
        {v.status === 'failed' && (
          <div className="ops-failed" role="alert">
            <p className="small"><strong>{t('Failed:')}</strong> {v.error === 'Its terminal closed before it wrote its summary.' ? t('Its terminal closed before it wrote its summary.') : v.error}</p>
            {isLast && (() => {
              // Try again with its own AI, or another one installed here (its own may be missing: that is often why it failed).
              const installed = tools.filter((x) => x.kind === 'terminal' && x.available);
              const own = installed.some((x) => x.id === step?.ai);
              const chosen = retryAi && installed.some((x) => x.id === retryAi) ? retryAi : own ? step?.ai ?? '' : installed[0]?.id ?? '';
              return (
              <div className="row-actions">
                {!own && <span className="warn-text small">{t('{tool} is not installed here: choose another AI.', { tool: label(step?.ai ?? '') })}</span>}
                <select value={chosen} onChange={(e) => setRetryAi(e.target.value)} aria-label={t('AI tool for this step')} disabled={busy || !installed.length}>
                  {installed.map((x) => <option key={x.id} value={x.id}>{label(x.id)}</option>)}
                </select>
                <button type="button" className="btn btn-sm" disabled={busy || state.paused || !chosen} title={state.paused ? t('Resume the operation first.') : ''}
                  onClick={() => { void act(async () => { await api.retryOperationStep(project, run, chosen === step?.ai ? '' : chosen); setRetryAi(''); }); }}><IconPlay size={13} /> {t('Try again')}</button>
              </div>
              );
            })()}
            <RunVisitFiles project={project} folder={folder} slot={v.slot} handoff={Boolean(v.handoff)} tick={tick} onOpenFile={onOpenFile} />
          </div>
        )}
        {isLast && v.status === 'awaiting-approval' && (
          <div className="ops-approval">
            {prev && <p className="small"><strong>{t('Review what {agent} delivered', { agent: stepName(prev.step) })}</strong></p>}
            {prev && <RunVisitFiles project={project} folder={folder} slot={prev.slot} handoff={Boolean(prev.handoff)} tick={tick} open onOpenFile={onOpenFile} />}
            <div className="row-actions">
              <button type="button" className="btn btn-sm" disabled={busy || state.paused} onClick={() => { void act(async () => { await api.approveOperationStep(project, run); }); }}>{t('Approve and start {agent}', { agent: step?.name ?? v.step })}</button>
              {!rejecting && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setRejecting(true)}>{t('Reject…')}</button>}
              {(step?.executes.length ?? 0) > 0 && <span className="warn-text small">{t('It executes through {mcps}.', { mcps: step?.executes.join(', ') ?? '' })}</span>}
            </div>
            {rejecting && (
              <div className="ops-reject" role="group" aria-label={t('Reject')}>
                <textarea rows={3} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} autoFocus
                  placeholder={t('What is wrong, or what should change?')} aria-label={t('Why you reject it')} />
                <div className="row-actions">
                  {prev && <button type="button" className="btn btn-sm" disabled={busy || !state.canRedo} title={state.canRedo ? '' : t('{agent} already ran as many times as this operation allows.', { agent: stepName(prev.step) })}
                    onClick={() => { void sendReject(true); }}>{t('Send back to {agent}', { agent: stepName(prev.step) })}</button>}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm(t('End this operation? The steps already done stay in its folder.'))) void sendReject(false); }}>{t('End the operation')}</button>
                  <button type="button" className="link small" onClick={() => { setRejecting(false); setNotes(''); }}>{t('Cancel')}</button>
                </div>
              </div>
            )}
          </div>
        )}
        {isLast && v.status === 'ready' && !state.paused && !d && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void startStep(v.slot); }}><IconPlay size={13} /> {t('Start this step')}</button>
        )}
        {v.status === 'done' && <RunVisitFiles project={project} folder={folder} slot={v.slot} handoff={Boolean(v.handoff)} tick={tick} onOpenFile={onOpenFile} />}
      </>
    );
  };

  // The selected step beside the board: what it does, then each time it ran (latest first).
  const panel = () => {
    const step = state.steps.find((s) => s.id === selected);
    if (!step) return null;
    const visits = state.visits.filter((v) => v.step === step.id).reverse();
    return (
      <aside className="ops-run-panel" aria-label={t('Step {name}', { name: step.name })}>
        <header>
          <h2>{step.name}</h2>
          <p className="muted small">{label(step.ai)}{step.lane && <> · {step.lane}</>}</p>
        </header>
        <dl className="ops-run-facts small">
          {step.inputs.length > 0 && <><dt>{t('Receives')}</dt><dd>{step.inputs.join(', ')}</dd></>}
          {step.outputs.length > 0 && <><dt>{t('Delivers')}</dt><dd>{step.outputs.join(', ')}</dd></>}
          {step.outcomes.length > 0 && <><dt>{t('Can end with')}</dt><dd>{step.outcomes.join(', ')}</dd></>}
          {step.executes.length > 0 && <><dt>{t('Executes via MCP')}</dt><dd>{step.executes.join(', ')}</dd></>}
        </dl>
        {!visits.length && <p className="muted small">{ended ? t('The operation ended without reaching this step.') : t('The operation has not reached this step yet.')}</p>}
        {visits.map((v) => {
          const prev = state.visits.find((x) => x.slot === v.from);
          const map = Object.entries(v.map ?? {});
          return (
            <section key={v.slot} className={`ops-run-visit ${v.status}`}>
              <div className="ops-timeline-title">
                <strong>{visits.length > 1 ? t('Time {n}', { n: v.round }) : t('This step')}</strong>
                {v.outcome && <span className="pill pill-outcome">{v.outcome}</span>}
                <span className="ops-timeline-status">{visitText(v)}</span>
              </div>
              <dl className="ops-run-facts small">
                <dt>{t('Came from')}</dt>
                <dd>{prev ? <>{stepName(prev.step)}{prev.outcome && <> ({prev.outcome})</>} · {v.gate === 'approval' ? t('after your approval') : t('directly')}</> : t('the start of the operation')}</dd>
                {map.length > 0 && <><dt>{t('Inputs from it')}</dt><dd>{map.map(([input, file]) => `${input} ← ${file}`).join('; ')}</dd></>}
                {v.startedAt && <><dt>{t('Started')}</dt><dd>{when(v.startedAt)}</dd></>}
                {v.finishedAt && <><dt>{t('Ended')}</dt><dd>{when(v.finishedAt)}</dd></>}
                {v.startedAt && <><dt>{t('Took')}</dt><dd>{took(v.startedAt, v.finishedAt)}</dd></>}
                {(v.attempts ?? 0) > 0 && <><dt>{t('Tried again')}</dt><dd>{t('{n} times', { n: v.attempts ?? 0 })}</dd></>}
              </dl>
              {visitBody(v)}
            </section>
          );
        })}
        {(state.events?.length ?? 0) > 0 && (
          <details className="ops-run-events">
            <summary className="small">{t('Run log')}</summary>
            <pre>{state.events?.join('\n')}</pre>
          </details>
        )}
      </aside>
    );
  };

  return (
    <div className={`ops-run${board ? ' wide docked' : ''}`} role="region" aria-label={state.operation.name}>
      <header className="ops-run-head">
        <div>
          <h1>{state.operation.name}</h1>
          <p className="muted small">
            <span className={`pill pill-${state.status}`}>{statusLabel(state.status)}</span>
            {state.paused && state.status !== 'paused' && !ended && <> · {t('Pauses when the current step ends')}</>}
            {' '}· {when(state.createdAt)}
          </p>
        </div>
        <div className="row-actions">
          {hasBoard(state) && (
            <div className="view-toggle" role="group" aria-label={t('View')}>
              <button type="button" className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => show('board')}>{t('Board')}</button>
              <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => show('list')}>{t('List')}</button>
            </div>
          )}
          {!ended && (state.paused
            ? <button type="button" className="icon-btn" disabled={busy} title={t('Resume')} aria-label={t('Resume')} onClick={() => { void act(() => api.pauseOperation(project, run, false)); }}><IconPlay size={16} /></button>
            : <button type="button" className="icon-btn" disabled={busy} title={t('Pause')} aria-label={t('Pause')} onClick={() => { void act(() => api.pauseOperation(project, run, true)); }}><IconPause size={16} /></button>)}
          {!ended && <button type="button" className="icon-btn" disabled={busy} title={t('Cancel operation')} aria-label={t('Cancel operation')} onClick={() => { if (window.confirm(t('Cancel this operation? The steps already done stay in its folder.'))) void act(() => api.cancelOperation(project, run)); }}><IconStop size={15} /></button>}
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close')} aria-label={t('Close')}><IconX size={18} /></button>
        </div>
      </header>
      {error && <p className="error small">{error}</p>}
      {message && <p className="warn-text small">{message}</p>}

      {d && !ended && (
        <section className="ops-decision" role="group" aria-label={t('Your decision')}>
          {d.kind === 'path'
            ? <p><strong>{d.outcome ? t('{agent} ended with "{result}", and no arrow leads on from that result.', { agent: stepName(state.visits.find((v) => v.slot === d.from)?.step ?? ''), result: d.outcome }) : t('{agent} did not say how it ended.', { agent: stepName(state.visits.find((v) => v.slot === d.from)?.step ?? '') })}</strong> {t('Which way now?')}</p>
            : <p><strong>{t('{agent} already ran {n} times, the limit of this operation.', { agent: stepName(d.options[0]?.to ?? ''), n: state.maxRounds })}</strong> {t('Run it once more?')}</p>}
          <div className="row-actions">
            {d.options.map((o) => (
              <button key={`${o.to}:${o.when}`} type="button" className="btn btn-sm" disabled={busy} onClick={() => { void act(() => api.chooseOperationPath(project, run, o.to)); }}>
                {d.kind === 'path' && o.when ? t('Go on to {agent} (as "{result}")', { agent: stepName(o.to), result: o.when }) : d.kind === 'path' ? t('Go on to {agent}', { agent: stepName(o.to) }) : t('Run {agent} once more', { agent: stepName(o.to) })}
              </button>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { void act(() => api.chooseOperationPath(project, run, '')); }}>{t('End the operation here')}</button>
          </div>
        </section>
      )}

      {board ? (
        <div className="ops-run-split">
          <OperationRunBoard run={state} tools={tools} selected={selected} onSelect={(id) => { setPicked(id); setRejecting(false); }} />
          {panel()}
        </div>
      ) : (
        <ol className="ops-timeline">
          {state.visits.map((v, i) => {
            const step = state.steps.find((s) => s.id === v.step);
            return (
              <li key={v.slot} className={`ops-timeline-step ${v.status}${v.question && v.status === 'running' ? ' asking' : ''}`}>
                <span className="ops-timeline-n">{i + 1}</span>
                <div className="ops-timeline-body">
                  <div className="ops-timeline-title">
                    <strong>{step?.name ?? v.step}</strong>
                    {v.round > 1 && <span className="chip">{t('time {n}', { n: v.round })}</span>}
                    {step?.lane && <span className="chip">{step.lane}</span>}
                    <span className="muted small">{label(step?.ai ?? '')}</span>
                    {v.outcome && <span className="pill pill-outcome">{v.outcome}</span>}
                    <span className="ops-timeline-status">{visitText(v)}</span>
                  </div>
                  {visitBody(v)}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
