// Settings › My AIs: every AI tool Moki can open that runs in a terminal or an editor,
// with where it is and its version, the default AI (where activities start; choosing
// another one for an activity does not change it), installing a missing terminal tool
// (a terminal tab runs the vendor's command after the person types y, desktop/run-tool.ts)
// and, in the editors that take it, installing the Moki extension and opening the editor.
// Each card shows its main action as an icon; the others are in its "…" menu.
// The activity flow only picks among them (ToolCatalog).

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { api, type AiToolStatus, type ProjectSummary, type TerminalRef, type ToolInfo } from '../api';
import { t } from '../i18n';
import { defaultTool, setDefaultTool } from '../prefs';
import { CatIcon } from './CatIcon';
import { IconCheck, IconDownload, IconExternal, IconMore, IconProgress, IconRefresh, IconStar } from './Icons';
import { ListHead } from './ListPage';

interface Props {
  tools: ToolInfo[];
  project: ProjectSummary | null; // where an installing terminal tab opens
  onTerminal: (terminal: TerminalRef) => void;
  onToolsChanged: () => void; // the app reads the tool list again (something was installed)
}

// primary: installing or updating, shown on the card as its icon; every action is in the menu.
interface Action { label: string; icon: ReactNode; run: () => void; primary?: boolean }

const QUICK = ['terminal', 'editor'];
const MENU_WIDTH = 280;
const toolName = (tool: ToolInfo) => t(tool.label).replace(/ \(.*\)$/, '');

