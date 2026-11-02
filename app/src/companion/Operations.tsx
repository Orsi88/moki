// Multi-agent operations in the Moki panel of the IDE: start one of the project's
// operations (the AI of each step, what the agents need, what you want), then follow
// a run step by step and answer it — approve, send back, answer a question, retry,
// choose a path, pause, cancel. The engine is the app's (scripts/lib/operation-runs.ts):
// the extension host starts each step in its own VS Code terminal and moves the run on
// whenever the project's files change (desktop/companion-api.ts drive()).

import { useEffect, useState } from 'react';
import { describeRun, statusLabel, type InboxFile, type Operation, type OperationPlan, type OperationRun, type OperationVisit, type ToolInfo } from '../api';
import { t } from '../i18n';
import { CatIcon } from '../components/CatIcon';
import { IconPlay, IconTerminal } from '../components/Icons';
import { call } from './bridge';
import { useShortlist } from './Shortlist';

type Notify = (text: string, warn?: boolean) => void;
const fail = (notify: Notify) => (e: unknown) => notify(e instanceof Error ? e.message : String(e), true);

// What a visit is doing, in a few words.
export function visitText(v: OperationVisit): string {
  if (v.status === 'running') return v.question ? t('Waiting for your answer') : t('Working');
  if (v.status === 'awaiting-approval') return t('Waiting for your approval');
  if (v.status === 'ready') return t('Starting…');
  if (v.status === 'done') return v.outcome ? t('Done · {outcome}', { outcome: v.outcome }) : t('Done');
  if (v.status === 'failed') return t('Failed');
  return t('Cancelled');
}

// ---------------------------------------------------------------- starting an operation

