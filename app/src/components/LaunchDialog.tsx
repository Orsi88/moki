// "Open in your AI tool": a short wizard — one question per screen — that
// prepares the request (activity, inbox files, shared context, agent, notes) and opens the AI
// tool the QA already uses. Moki has no chat of its own.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, describeRun, type ActivityInfo, type ContextChoice, type AgentInfo, type InboxFile, type LaunchResult, type OpenRun, type ProjectSummary, type TerminalRef, type ToolInfo, type ToolKind } from '../api';
import { conversationLanguage, t } from '../i18n';
import { defaultTool, remember } from '../prefs';
import { IconCheck, IconCode, IconCopy, IconFile, IconFolder, IconGlobe, IconPlay, IconRefresh, IconTerminal, IconX } from './Icons';
import { FileIcon } from '../icons';
import { TagChip } from './TagPicker';
import { AgentPick } from './AgentCatalog';
import { AiPick } from './ToolCatalog';
import type { ActivityLaunchPhase } from '../activity-launches';

interface Props {
  project: ProjectSummary;
  tools: ToolInfo[];
  preset?: { activity: string; run?: string; skipActivity?: boolean; tool?: string; agent?: string; startAtTool?: boolean }; // skipActivity: the activity, its agent and the AI were already chosen (side panel: tool, agent)
  onClose: () => void;
  onTerminal: (terminal: TerminalRef) => void; // the tool opened in a terminal tab of the app
  onActivityStart?: (activity: string, label: string) => string | undefined;
  onActivityUpdate?: (id: string | undefined, phase: ActivityLaunchPhase) => void;
  onOperation?: (operation: string) => void; // an activity of an operation opens its start form instead
  onMyAis?: () => void; // Settings › My AIs, to install the AIs not found here
}

type StepKey = 'activity' | 'run' | 'files' | 'context' | 'agent' | 'details' | 'tool' | 'review';

const KIND_ICON: Record<ToolKind, ReactNode> = {
  terminal: <IconTerminal size={16} />, editor: <IconCode size={16} />, chat: <IconGlobe size={16} />, print: <IconFile size={16} />,
};
const kindHint = (kind: ToolKind): string => ({
  terminal: t('Opens in a terminal tab'), editor: t('Opens the folder in your editor, request copied'),
  chat: t('Web chat — you upload the files'), print: t('Only prepares the request for you to copy'),
})[kind];