export function AiToolsPage({ tools, project, onTerminal, onToolsChanged }: Props) {
  const [status, setStatus] = useState<Record<string, AiToolStatus> | null>(null);
  const [version, setVersion] = useState('');
  const [chosen, setChosen] = useState(defaultTool);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [menu, setMenu] = useState<{ id: string; left: number; top: number } | null>(null);

  const check = useCallback(() => {
    setStatus(null);
    api.aiTools()
      .then((list) => { setStatus(Object.fromEntries(list.map((s) => [s.id, s]))); onToolsChanged(); })
      .catch((e: Error) => { setStatus({}); setError(e.message); });
  }, [onToolsChanged]);
  useEffect(check, [check]);
  useEffect(() => { api.session().then((s) => setVersion(s.version)).catch(() => setVersion('')); }, []);

  const list = tools.filter((x) => QUICK.includes(x.kind));
  const available = (tool: ToolInfo) => status?.[tool.id]?.available ?? tool.available;
  // The default: the one chosen here when it is installed, otherwise the first installed (as the activities do).
  const current = list.find((x) => x.id === chosen && available(x)) ?? list.find(available);

  const makeDefault = (id: string) => { setDefaultTool(id); setChosen(id); setInfo(''); };

  const install = (tool: ToolInfo) => {
    setError(''); setInfo('');
    const bridge = api.term();
    if (!bridge || !project) { setError(t('Installing opens a terminal tab of a project: create a project first.')); return; }
    bridge.create(tool.id)
      .then((r) => (r.terminal ? onTerminal(r.terminal) : setError(r.error ?? t('Could not open the terminal.'))))
      .catch((e: Error) => setError(e.message));
  };

  const installExtension = async (tool: ToolInfo) => {
    setBusy(tool.id); setError(''); setInfo('');
    try {
      const r = await api.installMokiExtension(tool.id, project?.id);
      setInfo(t('Moki extension {version} installed in {tool}. It opened on {folder}.', { version: r.version || version, tool: toolName(tool), folder: r.folder }));
      check();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };

  // The card's actions, for its icon (the primary one) and its menu.
  const actions = (tool: ToolInfo): Action[] => {
    const s = status?.[tool.id];
    const found = available(tool);
    const out: Action[] = [];
    if (!found && tool.kind === 'terminal' && tool.installable) out.push({ label: t('Install'), icon: <IconDownload size={16} />, run: () => install(tool), primary: true });
    if (!found && tool.kind === 'editor' && tool.download) out.push({ label: t('Download {tool}', { tool: toolName(tool) }), icon: <IconExternal size={16} />, run: () => { void api.openLink(tool.download!); }, primary: true });
    if (found && tool.mokiExtension && s) {
      const outdated = Boolean(s.extension && version && s.extension !== version);
      out.push(!s.extension
        ? { label: t('Install the Moki extension and open'), icon: <IconDownload size={16} />, run: () => { void installExtension(tool); }, primary: true }
        : outdated
          ? { label: t('Update the Moki extension and open'), icon: <IconRefresh size={16} />, run: () => { void installExtension(tool); }, primary: true }
          : { label: t('Reinstall the Moki extension and open'), icon: <IconRefresh size={16} />, run: () => { void installExtension(tool); } });
    }
    if (found && current?.id !== tool.id) out.push({ label: t('Make default'), icon: <IconStar size={16} />, run: () => makeDefault(tool.id) });
    if (!found && tool.docs) out.push({ label: t('How to install'), icon: <IconExternal size={16} />, run: () => { void api.openLink(tool.docs!); } });
    return out;
  };

  const openMenu = (id: string, e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ id, left: Math.max(8, r.right - MENU_WIDTH), top: r.bottom + 4 });
  };
  const menuTool = menu ? list.find((x) => x.id === menu.id) : undefined;

  return (
    <div className="list-page ai-tools">
      <ListHead title={t('My AIs')} intro={t('Where each AI is and which one activities start in.')}
        action={<button type="button" className="btn btn-ghost" disabled={status === null} onClick={check}><IconRefresh size={15} /> {status === null ? t('Checking…') : t('Check again')}</button>} />
      {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
      {info && <div className="result" role="status"><p className="result-title">{info}</p></div>}
      <ul className="ai-grid">
        {list.map((tool) => {
          const s = status?.[tool.id];
          const found = available(tool);
          const editor = tool.kind === 'editor';
          const outdated = Boolean(s?.extension && version && s.extension !== version);
          const all = actions(tool);
          const iconAction = all.find((a) => a.primary);
          return (
            <li key={tool.id} className={`ai-card${current?.id === tool.id ? ' on' : ''}${found ? '' : ' missing'}`}>
              <span className="ai-emblem" aria-hidden="true"><CatIcon id={editor ? 'code' : 'terminal'} size={56} /></span>
              <span className="ai-body">
                <span className="ai-name">
                  {toolName(tool)}
                  {current?.id === tool.id && <span className="catalog-tag" title={t('Activities start here. To change it, choose Make default in the … of another AI.')}>{t('Default')}</span>}
                  {tool.mokiExtension === 'unverified' && <span className="catalog-tag muted-tag" title={t('The Moki extension is made and tested for VS Code; here it was not verified.')}>{t('Not verified')}</span>}
                </span>
                <span className="ai-meta" title={s?.path || undefined}>
                  {editor ? t('Editor') : t('Terminal')} · {found ? (s ? (s.version || tool.command) : t('Checking…')) : t('Not installed')}
                </span>
                {editor && found && s && tool.mokiExtension && (() => {
                  const text = !s.extension ? t('Moki extension not installed')
                    : outdated ? t('Moki extension {version} → {latest}', { version: s.extension, latest: version }) : t('Moki extension {version}', { version: s.extension });
                  return <span className={`ai-ext${outdated || !s.extension ? ' pending' : ''}`} title={text}>{s.extension && !outdated && <IconCheck size={13} />}<span>{text}</span></span>;
                })()}
              </span>
              <span className="ai-side">
                {iconAction && (
                  <button type="button" className="icon-btn ai-main" disabled={busy !== ''} onClick={iconAction.run} title={iconAction.label} aria-label={iconAction.label}>
                    {busy === tool.id ? <IconProgress size={16} /> : iconAction.icon}
                  </button>
                )}
                {all.length > 0 && ( // the default AI, installed and up to date, has nothing more to offer: no empty menu
                  <button type="button" className="icon-btn" onClick={(e) => openMenu(tool.id, e)} title={t('More options for {tool}', { tool: toolName(tool) })}
                    aria-label={t('More options for {tool}', { tool: toolName(tool) })} aria-haspopup="menu"><IconMore size={16} /></button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">{t('Installing opens a terminal tab with the official command; it runs only after you type y.')}</p>
      {menu && menuTool && (
        <div className="menu-backdrop" onMouseDown={() => setMenu(null)}>
          <ul className="term-menu" role="menu" style={{ left: menu.left, top: menu.top, minWidth: MENU_WIDTH }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setMenu(null); }}>
            {actions(menuTool).map((a, i) => (
              <li key={a.label}><button type="button" role="menuitem" autoFocus={i === 0} disabled={busy !== ''} onClick={() => { setMenu(null); a.run(); }}>{a.icon} {a.label}</button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
