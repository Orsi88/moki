// Moki light: the panel of the VS Code extension. Four tabs over the project the
// IDE is connected to — start an activity, use one of the project's agents, choose
// what goes to the AI, and follow the open runs — with the app's look (cats, cards,
// pills). Starting opens Claude Code in a terminal of the IDE with the request and the
// project's MCP servers; "Copy for the chat" copies the same request for the IDE's chat.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { describeRun, statusLabel, type ActivityInfo, type AgentInfo, type InboxFile, type LaunchResult, type OpenRun, type OperationRun } from '../api';
import { conversationLanguage, t } from '../i18n';
import { remember } from '../prefs';
import { ACTIVITY_CAT } from '../icons/cats';
import { CatIcon } from '../components/CatIcon';
import { IconCopy, IconMcp, IconPlay, IconRefresh, IconStar } from '../components/Icons';
import { call } from './bridge';

type Tab = 'activities' | 'agents' | 'context' | 'runs';
interface State { project: { id: string; name: string; description: string; repository: string } | null; projects: { id: string; name: string }[]; folder: string | null; mcp: { id: string; name: string; access: string; transport: string }[] }
interface ContextFile { id: string; path: string; title: string; description: string; kind: string; source: string; included: boolean; priority: boolean }
interface Launch { activity: string; run?: string; agent?: string; needsFiles?: boolean; key: string }