const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function LaunchDialog({ project, tools, preset, onClose, onTerminal, onActivityStart, onActivityUpdate, onOperation, onMyAis }: Props) {
  const [activities, setActivities] = useState<ActivityInfo[]>([]);
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [activity, setActivity] = useState(preset?.activity ?? '');
  const [inbox, setInbox] = useState<InboxFile[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [runs, setRuns] = useState<OpenRun[]>([]);
  const [run, setRun] = useState(preset?.run ?? '');
  const [choice, setChoice] = useState<ContextChoice>({ own: [], shared: [] });
  const [exclude, setExclude] = useState<string[]>([]); // context files left out of this activity
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agent, setAgent] = useState(preset?.agent ?? '');
  const [note, setNote] = useState('');
  const [language, setLanguage] = useState(conversationLanguage);
  const [tool, setTool] = useState(() => {
    const saved = preset?.tool ?? defaultTool();
    return tools.some((t) => t.id === saved && t.available) ? saved as string : '';
  });
  const [step, setStep] = useState<StepKey>(preset?.startAtTool ? 'tool' : preset?.activity === 'resume' && preset.run ? 'details' : preset?.skipActivity && preset.activity ? 'files' : 'activity');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const outcomeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.inbox(project.id).then((list) => { setInbox(list); setFiles((sel) => sel.filter((f) => list.some((x) => x.name === f))); }).catch(() => setInbox([]));
    api.openRuns(project.id).then(setRuns).catch(() => setRuns([]));
    api.contextChoice(project.id).then((c) => {
      setChoice(c);
      const all = new Set([...c.own, ...c.shared.flatMap((g) => g.sources.flatMap((s) => s.paths))]);
      setExclude((ex) => ex.filter((p) => all.has(p)));
    }).catch(() => setChoice({ own: [], shared: [] }));
  }, [project.id]);

  useEffect(() => {
    api.activities(project.id).then((r) => { setActivities(r.activities); setLanguages(r.languages); }).catch(() => { /* empty list */ });
    Promise.all([api.agents(), api.projectAgents(project.id)])
      .then(([list, enabled]) => setAgents(list.filter((a) => a.usable && enabled.includes(a.name))))
      .catch(() => setAgents([]));
    load();
  }, [load, project.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = activities.find((a) => a.id === activity);
  const resume = activity === 'resume';
  // The context step only shows when the project's tags bring something from other projects.
  const sharing = choice.shared.length > 0;
  // Started from the side panel: the activity, the agent and the AI arrive chosen (changed in the last step, with the
  // same pickers), so only what the activity needs is asked: files, shared context, notes.
  const fromPanel = Boolean(preset?.skipActivity && !resume);
  const steps: StepKey[] = preset?.startAtTool ? ['tool', 'review']
    : fromPanel ? ['files', ...(sharing ? ['context' as const] : []), 'details', 'review']
    : ['activity', ...(resume ? ['run' as const] : ['files' as const, ...(sharing ? ['context' as const] : []), ...(agents.length ? ['agent' as const] : [])]), 'details', 'tool', 'review'];
  const toggle = (paths: string[]) => setExclude((ex) => (paths.every((p) => ex.includes(p)) ? ex.filter((p) => !paths.includes(p)) : [...new Set([...ex, ...paths])]));
  const sharedPaths = [...new Set(choice.shared.flatMap((g) => g.sources.flatMap((s) => s.paths)))];
  const keptShared = sharedPaths.filter((p) => !exclude.includes(p));
  const index = Math.max(0, steps.indexOf(step));
  const next = () => setStep(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => { setResult(null); setError(''); setStep(steps[Math.max(index - 1, 0)]); };

  // Agents that use the chosen activity's skill come first.
  const suited = agents.filter((a) => current && a.skills.includes(current.skill));
  const others = agents.filter((a) => !suited.includes(a));
  const selectedTool = tools.find((t) => t.id === tool);
  const installed = tools.filter((t) => t.available);
  const notInstalled = tools.filter((t) => !t.available);

  const submit = async () => {
    setBusy(true); setResult(null); setError(''); setCopied(false);
    const trackingId = onActivityStart?.(activity, current ? t(current.label) : activity);
    remember('qa-language', language);
    // The window shares the main process. If opening the tool never returns, say so instead of leaving "Opening…" up.
    let late = false;
    const timer = window.setTimeout(() => {
      late = true;
      setBusy(false);
      onActivityUpdate?.(trackingId, 'unconfirmed');
      setError(t('The request is taking too long. Close this and try again.'));
    }, 20000);
    try {
      const r = await api.launch({ project: project.id, activity, tool, files, note, language, run: resume ? run : undefined, agent: agent || undefined, exclude: resume ? [] : exclude, ...(trackingId ? { trackingId } : {}) });
      if (late) return;
      onActivityUpdate?.(trackingId, r.copied ? 'prepared' : r.terminal || r.opened ? 'sent' : r.prompt && !r.message ? 'prepared' : 'failed');
      if (r.terminal) { onTerminal(r.terminal); return; }
      setResult(r);
      if (!r.opened && r.message) setError(r.message);
      else if (!r.opened && !r.prompt) setError(t('The request could not be prepared.'));
    } catch (e) {
      if (!late) onActivityUpdate?.(trackingId, 'failed');
      if (!late) setError(e instanceof Error ? e.message : String(e));
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  };

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };

  const buttonLabel = !selectedTool ? t('Open') : selectedTool.kind === 'print' ? t('Prepare the request')
    : selectedTool.kind === 'chat' ? t('Prepare for the web chat') : t('Open in {tool}', { tool: t(selectedTool.label).replace(/ \(.*\)$/, '') });
  // "Just show the request" and the web chat never open a program. The request itself is the result.
  const requestReady = Boolean(result && !error && !result.opened && result.prompt && (selectedTool?.kind === 'print' || selectedTool?.kind === 'chat'));

  useEffect(() => {
    if (result || error) outcomeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [result, error]);

  const questions: Record<StepKey, { title: string; hint: string }> = {
    activity: { title: t('What do you want to do?'), hint: t('Choose one.') },
    run: { title: t('Which activity do you want to continue?'), hint: t('These are the activities that are not finished yet.') },
    files: {
      title: current?.needsFiles ? t('Which files should the AI use?') : t('Should the AI use any file?'),
      hint: current?.needsFiles ? t('Choose at least one file from the project inbox.') : t('Optional — you can continue without files.'),
    },
    context: { title: t('Which context should the AI consider?'), hint: t('Your tags share these files from other projects. Uncheck what this activity should not use.') },
    agent: { title: t('Who should do it?'), hint: t('An agent is a specialist with its own instructions. If you are not sure, let the skill decide.') },
    details: { title: t('Anything else the AI should know?'), hint: t('Optional. Write it as you would tell a colleague.') },
    tool: { title: t('Which AI tool do you want to use?'), hint: t('Only the tools found on this computer can be chosen.') },
    review: { title: t('Everything ready'), hint: t('Check your answers. Click an answer to change it.') },
  };
  const q = questions[step];

  const agentLabel = agent || t('Let the skill decide');
  const summary: { step: StepKey; label: string; value: string }[] = preset?.startAtTool ? [
    { step: 'tool', label: t('AI tool'), value: selectedTool ? t(selectedTool.label) : '—' },
  ] : [
    { step: 'activity', label: t('Activity'), value: current ? t(current.label) : '—' },
    ...(resume ? [{ step: 'run' as StepKey, label: t('Continue'), value: run ? describeRun(run).title : '—' }] : [
      { step: 'files' as StepKey, label: t('Files'), value: files.length ? files.join(', ') : t('None') },
      ...(sharing ? [{ step: 'context' as StepKey, label: t('Shared context'), value: t('{n} of {total} files from other projects', { n: keptShared.length, total: sharedPaths.length })
        + (exclude.some((p) => choice.own.includes(p)) ? ` · ${t('{n} of this project left out', { n: exclude.filter((p) => choice.own.includes(p)).length })}` : '') }] : []),
      ...(agents.length && !fromPanel ? [{ step: 'agent' as StepKey, label: t('Who does it'), value: agentLabel }] : []),
    ]),
    { step: 'details', label: t('Notes'), value: note.trim() || t('None') },
    ...(resume ? [] : [{ step: 'details' as StepKey, label: t('Conversation language'), value: t(language) }]),
    ...(fromPanel ? [] : [{ step: 'tool' as StepKey, label: t('AI tool'), value: selectedTool ? t(selectedTool.label) : '—' }]),
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
        <header className="modal-head">
          <div>
            <p className="wizard-progress">{t('Open {project} in your AI tool · step {n} of {total}', { project: project.name, n: index + 1, total: steps.length })}</p>
            <h2 id="wizard-title">{q.title}</h2>
            <p className="muted small">{q.hint}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        <div className="wizard-bar"><span style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>

        <div className="modal-body">
          {step === 'activity' && (
            <div className="answer-list">
              {/* Only what can be done now: unavailable skills and an empty "resume" are hidden. */}
              {activities.filter((a) => a.available && (a.id !== 'resume' || runs.length > 0)).map((a) => {
                return (
                  <Answer key={a.id} title={t(a.label)} hint={t(a.hint)} on={activity === a.id}
                    onPick={() => {
                      if (a.target.kind === 'operation') { onOperation?.(a.target.name); return; }
                      setActivity(a.id);
                      if (a.id === 'resume') setRun((r) => (runs.some((x) => x.id === r) ? r : runs[0]?.id ?? ''));
                      setStep(a.id === 'resume' ? 'run' : 'files');
                    }} />
                );
              })}
            </div>
          )}

          {step === 'run' && (
            <div className="answer-list">
              {runs.map((r) => (
                <Answer key={r.id} title={describeRun(r.id).title} hint={`${describeRun(r.id).date}${r.currentStep ? ` · ${t('stopped at:')} ${r.currentStep}` : ''}`}
                  on={run === r.id} onPick={() => { setRun(r.id); next(); }} />
              ))}
            </div>
          )}

          {step === 'files' && (
            <>
              {!inbox.length ? (
                <div className="wizard-empty">
                  <p>{t('The project inbox is empty.')}</p>
                  <p className="muted small">{t('Click')} <strong>{t('Open inbox folder')}</strong>{t(', put the stories, logs or documents there, then click')} <strong>{t('Refresh')}</strong>. {t('Word files are converted to text automatically.')}</p>
                </div>
              ) : (
                <ul className="file-pick">
                  {inbox.map((f) => (
                    <li key={f.name}>
                      <label className={files.includes(f.name) ? 'on' : ''}>
                        <input type="checkbox" checked={files.includes(f.name)} onChange={() => setFiles((s) => (s.includes(f.name) ? s.filter((x) => x !== f.name) : [...s, f.name]))} />
                        <FileIcon name={f.name} size={16} />
                        <span className="file-name">{f.name}</span>
                        <span className="muted small">{formatSize(f.size)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void api.openFolder(project.id, 'inbox'); }}><IconFolder size={15} /> {t('Open inbox folder')}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={load}><IconRefresh size={15} /> {t('Refresh')}</button>
              </div>
            </>
          )}

          {step === 'context' && (
            <>
              {choice.own.length > 0 && (
                <div className="context-group">
                  <p className="answer-group">{t('This project')}</p>
                  <PathList paths={choice.own} exclude={exclude} onToggle={toggle} />
                </div>
              )}
              {choice.shared.map((g) => (
                <div key={g.tag.id} className="context-group">
                  <p className="answer-group"><TagChip tag={g.tag} /></p>
                  {g.sources.map((src) => (
                    <div key={src.project}>
                      <label className="context-source">
                        <input type="checkbox" checked={src.paths.some((p) => !exclude.includes(p))} disabled={!src.paths.length} onChange={() => toggle(src.paths)} />{' '}
                        {src.name} <span className="muted small">{src.whole ? t('whole project context') : t('tagged files')}</span>
                      </label>
                      {src.paths.length ? <PathList paths={src.paths} exclude={exclude} onToggle={toggle} />
                        : <p className="muted small">{t('Nothing to share yet: this project has no context files.')}</p>}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {step === 'agent' && (
            <div className="answer-list">
              <Answer title={t('Let the skill decide')} hint={t('Recommended if you are not sure.')} on={!agent} onPick={() => { setAgent(''); next(); }} />
              {suited.length > 0 && <p className="answer-group">{t('Suited to this activity')}</p>}
              {suited.map((a) => <Answer key={a.name} title={a.name} hint={a.description} on={agent === a.name} onPick={() => { setAgent(a.name); next(); }} />)}
              {others.length > 0 && <p className="answer-group">{t('Other agents in this project')}</p>}
              {others.map((a) => <Answer key={a.name} title={a.name} hint={a.description} on={agent === a.name} onPick={() => { setAgent(a.name); next(); }} />)}
            </div>
          )}

          {step === 'details' && (
            <>
              <textarea rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={current?.note || t('e.g. focus on permissions')} autoFocus />
              {!resume && (
                <label className="field inline">
                  <span className="label">{t('The AI should talk to me in')}</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>{languages.map((l) => <option key={l} value={l}>{t(l)}</option>)}</select>
                </label>
              )}
            </>
          )}

          {step === 'tool' && (
            <div className="answer-list">
              {installed.map((ai) => (
                <Answer key={ai.id} icon={KIND_ICON[ai.kind]} title={t(ai.label)} hint={kindHint(ai.kind)} on={tool === ai.id}
                  onPick={() => { setTool(ai.id); next(); }} />
              ))}
              {notInstalled.length > 0 && <p className="muted small">{t('Not found on this computer:')} {notInstalled.map((ai) => t(ai.label).replace(/ \(.*\)$/, '')).join(' · ')}
                {onMyAis && <> <button type="button" className="link" onClick={onMyAis}>{t('Install in Settings › My AIs')}</button></>}</p>}
            </div>
          )}

          {step === 'review' && (
            <>
              {(result || error) && (
                <div className={`result${error ? ' warn' : ''}`} role="status" ref={outcomeRef}>
                  {result?.opened && <p className="result-title"><IconCheck size={17} /> {result.message || t('The request is ready.')}</p>}
                  {error && <p className="result-title">{error}</p>}
                  {result && !result.opened && !error && selectedTool?.kind === 'print' && (
                    <p className="result-title"><IconCheck size={17} /> {t('The request is ready. Copy it below.')}</p>
                  )}
                  {result && !result.opened && !error && selectedTool?.kind === 'chat' && (
                    <>
                      <p className="result-title"><IconCheck size={17} /> {t('Ready for the web chat')}</p>
                      <p className="small">{t('Copy the request and upload these files to the chat')}{result.bundleReady ? '' : ` ${t('(run npm run bundle first to create the framework bundle)')}`}:</p>
                      <ul className="small upload-list">{result.upload?.map((u) => <li key={u}><code>{u}</code></li>)}</ul>
                    </>
                  )}
                  {result?.prompt && (
                    <div className="prompt-box">
                      <div className="prompt-head">
                        <span className="label">{t('Request')}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void copy(result.prompt); }}><IconCopy size={15} /> {copied ? t('Copied') : t('Copy')}</button>
                      </div>
                      <p className="prompt-text">{result.prompt}</p>
                    </div>
                  )}
                </div>
              )}
              <dl className="wizard-summary">
                {summary.map((s) => (
                  <button type="button" key={s.label} className="wizard-summary-row" onClick={() => { setResult(null); setError(''); setStep(s.step); }} title={t('Change')}>
                    <dt>{s.label}</dt><dd>{s.value}</dd>
                  </button>
                ))}
              </dl>
              {fromPanel && (
                <div className="wizard-picks">
                  {agents.length > 0 && <AgentPick label={t('Who does it')} agents={agents} value={agent} onChange={(name) => { setResult(null); setError(''); setAgent(name); }} optional />}
                  <AiPick label={t('AI tool')} tools={tools} value={tool} onChange={(id) => { setResult(null); setError(''); setTool(id); }} onInstall={onMyAis} />
                </div>
              )}
            </>
          )}
        </div>

        <footer className="modal-foot">
          {index > 0 && <button type="button" className="btn btn-ghost" onClick={back}>{t('Back')}</button>}
          <span className="wizard-spacer" />
          {step === 'files' && (
            <button type="button" className="btn" disabled={Boolean(current?.needsFiles) && !files.length} onClick={next}>
              {files.length ? t('Continue') : current?.needsFiles ? t('Choose a file to continue') : t('Continue without files')}
            </button>
          )}
          {step === 'context' && <button type="button" className="btn" onClick={next}>{t('Continue')}</button>}
          {step === 'details' && <button type="button" className="btn" onClick={next}>{note.trim() ? t('Continue') : t('Nothing else — continue')}</button>}
          {step === 'review' && (result?.opened || requestReady
            ? <button type="button" className="btn" onClick={onClose}>{t('Done')}</button>
            : <button type="button" className="btn" disabled={busy || !selectedTool} onClick={() => { void submit(); }}><IconPlay size={15} /> {busy ? t('Opening…') : buttonLabel}</button>)}
        </footer>
      </div>
    </div>
  );
}

// Files offered as context, checked unless left out. Paths are shown without the workspace/projects/<id>/ prefix.
function PathList({ paths, exclude, onToggle }: { paths: string[]; exclude: string[]; onToggle: (paths: string[]) => void }) {
  return (
    <ul className="file-pick">
      {paths.map((p) => (
        <li key={p}>
          <label className={exclude.includes(p) ? '' : 'on'}>
            <input type="checkbox" checked={!exclude.includes(p)} onChange={() => onToggle([p])} />
            <FileIcon name={p} size={16} />
            <span className="file-name" title={p}>{p.replace(/^workspace\/projects\/[^/]+\//, '')}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Answer({ title, hint, on, disabled, icon, onPick }: { title: string; hint: string; on: boolean; disabled?: boolean; icon?: ReactNode; onPick: () => void }) {
  return (
    <button type="button" className={`answer${on ? ' on' : ''}`} disabled={disabled} onClick={onPick}>
      {icon && <span className="answer-icon">{icon}</span>}
      <span className="answer-text">
        <span className="answer-title">{title}</span>
        <span className="answer-hint">{hint}</span>
      </span>
    </button>
  );
}