export function OperationStarter({ inbox, onStarted, notify }: { inbox: InboxFile[]; onStarted: (run: string) => void; notify: Notify }) {
  const [operations, setOperations] = useState<(Operation & { linked: boolean })[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [open, setOpen] = useState('');
  const list = useShortlist('operations', operations, (o) => o.id, (o) => `${o.name} ${o.description}`);
  useEffect(() => {
    call<(Operation & { linked: boolean })[]>('operations').then(setOperations).catch(fail(notify));
    call<ToolInfo[]>('aiTools').then(setTools).catch(() => setTools([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per opening of the tab
  if (!operations.length) return <p className="muted small">{t('This workspace has no operations yet. Create one in the Moki app (Settings › Operations).')}</p>;
  return (
    <div className="mk-list">
      {list.search}
      {list.shown.map((op) => (
        <div key={op.id} className={`mk-card${open === op.id ? ' on' : ''}`}>
          <span className="mk-star">{list.star(op.id, op.name)}</span>
          <button type="button" className="mk-card-head" onClick={() => setOpen((o) => (o === op.id ? '' : op.id))} aria-expanded={open === op.id}>
            <span className="mk-card-icon"><CatIcon id="flow" size={40} /></span>
            <span className="mk-card-text">
              <span className="mk-card-title">{op.name}</span>
              <span className="mk-card-hint">{op.description || t('{n} steps', { n: op.check.order.length })}</span>
              {op.linked && <span className="mk-chips"><span className="mk-chip">{t('Used in this project')}</span></span>}
            </span>
          </button>
          {open === op.id && <StartForm id={op.id} tools={tools.filter((x) => x.available)} inbox={inbox} notify={notify} onStarted={onStarted} />}
        </div>
      ))}
    </div>
  );
}

function StartForm({ id, tools, inbox, notify, onStarted }: { id: string; tools: ToolInfo[]; inbox: InboxFile[]; notify: Notify; onStarted: (run: string) => void }) {
  const [plan, setPlan] = useState<OperationPlan | null>(null);
  const [ai, setAi] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, string[]>>({});
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<OperationPlan>('operationPlan', id).then((p) => {
      setPlan(p);
      // Each step's own AI when it is installed, else the first one installed.
      const installed = new Set(tools.map((x) => x.id));
      setAi(Object.fromEntries(p.steps.map((s) => [s.id, installed.has(s.ai) ? s.ai : tools[0]?.id ?? ''])));
    }).catch(fail(notify));
  }, [id, tools.length]); // eslint-disable-line react-hooks/exhaustive-deps -- the plan once, the defaults when the tools arrive
  if (!plan) return <div className="mk-launch"><span className="muted small">{t('Loading…')}</span></div>;

  const op = plan.operation;
  const key = (step: string, input: string) => `${step}\u0000${input}`;
  const label = (tool: string) => tools.find((x) => x.id === tool)?.label ?? tool;
  const warnings = plan.steps.flatMap((s) => {
    const have = plan.mcpsByTool[ai[s.id]];
    return have ? s.mcps.filter((m) => !have.includes(m.name)).map((m) => t('{agent} uses the MCP server {mcp}, which is not configured for {ai}.', { agent: s.agent, mcp: m.name, ai: label(ai[s.id]) })) : [];
  });
  const missingAi = plan.steps.some((s) => !ai[s.id]);
  const start = async () => {
    setBusy(true);
    try {
      const answers = op.check.initialInputs.map((i) => ({ step: i.step, input: i.input, text: texts[key(i.step, i.input)] ?? '', files: files[key(i.step, i.input)] ?? [] }));
      const run = await call<OperationRun>('startOperation', id, { tools: ai, answers, context });
      notify(t('Operation started: the first step opens in a terminal.'));
      onStarted(run.id);
    } catch (e) { fail(notify)(e); } finally { setBusy(false); }
  };

  return (
    <div className="mk-launch">
      {op.check.errors.map((m, i) => <p key={`e${i}`} className="error small">{t(m.text, m.params)}</p>)}
      {!tools.length && <p className="error small">{t('No AI tool that runs in a terminal is installed (Claude Code, Codex, Cursor Agent, Gemini, Antigravity).')}</p>}
      <div className="field">
        <span className="label">{t('AI of each step')}</span>
        <ul className="mk-steps">
          {plan.steps.map((s, i) => (
            <li key={s.id}>
              <span className="mk-step-n">{i + 1}</span>
              <span className="mk-step-name" title={s.description}>{s.agent}{s.gate === 'approval' ? <span className="muted small"> · {t('asks for approval')}</span> : null}</span>
              <select value={ai[s.id] ?? ''} onChange={(e) => setAi({ ...ai, [s.id]: e.target.value })} aria-label={t('AI of {agent}', { agent: s.agent })}>
                {tools.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>
      {warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}
      {op.check.initialInputs.map((i) => (
        <div key={key(i.step, i.input)} className="field">
          <span className="label">{i.agent}: {i.input}</span>
          <textarea rows={2} value={texts[key(i.step, i.input)] ?? ''} onChange={(e) => setTexts({ ...texts, [key(i.step, i.input)]: e.target.value })} />
          {inbox.length > 0 && (
            <ul className="mk-files">
              {inbox.map((f) => {
                const chosen = files[key(i.step, i.input)] ?? [];
                const path = `inbox/${f.name}`;
                return (
                  <li key={f.name}><label>
                    <input type="checkbox" checked={chosen.includes(path)} onChange={() => setFiles({ ...files, [key(i.step, i.input)]: chosen.includes(path) ? chosen.filter((x) => x !== path) : [...chosen, path] })} />
                    <span title={f.name}>{f.name}</span>
                  </label></li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      <label className="field"><span className="label">{t('What you want (optional)')}</span>
        <textarea rows={2} value={context} onChange={(e) => setContext(e.target.value)} placeholder={t('Anything the AI should know')} />
      </label>
      <div className="mk-actions">
        <button type="button" className="btn" disabled={busy || missingAi || op.check.errors.length > 0} onClick={() => { void start(); }}><IconPlay size={14} /> {t('Start the operation')}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- a run, step by step

export function OperationRunScreen({ runId, tick, onBack, notify }: { runId: string; tick: number; onBack: () => void; notify: Notify }) {
  const [run, setRun] = useState<OperationRun | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [text, setText] = useState('');
  const [retryAi, setRetryAi] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => { call<OperationRun>('operationRun', runId).then(setRun).catch(fail(notify)); };
  useEffect(load, [runId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { call<ToolInfo[]>('aiTools').then((x) => setTools(x.filter((y) => y.available))).catch(() => setTools([])); }, []);
  const act = async (method: string, ...args: unknown[]) => {
    setBusy(true);
    try { await call(method, runId, ...args); setText(''); load(); } catch (e) { fail(notify)(e); } finally { setBusy(false); }
  };
  if (!run) return <p className="muted small">{t('Loading…')}</p>;

  const v = run.visits.at(-1);
  const step = (id: string) => run.steps.find((s) => s.id === id);
  const latest = (id: string) => [...run.visits].reverse().find((x) => x.step === id);
  const over = run.ended || run.status === 'cancelled' || run.status === 'completed';
  const ownAi = v ? step(v.step)?.ai ?? '' : '';

  return (
    <div className="mk-list">
      <button type="button" className="btn btn-ghost btn-sm mk-back" onClick={onBack}>← {t('Runs')}</button>
      <div className="mk-run-head">
        <CatIcon id="flow" size={40} />
        <div className="mk-card-text">
          <span className="mk-card-title">{run.operation.name}</span>
          <span className="pill mk-pill">{run.paused ? t('Paused') : statusLabel(run.status)}</span>
          <span className="mk-card-hint">{describeRun(run.id).date}</span>
        </div>
      </div>

      <ul className="mk-run-steps">
        {run.steps.map((s, i) => {
          const last = latest(s.id);
          return (
            <li key={s.id} className={`${v?.step === s.id && !over ? 'on ' : ''}${last ? last.status : 'pending'}`}>
              <span className="mk-step-n">{i + 1}</span>
              <span className="mk-step-name">{s.name}<span className="muted small"> · {s.ai}</span></span>
              <span className="mk-step-state">{last ? `${visitText(last)}${last.round > 1 ? ` (${last.round}ª)` : ''}` : t('Not started')}</span>
            </li>
          );
        })}
      </ul>

      {!over && v && (
        <div className="mk-card on"><div className="mk-launch mk-run-action">
          {run.decision ? (
            <>
              <p className="small"><strong>{run.decision.kind === 'limit' ? t('A step would run more than {n} times. What now?', { n: run.maxRounds }) : t('No arrow fits the result{outcome}. Where to?', { outcome: run.decision.outcome ? ` "${run.decision.outcome}"` : '' })}</strong></p>
              {run.decision.options.map((o) => (
                <button key={o.to} type="button" className="btn btn-ghost" disabled={busy} onClick={() => { void act('chooseOperationPath', o.to); }}>{step(o.to)?.name ?? o.to}{o.when ? ` · ${o.when}` : ''}</button>
              ))}
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { void act('chooseOperationPath', ''); }}>{t('End here')}</button>
            </>
          ) : v.status === 'running' && v.question ? (
            <>
              <p className="small"><strong>{t('{agent} asks:', { agent: step(v.step)?.name ?? v.step })}</strong></p>
              <p className="mk-question">{v.question}</p>
              <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Your answer')} />
              <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => { void act('answerOperationStep', text); }}>{v.live ? t('Answer in its terminal') : t('Answer and reopen the step')}</button>
            </>
          ) : v.status === 'running' ? (
            <>
              <p className="small">{t('{agent} is working in its terminal.', { agent: step(v.step)?.name ?? v.step })}</p>
              {(v.missing ?? []).length > 0 && <p className="muted small">{t('Still missing: {files}', { files: (v.missing ?? []).join(', ') })}</p>}
              {!v.live && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { void act('reopenOperationStep'); }}>{t('Reopen the step')}</button>}
            </>
          ) : v.status === 'awaiting-approval' ? (
            <>
              <p className="small"><strong>{t('{agent} waits for your approval to start.', { agent: step(v.step)?.name ?? v.step })}</strong></p>
              {(step(v.step)?.executes ?? []).length > 0 && <p className="muted small">⚠ {t('It executes through {mcps}.', { mcps: (step(v.step)?.executes ?? []).join(', ') })}</p>}
              <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Notes (to send it back)')} />
              <button type="button" className="btn" disabled={busy} onClick={() => { void act('approveOperationStep'); }}>{t('Approve')}</button>
              <button type="button" className="btn btn-ghost" disabled={busy || !run.canRedo} title={run.canRedo ? '' : t('There is no step before it to redo.')} onClick={() => { void act('rejectOperationStep', text, true); }}>{t('Send back with notes')}</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm(t('End the operation here?'))) void act('rejectOperationStep', text, false); }}>{t('End the operation')}</button>
            </>
          ) : v.status === 'failed' ? (
            <>
              <p className="small"><strong>{t('{agent} stopped:', { agent: step(v.step)?.name ?? v.step })}</strong> {v.error}</p>
              <select value={retryAi || ownAi} onChange={(e) => setRetryAi(e.target.value)} aria-label={t('AI')}>
                {tools.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <button type="button" className="btn" disabled={busy} onClick={() => { void act('retryOperationStep', retryAi && retryAi !== ownAi ? retryAi : ''); }}>{t('Try again')}</button>
            </>
          ) : (
            <p className="muted small">{run.paused ? t('Paused: resume it to go on.') : t('Starting the next step…')}</p>
          )}
        </div></div>
      )}

      {!over && (
        <div className="mk-actions mk-run-tools">
          {v?.status === 'running' && v.live && <button type="button" className="btn btn-ghost" onClick={() => { void act('showTerminal'); }}><IconTerminal size={14} /> {t('Show its terminal')}</button>}
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { void act('pauseOperation', !run.paused); }}>{run.paused ? t('Resume') : t('Pause')}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm(t('Cancel this operation? The step running now is stopped.'))) void act('cancelOperation'); }}>{t('Cancel the operation')}</button>
        </div>
      )}

      {(run.events ?? []).length > 0 && (
        <details className="mk-events">
          <summary className="muted small">{t('Run log')}</summary>
          <ul>{(run.events ?? []).map((e, i) => <li key={i} className="small">{e}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