export function CompanionApp() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>('activities');
  const [activities, setActivities] = useState<ActivityInfo[]>([]);
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [inbox, setInbox] = useState<InboxFile[]>([]);
  const [runs, setRuns] = useState<OpenRun[]>([]);
  const [operations, setOperations] = useState<OperationRun[]>([]);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [open, setOpen] = useState<string>(''); // the card whose launch options are showing
  const [notice, setNotice] = useState<{ text: string; warn?: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);

  const fail = (e: unknown) => setNotice({ text: e instanceof Error ? e.message : String(e), warn: true });
  const load = useCallback(() => {
    call<State>('state').then((s) => {
      setState(s);
      if (!s.project) return;
      call<{ activities: ActivityInfo[]; languages: string[] }>('activities').then((a) => { setActivities(a.activities); setLanguages(a.languages); }).catch(fail);
      call<AgentInfo[]>('agents').then(setAgents).catch(fail);
      call<InboxFile[]>('inbox').then(setInbox).catch(() => setInbox([]));
      call<OpenRun[]>('openRuns').then(setRuns).catch(() => setRuns([]));
      call<OperationRun[]>('operationRuns').then(setOperations).catch(() => setOperations([]));
      call<ContextFile[]>('context').then(setFiles).catch(fail);
    }).catch(fail);
  }, []);
  useEffect(() => { load(); return window.qa?.onChanged(() => load()); }, [load]);

  const choose = (id: string) => { setOpen(''); setNotice(null); call('chooseProject', id).then(load).catch(fail); };
  const connect = () => {
    setConnecting(true);
    call<{ changed: boolean; cancelled: boolean; file: string }>('connectClaude')
      .then((r) => { if (!r.cancelled) setNotice({ text: r.changed ? t('Claude Code connected: {file}', { file: r.file }) : t('Claude Code already had Moki\'s servers.') }); })
      .catch(fail).finally(() => setConnecting(false));
  };

  if (!state) return <div className="mk"><p className="mk-empty muted">{t('Loading…')}</p></div>;

  const header = (
    <header className="mk-head">
      {/* The view's title already says Moki: here only whether a project is connected, and which. */}
      <span className={`mk-dot${state.project ? ' on' : ''}`} role="img"
        aria-label={state.project ? t('Connected') : t('No project')} title={state.project ? t('Connected') : t('No project')} />
      <select value={state.project?.id ?? ''} onChange={(e) => choose(e.target.value)} aria-label={t('Project')}>
        {!state.project && <option value="">{t('Choose a project')}</option>}
        {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </header>
  );

  if (!state.project) {
    return (
      <div className="mk">
        {header}
        <div className="mk-empty">
          <CatIcon id="question" size={72} />
          <p><strong>{t('This folder is not linked to a Moki project.')}</strong></p>
          <p className="muted small">{state.projects.length
            ? t('Choose a project above. To link this folder for good, use Choose my folder in the Moki app.')
            : t('There are no projects in the active workspace yet. Create one in the Moki app.')}</p>
        </div>
      </div>
    );
  }

  const included = files.filter((f) => f.included).length;
  const openCount = runs.length + operations.filter((o) => !['completed', 'cancelled'].includes(o.status)).length;
  const toggle = (key: string) => { setOpen((o) => (o === key ? '' : key)); setNotice(null); };
  const launchBox = (l: Launch) => open === l.key && (
    <LaunchBox launch={l} inbox={inbox} languages={languages} agents={l.agent || l.run ? [] : agents.filter((a) => !l.activity || a.skills.includes(activities.find((x) => x.id === l.activity)?.skill ?? ''))}
      onDone={(text, warn) => setNotice({ text, warn })} />
  );

  return (
    <div className="mk">
      {header}
      <div className="dialog-tabs mk-tabs" role="tablist">
        {([['activities', t('Activities')], ['agents', t('Agents')], ['context', t('Context')], ['runs', t('Runs')]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`dialog-tab${tab === id ? ' on' : ''}`} onClick={() => { setTab(id); setOpen(''); }}>
            {label}{id === 'runs' && openCount > 0 && <span className="mk-count">{openCount}</span>}
          </button>
        ))}
      </div>

      <main className="mk-body">
        {notice && <div className={`result${notice.warn ? ' warn' : ''}`} role="status"><p className="result-title">{notice.text}</p></div>}

        {tab === 'activities' && (
          <div className="mk-list">
            {activities.filter((a) => a.available && a.id !== 'resume').map((a) => (
              <Card key={a.id} on={open === a.id} icon={<CatIcon id={ACTIVITY_CAT[a.id] ?? 'puzzle'} size={40} />} title={t(a.label)} hint={t(a.hint)} onPick={() => toggle(a.id)}>
                {launchBox({ key: a.id, activity: a.id, needsFiles: a.needsFiles })}
              </Card>
            ))}
          </div>
        )}

        {tab === 'agents' && (
          <div className="mk-list">
            {!agents.length && <p className="muted small">{t('No agents are enabled in this project. Choose them in the Moki app (Set up project).')}</p>}
            {agents.map((a) => (
              <Card key={a.name} on={open === `agent:${a.name}`} icon={<CatIcon id="robot" size={40} />} title={a.name} hint={a.description} onPick={() => toggle(`agent:${a.name}`)}
                chips={a.skills}>
                {launchBox({ key: `agent:${a.name}`, activity: 'open', agent: a.name })}
              </Card>
            ))}
          </div>
        )}

        {tab === 'context' && (
          <ContextTab files={files} included={included} onChange={setFiles} onError={fail}
            onPrepare={() => {
              // The activity that writes the context: planning with the AI for a blank project, else preparing or updating it.
              const id = ['plan', 'setup', 'context'].find((a) => activities.some((x) => x.id === a && x.available));
              setTab('activities'); setOpen(id ?? '');
            }} />
        )}

        {tab === 'runs' && (
          <div className="mk-list">
            {!runs.length && !operations.length && <p className="muted small">{t('Nothing in progress in this project.')}</p>}
            {runs.length > 0 && <h3 className="mk-section">{t('Activities to resume')}</h3>}
            {runs.map((r) => (
              <Card key={r.id} on={open === `run:${r.id}`} icon={<CatIcon id="run" size={40} />} title={describeRun(r.id).title}
                hint={`${describeRun(r.id).date}${r.currentStep ? ` · ${t('stopped at:')} ${r.currentStep}` : ''}`} pill={statusLabel(r.status)} onPick={() => toggle(`run:${r.id}`)}>
                {launchBox({ key: `run:${r.id}`, activity: 'resume', run: r.id })}
              </Card>
            ))}
            {operations.length > 0 && <h3 className="mk-section">{t('Operations')}</h3>}
            {operations.map((o) => (
              <Card key={o.id} on={false} icon={<CatIcon id="flow" size={40} />} title={o.operation.name}
                hint={o.currentStep ? `${t('Step')}: ${o.steps.find((s) => o.currentStep.startsWith(s.id))?.name ?? o.currentStep}` : describeRun(o.id).date} pill={statusLabel(o.status)} />
            ))}
            {operations.length > 0 && <p className="muted small">{t('Operations are run step by step in the Moki app.')}</p>}
          </div>
        )}
      </main>

      <footer className="mk-foot">
        <span className="mk-mcp" title={state.mcp.map((m) => m.name).join(', ')}><IconMcp size={14} /> {t('MCPs: {n} on', { n: state.mcp.length })}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={connecting} onClick={connect} title={t('Writes Moki\'s MCP servers to this folder\'s .mcp.json, which Claude Code in the IDE reads.')}>{t('Connect Claude Code')}</button>
        <button type="button" className="icon-btn" onClick={load} title={t('Refresh')} aria-label={t('Refresh')}><IconRefresh size={14} /></button>
      </footer>
    </div>
  );
}

