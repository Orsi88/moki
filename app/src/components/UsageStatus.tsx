// Status bar numbers, as in Orca: how much of each AI plan is used (Usage popover), and the
// memory of Moki and, apart, of the terminals of each project with the AI tools they run
// (Resource Manager) (desktop/usage.ts). The two are never added into one number: the AI tools
// are not Moki, and they usually use most of the memory.

import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, type TerminalRef, type Usage } from '../api';
import { t } from '../i18n';
import { IconChevron, IconMemory, IconRefresh, IconTerminal } from './Icons';

const size = (bytes: number): string => (bytes >= 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(2)} GB` : `${(bytes / 2 ** 20).toFixed(1)} MB`);

// Time until a limit resets: "4h 37m", "23d 1h".
const left = (at: number | null): string => {
  const min = at === null ? 0 : Math.floor((at - Date.now()) / 60_000);
  if (min <= 0) return '';
  const d = Math.floor(min / 1440), h = Math.floor(min / 60) % 24, m = min % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

type Memory = Usage['memory'];
type ProcessKind = Memory['app']['processes'][number]['kind'];
const KIND_LABEL: Record<ProcessKind, string> = {
  main: 'Main process', window: 'Main window', notes: 'Notes windows', search: 'Search window', gpu: 'Graphics (GPU)', other: 'Other Chromium processes',
};
const METRIC: Record<Memory['metric'], { label: string; help: string }> = {
  pss: { label: 'PSS', help: 'PSS: memory shared between processes is split among them, so the numbers add up without counting it twice.' },
  private: { label: 'Private', help: 'Private bytes: memory used only by that process.' },
  rss: { label: 'RSS', help: 'RSS: resident memory; memory shared between processes is counted in each one.' },
};
const MOKI = '\0moki'; // keys of the two groups in the collapsed set (project ids are never like these)
const TOOLS = '\0tools';

const Bar = ({ percent }: { percent: number }) => (
  <span className={`usage-bar${percent >= 80 ? ' high' : ''}`}><span style={{ width: `${percent}%` }} /></span>
);

// names: project id -> name. terminals: the open terminal tabs (for their titles); onTerminal shows one.
export function UsageStatus({ names, terminals = [], onTerminal }: { names: Record<string, string>; terminals?: TerminalRef[]; onTerminal?: (id: string) => void }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [open, setOpen] = useState<'plans' | 'memory' | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set()); // collapsed projects in the Resource Manager
  const load = useCallback((refresh = false) => { api.usage(refresh).then(setUsage, () => {}); }, []);
  // Every 5 s while the window is on screen: each look lists the processes, so a hidden window does not ask.
  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 5000);
    const onShow = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [load]);
  if (!usage) return null;
  const { plans, memory } = usage;
  const sessions = memory.projects.reduce((n, p) => n + p.sessions.length, 0);
  const toggle = (id: string) => setClosed((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  const refresh = (
    <button type="button" className="icon-btn usage-refresh" onClick={() => load(true)} title={t('Refresh')} aria-label={t('Refresh')}><IconRefresh size={14} /></button>
  );

  return (
    <>
      {plans.length > 0 && (
        <button type="button" className="usage-trigger" onClick={() => setOpen(open === 'plans' ? null : 'plans')} title={t('Plan usage of the AI tools')}>
          {plans.map((p) => (
            <span key={p.tool} className="usage-plan">
              <strong>{p.label}</strong>
              {p.error ? <span className="warn-text">{t('unavailable')}</span> : p.windows.map((w, i) => (
                <span key={w.label}>
                  {i > 0 && <span className="usage-sep">·</span>}
                  {i === 0 && <Bar percent={w.percent} />}
                  {t('{percent}% used', { percent: Math.round(w.percent) })} {left(w.resetsAt)}
                </span>
              ))}
            </span>
          ))}
        </button>
      )}
      <button type="button" className="usage-trigger" onClick={() => setOpen(open === 'memory' ? null : 'memory')} title={t('Memory of Moki and, apart, of the terminals and AI tools of each project')}>
        <IconMemory size={13} /> Moki {size(memory.app.bytes)}
        <span className="usage-sep">·</span>
        <IconTerminal size={13} /> {sessions ? <>{t('AI')} {size(memory.tools)} ({sessions})</> : 0}
      </button>
      {open && (
        <div className="menu-backdrop" onMouseDown={() => setOpen(null)}>
          {open === 'plans' ? (
            <div className="usage-pop" role="dialog" aria-label={t('Usage')} onMouseDown={(e) => e.stopPropagation()}>
              <header className="usage-pop-head"><strong>{t('Usage')}</strong>{refresh}</header>
              {plans.map((p) => {
                const reset = left(p.windows.find((w) => w.resetsAt)?.resetsAt ?? null);
                return (
                  <section key={p.tool} className="usage-card" title={p.windows.map((w) => w.resetsAt ? `${w.label}: ${t('resets {when}', { when: new Date(w.resetsAt).toLocaleString() })}` : '').filter(Boolean).join('\n')}>
                    <div className="usage-card-title"><strong>{p.label}</strong>{reset && <span className="muted">{t('Resets in {when}', { when: reset })}</span>}</div>
                    {p.error ? <p className="warn-text small">{t(p.error)}</p> : (
                      <div className="usage-card-windows">
                        {p.windows.map((w) => (
                          <span key={w.label}><span className="muted">{w.label}</span> <Bar percent={w.percent} /> <strong>{Math.round(w.percent)}%</strong></span>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="usage-pop" role="dialog" aria-label={t('Resource Manager')} onMouseDown={(e) => e.stopPropagation()}>
              <header className="usage-pop-head"><IconMemory size={14} /><strong>{t('Resource Manager')}</strong>{refresh}</header>
              <div className="usage-total">
                <strong>Moki {size(memory.app.bytes)}</strong>
                <span className="muted">· {t('AI')} {size(memory.tools)}</span>
                <span className="muted usage-computer">{t('Computer')} {size(memory.used)} / {size(memory.total)} ({Math.round((memory.used / memory.total) * 100)}%)</span>
              </div>
              <table>
                <thead><tr><th>{t('Name')}</th><td title={t(METRIC[memory.metric].help)}>{METRIC[memory.metric].label}</td></tr></thead>
                <tbody>
                  <Group id={MOKI} label="Moki" bytes={memory.app.bytes} shut={closed.has(MOKI)} onToggle={toggle} />
                  {!closed.has(MOKI) && memory.app.processes.map((p) => (
                    <tr key={p.kind} className="usage-sub"><th>{t(KIND_LABEL[p.kind])}{p.count > 1 ? ` (${p.count})` : ''}</th><td>{size(p.bytes)}</td></tr>
                  ))}
                  <Group id={TOOLS} label={t('Terminals and AI tools')} bytes={memory.tools} shut={closed.has(TOOLS)} onToggle={toggle} />
                  {!closed.has(TOOLS) && memory.projects.map((p) => {
                    const shut = closed.has(p.project);
                    return (
                      <Fragment key={p.project}>
                        <tr className="usage-project">
                          <th>
                            <button type="button" onClick={() => toggle(p.project)} aria-expanded={!shut}>
                              <span className={`usage-twisty${shut ? '' : ' open'}`}><IconChevron size={12} /></span>
                              {names[p.project] ?? (p.project || t('Other terminals'))}
                            </button>
                          </th>
                          <td>{size(p.bytes)}</td>
                        </tr>
                        {!shut && p.sessions.map((s) => {
                          const title = terminals.find((x) => x.id === s.id)?.title ?? t('Terminal');
                          return (
                            <tr key={s.id} className="usage-session">
                              <th>
                                <span className="usage-dot" />
                                {onTerminal ? <button type="button" onClick={() => { setOpen(null); onTerminal(s.id); }} title={t('Show this terminal')}>{title}</button> : title}
                              </th>
                              <td>{size(s.bytes)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!memory.projects.length && <p className="muted small">{t('No terminal is running in a project.')}</p>}
              <p className="muted small">{t(METRIC[memory.metric].help)}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// A group row of the Resource Manager (Moki, or the terminals and AI tools), with its total.
function Group({ id, label, bytes, shut, onToggle }: { id: string; label: string; bytes: number; shut: boolean; onToggle: (id: string) => void }) {
  return (
    <tr className="usage-group">
      <th>
        <button type="button" onClick={() => onToggle(id)} aria-expanded={!shut}>
          <span className={`usage-twisty${shut ? '' : ' open'}`}><IconChevron size={12} /></span>
          {label}
        </button>
      </th>
      <td>{size(bytes)}</td>
    </tr>
  );
}
