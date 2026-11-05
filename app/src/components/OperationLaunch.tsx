// Starting a multi-agent operation, in the main area of the project: the steps
// in order and the AI of each one (each agent's own, or one AI for all), the
// initial form (inputs no earlier step delivers: text and inbox files), what the
// user wants, and what would not work (an MCP server an AI does not have).

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type OperationAnswer, type OperationPlan, type OperationRun, type ToolInfo } from '../api';
import { t } from '../i18n';
import { defaultTool, recall, remember } from '../prefs';
import { IconPlay, IconPlus, IconX } from './Icons';

interface Props {
  project: string;
  operation: string;
  tools: ToolInfo[];
  onClose: () => void;
  onStarted: (run: OperationRun) => void;
}

const AIS = ['claude', 'codex', 'cursor-agent', 'gemini', 'antigravity'];

export function OperationLaunch({ project, operation, tools, onClose, onStarted }: Props) {
  const [plan, setPlan] = useState<OperationPlan | null>(null);
  const [mode, setMode] = useState<'agents' | 'single'>(() => (recall('qa-ops-ai-mode') === 'single' ? 'single' : 'agents'));
  const [single, setSingle] = useState(defaultTool);
  const [chosen, setChosen] = useState<Record<string, string>>({}); // steps whose agent has no AI of its own
  const [answers, setAnswers] = useState<Record<string, OperationAnswer>>({});
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const [attachTo, setAttachTo] = useState('');

  const load = () => api.operationPlan(project, operation).then(setPlan).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [project, operation]); // eslint-disable-line react-hooks/exhaustive-deps

  const installed = tools.filter((x) => AIS.includes(x.id) && x.available);
  const fallback = installed.find((x) => x.id === single)?.id ?? installed[0]?.id ?? '';
  // The AI of each step: one for all, or the agent's own (when installed), or the one chosen here.
  const toolOf = (step: { id: string; ai: string }) => (mode === 'single' ? fallback
    : installed.some((x) => x.id === step.ai) ? step.ai : chosen[step.id] ?? fallback);
  const label = (id: string) => tools.find((x) => x.id === id)?.label.replace(/ \(.*\)$/, '') ?? id;

  const key = (step: string, input: string) => `${step}:${input}`;
  const answer = (step: string, input: string): OperationAnswer => answers[key(step, input)] ?? { step, input, text: '', files: [] };
  const setAnswer = (a: OperationAnswer) => setAnswers((all) => ({ ...all, [key(a.step, a.input)]: a }));

  // MCP servers a step uses that its AI does not have configured (Moki cannot tell for every AI).
  const missingMcps = useMemo(() => (plan?.steps ?? []).flatMap((s) => {
    const have = plan?.mcpsByTool[toolOf(s)];
    return have === null || have === undefined ? [] : s.mcps.filter((m) => !have.includes(m.name)).map((m) => ({ step: s.agent, mcp: m.name, tool: toolOf(s) }));
  }), [plan, mode, single, chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const attach = (files: FileList | null) => {
    const paths = Array.from(files ?? []).map((f) => window.qa?.filePath(f) ?? '').filter(Boolean);
    if (!paths.length || !attachTo) return;
    const [step, ...rest] = attachTo.split(':');
    const input = rest.join(':');
    api.importFiles(project, paths).then((r) => {
      const a = answer(step, input);
      setAnswer({ ...a, files: [...new Set([...a.files, ...r.saved])] });
      return load();
    }).catch((e: Error) => setError(e.message));
  };

  const start = async () => {
    if (!plan) return;
    setBusy(true); setError('');
    remember('qa-ops-ai-mode', mode);
    try {
      const run = await api.startOperation(project, operation, {
        tools: Object.fromEntries(plan.steps.map((s) => [s.id, toolOf(s)])),
        answers: plan.operation.check.initialInputs.map((i) => answer(i.step, i.input)),
        context,
      });
      onStarted(run);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  if (!plan) return <div className="ops-run">{error ? <p className="error">{error}</p> : <p className="muted">…</p>}</div>;
  const op = plan.operation;
  const byStep = (id: string) => op.check.initialInputs.filter((i) => i.step === id);
  const blocked = op.check.errors.length > 0 || !installed.length || plan.steps.some((s) => !toolOf(s));

  return (
    <div className="ops-run" role="region" aria-label={t('Start {name}', { name: op.name })}>
      <header className="ops-run-head">
        <div>
          <h1>{op.name}</h1>
          {op.description && <p className="muted">{op.description}</p>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} title={t('Close')} aria-label={t('Close')}><IconX size={18} /></button>
      </header>

      {op.check.errors.map((m, i) => <p key={`e${i}`} className="error small">{t(m.text, m.params)}</p>)}
      {!installed.length && <p className="error small">{t('No AI tool that runs in a terminal is installed (Claude Code, Codex, Cursor Agent, Gemini or Antigravity).')}</p>}

      <section className="ops-run-section">
        <h2>{t('Which AI does each step')}</h2>
        <label className="field inline"><input type="radio" name="ai-mode" checked={mode === 'agents'} onChange={() => setMode('agents')} /> {t("Each agent's own AI")}</label>
        <label className="field inline">
          <input type="radio" name="ai-mode" checked={mode === 'single'} onChange={() => setMode('single')} /> {t('One AI for every step')}
          {mode === 'single' && (
            <select value={fallback} onChange={(e) => setSingle(e.target.value)} aria-label={t('AI for every step')}>
              {installed.map((x) => <option key={x.id} value={x.id}>{label(x.id)}</option>)}
            </select>
          )}
        </label>
        <ol className="ops-run-steps">
          {plan.steps.map((s) => {
            const own = installed.some((x) => x.id === s.ai);
            return (
              <li key={s.id}>
                <span className="ops-run-agent">{s.agent}</span>
                {s.gate === 'approval' && <span className="pill pill-awaiting-approval">{t('After your approval')}</span>}
                {s.mcps.some((m) => m.mode === 'execute') && <span className="pill pill-warn">{t('Executes via MCP')}</span>}
                <span className="ops-run-ai">
                  {mode === 'agents' && !own
                    ? (
                      <select value={toolOf(s)} onChange={(e) => setChosen((c) => ({ ...c, [s.id]: e.target.value }))} aria-label={t('AI for {agent}', { agent: s.agent })}>
                        {installed.map((x) => <option key={x.id} value={x.id}>{label(x.id)}</option>)}
                      </select>
                    )
                    : <span className="muted small">{label(toolOf(s))}</span>}
                  {mode === 'agents' && s.ai && !own && <span className="muted small"> · {t('{ai} is not installed', { ai: label(s.ai) })}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        {missingMcps.map((m) => <p key={`${m.step}:${m.mcp}`} className="warn-text small">{t('{agent} uses the MCP server {mcp}, which is not configured for {ai}.', { agent: m.step, mcp: m.mcp, ai: label(m.tool) })}</p>)}
      </section>

      <section className="ops-run-section">
        <h2>{t('What do you want?')}</h2>
        <textarea rows={3} value={context} onChange={(e) => setContext(e.target.value)} maxLength={20000} aria-label={t('What do you want?')}
          placeholder={t('The goal, the scope, what the agents should know (e.g. Review the login stories of sprint 12 and design their tests).')} />
      </section>

      {op.check.initialInputs.length > 0 && (
        <section className="ops-run-section">
          <h2>{t('What the agents need to start')}</h2>
          <p className="muted small">{t('Write it, or attach files (they go to the project inbox). What you leave empty, the agent asks you when it starts.')}</p>
          {plan.steps.filter((s) => byStep(s.id).length).map((s) => (
            <div key={s.id} className="ops-run-inputs">
              <h3>{s.agent}</h3>
              {byStep(s.id).map((i) => {
                const a = answer(i.step, i.input);
                return (
                  <div key={i.input} className="field">
                    <span className="label">{i.input}</span>
                    <textarea rows={2} value={a.text} onChange={(e) => setAnswer({ ...a, text: e.target.value })} aria-label={`${i.input} (${s.agent})`} />
                    <div className="chips">
                      {plan.inbox.map((f) => {
                        const path = `inbox/${f}`;
                        const on = a.files.includes(path);
                        return (
                          <button key={f} type="button" className={`chip-btn${on ? ' on' : ''}`} aria-pressed={on}
                            onClick={() => setAnswer({ ...a, files: on ? a.files.filter((x) => x !== path) : [...a.files, path] })}>{f}</button>
                        );
                      })}
                      <button type="button" className="chip-btn" onClick={() => { setAttachTo(key(i.step, i.input)); picker.current?.click(); }}><IconPlus size={12} /> {t('Attach a file')}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <input ref={picker} type="file" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
        </section>
      )}

      {op.check.warnings.map((m, i) => <p key={`w${i}`} className="warn-text small">{t(m.text, m.params)}</p>)}
      {error && <p className="error small">{error}</p>}
      <div className="form-actions">
        <span className="muted small">{t('You can close this screen while it runs: the status stays in the side panel.')}</span>
        <button type="button" className="btn" disabled={busy || blocked} onClick={() => { void start(); }}><IconPlay size={14} /> {busy ? t('Starting…') : t('Start operation')}</button>
      </div>
    </div>
  );
}