function Card({ on, icon, title, hint, pill, chips, onPick, children }: { on: boolean; icon: ReactNode; title: string; hint: string; pill?: string; chips?: string[]; onPick?: () => void; children?: ReactNode }) {
  return (
    <div className={`mk-card${on ? ' on' : ''}`}>
      <button type="button" className="mk-card-head" onClick={onPick} disabled={!onPick} aria-expanded={onPick ? on : undefined}>
        <span className="mk-card-icon">{icon}</span>
        <span className="mk-card-text">
          <span className="mk-card-title">{title}</span>
          {pill && <span className="pill mk-pill">{pill}</span>}
          {hint && <span className="mk-card-hint">{hint}</span>}
          {chips && chips.length > 0 && <span className="mk-chips">{chips.map((c) => <span key={c} className="mk-chip">{c}</span>)}</span>}
        </span>
      </button>
      {children}
    </div>
  );
}

// What the request needs before it goes: inbox files, an agent, a note and the language; then Claude Code or the chat.
function LaunchBox({ launch, inbox, languages, agents, onDone }: { launch: Launch; inbox: InboxFile[]; languages: string[]; agents: AgentInfo[]; onDone: (text: string, warn?: boolean) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [agent, setAgent] = useState(launch.agent ?? '');
  const [note, setNote] = useState('');
  const [language, setLanguage] = useState(conversationLanguage);
  const [busy, setBusy] = useState(false);
  const missingFiles = Boolean(launch.needsFiles && !picked.length);
  const input = { activity: launch.activity, run: launch.run, agent: agent || undefined, files: picked, note, language };

  const go = async (where: 'terminal' | 'chat') => {
    setBusy(true);
    remember('qa-language', language);
    try {
      if (where === 'terminal') {
        const r = await call<LaunchResult>('launch', input);
        onDone(r.message ?? (r.opened ? t('Claude Code is opening in a terminal.') : t('Claude Code could not open.')), !r.opened);
      } else {
        const r = await call<{ chat: string }>('copyRequest', input);
        onDone(r.chat ? t('Request copied. Paste it in {chat}.', { chat: r.chat }) : t('Request copied. Paste it in the chat of your AI.'));
      }
    } catch (e) { onDone(e instanceof Error ? e.message : String(e), true); } finally { setBusy(false); }
  };

  return (
    <div className="mk-launch">
      {(launch.needsFiles || (inbox.length > 0 && !launch.run)) && (
        <div className="field">
          <span className="label">{launch.needsFiles ? t('Files from the inbox') : t('Files from the inbox (optional)')}</span>
          {inbox.length ? (
            <ul className="mk-files">
              {inbox.map((f) => (
                <li key={f.name}><label><input type="checkbox" checked={picked.includes(f.name)} onChange={() => setPicked((p) => (p.includes(f.name) ? p.filter((x) => x !== f.name) : [...p, f.name]))} /> <span title={f.name}>{f.name}</span></label></li>
              ))}
            </ul>
          ) : <span className="muted small">{t('The project inbox is empty: put the stories, logs or documents in its inbox folder.')}</span>}
        </div>
      )}
      {agents.length > 0 && (
        <label className="field"><span className="label">{t('Agent (optional)')}</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">{t('No agent')}</option>
            {agents.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span className="label">{t('Note (optional)')}</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Anything the AI should know')} />
      </label>
      <label className="field"><span className="label">{t('Language')}</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>{languages.map((l) => <option key={l} value={l}>{t(l)}</option>)}</select>
      </label>
      <div className="mk-actions">
        <button type="button" className="btn" disabled={busy || missingFiles} onClick={() => { void go('terminal'); }}><IconPlay size={14} /> {t('Open in Claude Code')}</button>
        <button type="button" className="btn btn-ghost" disabled={busy || missingFiles} onClick={() => { void go('chat'); }}><IconCopy size={14} /> {t('Copy for the chat')}</button>
      </div>
      {missingFiles && <span className="muted small">{t('Choose at least one file.')}</span>}
    </div>
  );
}

function ContextTab({ files, included, onChange, onError, onPrepare }: { files: ContextFile[]; included: number; onChange: (f: ContextFile[]) => void; onError: (e: unknown) => void; onPrepare: () => void }) {
  const groups = useMemo(() => ([
    ['context', t('Project context')], ['note', t('Notes')], ['shared', t('Shared by tags')],
  ] as const).map(([kind, label]) => ({ kind, label, items: files.filter((f) => f.kind === kind) })).filter((g) => g.items.length), [files]);
  const set = (method: string, id: string, on: boolean) => call<ContextFile[]>(method, id, on).then(onChange).catch(onError);
  if (!files.length) {
    return (
      <div className="mk-empty mk-empty-inline">
        <CatIcon id="reading" size={64} />
        <p><strong>{t('This project has no context yet.')}</strong></p>
        <p className="muted small">{t('It was created blank, or its context was never prepared. The AI writes it from the project\'s description and the documents in its inbox; then the files show up here.')}</p>
        <button type="button" className="btn" onClick={onPrepare}>{t('Prepare the context with the AI')}</button>
      </div>
    );
  }
  return (
    <div className="mk-list">
      <p className="mk-summary"><strong>{t('{n} of {total} files go to the AI', { n: included, total: files.length })}</strong></p>
      <p className="muted small">{t('Switched off, a file stays out of the requests and of what the AI can read. The star gives it to the AI first.')}</p>
      {groups.map((g) => (
        <section key={g.kind}>
          <h3 className="mk-section">{g.label}</h3>
          <ul className="mk-ctx">
            {g.items.map((f) => (
              <li key={f.id} className={f.included ? '' : 'off'}>
                <label className="mk-switch" title={f.included ? t('Goes to the AI') : t('Left out')}>
                  <input type="checkbox" checked={f.included} onChange={(e) => set('setIncluded', f.id, e.target.checked)} />
                  <span className="mk-switch-track" />
                </label>
                <span className="mk-ctx-text">
                  <span className="mk-ctx-name" title={f.id}>{g.kind === 'shared' ? f.title : f.path}</span>
                  {f.description && <span className="mk-card-hint">{f.description}</span>}
                </span>
                <button type="button" className={`icon-btn${f.priority ? ' accent' : ''}`} onClick={() => set('setPriority', f.id, !f.priority)}
                  title={f.priority ? t('Priority: the AI reads it first') : t('Make it a priority')} aria-pressed={f.priority}><IconStar size={14} /></button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

