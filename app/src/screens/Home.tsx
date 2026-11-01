// Start screen: pick a project (system under test) or create one — like
// Obsidian's vault switcher.

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { api, type ProjectSummary, type Starter, type Tag, type TerminalRef, type ToolInfo, type WorkspaceInfo } from '../api';
import { recall, remember } from '../prefs';
import { t } from '../i18n';
import { StartPrefs } from '../components/PrefsCorner';
import { AddButton } from '../components/AddButton';
import { TagPicker } from '../components/TagPicker';
import { SearchPanel } from '../components/SearchPanel';
import { DeleteProjectDialog } from '../components/DeleteProjectDialog';
import { IconCheck, IconChevron, IconExternal, IconEye, IconEyeOff, IconOpenProject, IconPin, IconStar, IconTrash, IconX } from '../components/Icons';
import { NoteDialog } from '../components/NoteDialog';
import { favoriteLooseIds, favoriteNotes, forgetNote, forgetProject, hiddenIds, hideProject, looseNotes, type NoteRef, noteTitle, pinnedIds, recentNotes, removeLooseNote, setFavorite, showProject, togglePin } from '../side-menu';
import { Settings, type SettingsTab } from './Settings';

interface Props {
  projects: ProjectSummary[];
  tools: ToolInfo[];
  version: string;
  onOpen: (id: string) => void;
  onCreate: (name: string, starter: Starter, folder?: string, tags?: string[]) => Promise<void>;
  settings: SettingsTab | null;
  onSettings: (tab: SettingsTab | null) => void;
  onBack?: () => void;
  backLabel?: string;
  project: ProjectSummary | null;
  onTerminal: (terminal: TerminalRef, projectId: string) => void;
  workspace?: WorkspaceInfo | null; // the open workspace, switched at the bottom of the list
  onWorkspace?: (workspace: WorkspaceInfo | null) => void; // null: back to the workspace picker
  search?: boolean; // the search panel in place of the list
  onSearch?: () => void;
  onFound?: (project: string, path?: string) => void;
  onDeleted?: () => void; // a project was deleted for good: reload the list
}

const onboarding = (status: string): string => ({
  'not-started': t('Context not started'), partial: t('Context in progress'), complete: t('Context complete'),
} as Record<string, string>)[status] ?? status;

interface MenuItem { label: string; icon: ReactNode; run: () => void; danger?: boolean }

export function Home({ projects, tools, version, onOpen, onCreate, settings, onSettings, onBack, backLabel, project, onTerminal, workspace, onWorkspace, search = false, onSearch, onFound, onDeleted }: Props) {
  const [switching, setSwitching] = useState<WorkspaceInfo[] | null>(null); // the workspace menu, open
  const openSwitcher = () => { api.workspaces().then((r) => setSwitching(r.list)).catch(() => setSwitching([])); };
  const switchTo = (w: WorkspaceInfo) => {
    setSwitching(null);
    if (w.id === workspace?.id) return;
    api.selectWorkspace(w.id).then((opened) => onWorkspace?.(opened)).catch((e: Error) => setError(e.message));
  };
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(''); // an existing folder to link, from "Link an existing folder"
  const [starter, setStarter] = useState<Starter>(recall('qa-starter') === 'blank' ? 'blank' : 'qa'); // the last choice is the default
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pins, setPins] = useState<string[]>(pinnedIds);
  const [hidden, setHidden] = useState<string[]>(hiddenIds);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  // A note opened here, inside the app ({ loose: null }: a new loose note). The icon beside it opens the notebook window.
  const [openNote, setOpenNote] = useState<NoteRef | { loose: null } | null>(null);
  // The actions of a row (pin, hide, open in the notebook, delete…) show only on a right click.
  const [rowMenu, setRowMenu] = useState<{ left: number; top: number; items: MenuItem[] } | null>(null);
  const menuOn = (items: MenuItem[]) => (e: MouseEvent) => { e.preventDefault(); setRowMenu({ left: e.clientX, top: e.clientY, items }); };
  const notebookItem = (ref: NoteRef): MenuItem => ({ label: t('Open in the notebook'), icon: <IconExternal size={15} />, run: () => { void api.openNoteWindow(ref); } });
  // A loose note leaves this computer; a project note goes to the trash.
  const deleteNoteItem = (ref: NoteRef, title: string): MenuItem => ({
    label: t('Delete the note'), icon: <IconTrash size={15} />, danger: true,
    run: () => {
      if (!window.confirm(t('Delete the note "{title}"?', { title }))) return;
      if ('loose' in ref) { removeLooseNote(ref.loose); setNoteTick((n) => n + 1); return; }
      api.deleteNote(ref.project, ref.path).then(() => { forgetNote(ref.project, ref.path); setNoteTick((n) => n + 1); }).catch((e: Error) => setError(e.message));
    },
  });
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  useEffect(() => { api.tags().then(setCatalog).catch(() => setCatalog([])); }, []);
  const [noteTick, setNoteTick] = useState(0);
  useEffect(() => api.onNotesChanged(() => setNoteTick((n) => n + 1)), []);
  const notes = useMemo(() => recentNotes(), [noteTick]);
  const loose = useMemo(() => looseNotes(), [noteTick]);
  const installed = tools.filter((t) => t.command && t.available);
  const visible = projects.filter((p) => !hidden.includes(p.id));
  const hiddenProjects = projects.filter((p) => hidden.includes(p.id));
  const pinned = pins.map((id) => visible.find((p) => p.id === id)).filter((p): p is ProjectSummary => Boolean(p));
  const rest = visible.filter((p) => !pins.includes(p.id));
  const notesShown = [
    ...loose.map((n) => ({ kind: 'loose' as const, id: n.id, title: n.title, at: n.at })),
    ...notes.filter((n) => visible.some((p) => p.id === n.project)).map((n) => ({ kind: 'project' as const, ...n })),
  ].sort((a, b) => b.at - a.at);
  // Favorite notes (the star): loose ones and those of the projects listed, as starred.
  const favorites = useMemo(() => [
    ...favoriteLooseIds().flatMap((id) => { const n = loose.find((x) => x.id === id); return n ? [{ kind: 'loose' as const, id, title: n.title }] : []; }),
    ...favoriteNotes().filter((n) => visible.some((p) => p.id === n.project)).map((n) => ({ kind: 'project' as const, ...n, title: noteTitle(n.path) })),
  ], [noteTick, loose, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const unstar = (f: (typeof favorites)[number]) => {
    setFavorite(f.kind === 'loose' ? { loose: f.id } : { project: f.project, path: f.path }, false);
    setNoteTick((n) => n + 1);
  };

  const hide = (p: ProjectSummary) => {
    if (!window.confirm(t('Hide {name} from Moki? The files stay on this computer. You can show it again under Hidden.', { name: p.name }))) return;
    setHidden(hideProject(p.id));
    setPins(pinnedIds());
  };

  const deleted = (id: string) => {
    forgetProject(id);
    setHidden(hiddenIds()); setPins(pinnedIds()); setNoteTick((n) => n + 1); setDeleting(null);
    onDeleted?.();
  };

  const projectRow = (p: ProjectSummary, pinnedRow: boolean) => (
    <li key={p.id} className="home-row" onContextMenu={menuOn([
      { label: pinnedRow ? t('Unpin') : t('Pin'), icon: <IconPin size={15} />, run: () => setPins(togglePin(p.id)) },
      { label: t('Hide from Moki'), icon: <IconEyeOff size={15} />, run: () => hide(p) },
    ])}>
      <button type="button" className="home-project" onClick={() => onOpen(p.id)}>
        <span className="home-project-name">{p.name}</span>
        <span className="home-project-meta">
          {onboarding(p.onboardingStatus)} · {p.runs} {p.runs === 1 ? t('activity') : t('activities')}
          {p.openRuns > 0 && <span className="dot dot-warn" title={t('{n} open', { n: p.openRuns })} />}
        </span>
        <IconChevron size={16} />
      </button>
    </li>
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    remember('qa-starter', starter);
    try { await onCreate(name, starter, folder || undefined, newTags); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  // The project is named after the chosen folder; the name can still be changed before creating it.
  const pickFolder = () => {
    setError('');
    api.pickFolder().then((r) => {
      if (!r) return;
      setFolder(r.folder); setName(r.name); setCreating(true);
    }).catch((err: Error) => { setCreating(true); setError(err.message); });
  };

  return (
    <div className={`home${settings ? ' is-settings' : ''}`}>
      {!settings && !openNote && <StartPrefs />}
      {!settings && search && onSearch && onFound && (
        <aside className="home-list home-side">
          <SearchPanel onOpenProject={(id) => onFound(id)} onOpenFile={onFound} onClose={onSearch} />
        </aside>
      )}
      {!settings && !(search && onSearch && onFound) && <aside className="home-list home-side">
        {pinned.length > 0 && (
          <div className="home-pinned">
            <div className="home-list-head">{t('Pinned')}</div>
            <ul>{pinned.map((p) => projectRow(p, true))}</ul>
          </div>
        )}
        <div className="home-list-scroll">
          {pinned.length > 0 && <hr className="home-split" />}
          <div className="home-list-head">{t('Projects')}</div>

          {projects.length === 0 && <p className="muted small home-empty">{t('No projects yet.')}</p>}
          <ul>{rest.map((p) => projectRow(p, false))}</ul>
          {hiddenProjects.length > 0 && (
            <details className="home-hidden">
              <summary className="home-list-head">{t('Hidden ({n})', { n: hiddenProjects.length })}</summary>
              <ul>
                {hiddenProjects.map((p) => (
                  <li key={p.id} className="home-row" onContextMenu={menuOn([
                    { label: t('Show in the list'), icon: <IconEye size={15} />, run: () => setHidden(showProject(p.id)) },
                    { label: t('Delete for good'), icon: <IconTrash size={15} />, danger: true, run: () => setDeleting(p) },
                  ])}>
                    <button type="button" className="home-project" onClick={() => { setHidden(showProject(p.id)); onOpen(p.id); }}>
                      <span className="home-project-name">{p.name}</span>
                      <span className="home-project-meta">
                        {onboarding(p.onboardingStatus)} · {p.runs} {p.runs === 1 ? t('activity') : t('activities')}
                      </span>
                      <IconChevron size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {favorites.length > 0 && <>
            <hr className="home-split" />
            <div className="home-list-head">{t('Favorites')}</div>
            <ul className="home-favorites">
              {favorites.map((f) => (
                <li key={f.kind === 'loose' ? f.id : `${f.project}:${f.path}`} className="home-row" onContextMenu={menuOn([
                  notebookItem(f.kind === 'loose' ? { loose: f.id } : { project: f.project, path: f.path }),
                  { label: t('Remove from favorites'), icon: <IconStar size={15} />, run: () => unstar(f) },
                ])}>
                  <button type="button" className="home-project" onClick={() => setOpenNote(f.kind === 'loose' ? { loose: f.id } : { project: f.project, path: f.path })}>
                    <span className="home-project-name">{f.title}</span>
                    {f.kind === 'project' && <span className="home-project-meta">{projects.find((p) => p.id === f.project)?.name}</span>}
                    <IconChevron size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </>}
          <hr className="home-split" />
          <div className="home-list-head with-action">
            <span>{t('Loose notes')}</span>
            <AddButton size="sm" title={t('New note')} onClick={() => setOpenNote({ loose: null })} />
          </div>
          {notesShown.length === 0 && <p className="muted small home-empty">{t('No loose notes yet.')}</p>}
          <ul>
            {notesShown.map((n) => (
              <li key={n.kind === 'loose' ? n.id : `${n.project}:${n.path}`} className="home-row" onContextMenu={menuOn([
                notebookItem(n.kind === 'loose' ? { loose: n.id } : { project: n.project, path: n.path }),
                deleteNoteItem(n.kind === 'loose' ? { loose: n.id } : { project: n.project, path: n.path }, n.title),
              ])}>
                <button type="button" className="home-project" onClick={() => setOpenNote(n.kind === 'loose' ? { loose: n.id } : { project: n.project, path: n.path })}>
                  <span className="home-project-name">{n.title}</span>
                  {n.kind === 'project' && <span className="home-project-meta">{projects.find((p) => p.id === n.project)?.name}</span>}
                  <IconChevron size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        {rowMenu && (
          <div className="menu-backdrop" onMouseDown={() => setRowMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(null); }}>
            <ul className="term-menu item-menu" role="menu" style={{ left: rowMenu.left, top: rowMenu.top }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setRowMenu(null); }}>
              {rowMenu.items.map((item, i) => (
                <li key={item.label}>
                  <button type="button" role="menuitem" autoFocus={i === 0} className={item.danger ? 'danger' : ''} onClick={() => { setRowMenu(null); item.run(); }}>{item.icon} {item.label}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {workspace && onWorkspace && (
          <div className="ws-switch">
            {switching && (
              <div className="menu-backdrop" onMouseDown={() => setSwitching(null)}>
                <ul className="ws-menu" role="menu" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setSwitching(null); }}>
                  {switching.map((w) => (
                    <li key={w.id}>
                      <button type="button" role="menuitem" disabled={w.missing} onClick={() => switchTo(w)} title={w.path}>
                        <span className="ws-menu-name">{w.name}</span>
                        {w.id === workspace.id && <IconCheck size={14} />}
                      </button>
                    </li>
                  ))}
                  <li className="ws-menu-sep" />
                  <li><button type="button" role="menuitem" autoFocus onClick={() => { setSwitching(null); onWorkspace(null); }}>{t('Manage workspaces…')}</button></li>
                </ul>
              </div>
            )}
            <button type="button" className="ws-switch-btn" onClick={openSwitcher} aria-haspopup="menu" title={`${t('Switch workspace')}
${workspace.path}`}>
              <span className="ws-switch-name">{workspace.name}</span>
              <span className="ws-switch-caret"><IconChevron size={14} /></span>
            </button>
          </div>
        )}
      </aside>}
      {deleting && <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} onDeleted={() => deleted(deleting.id)} />}

      {settings ? (
        <Settings tab={settings} onTab={onSettings} onClose={() => onSettings(null)} onBack={onBack} backLabel={backLabel} project={project} projects={projects} tools={tools} onTerminal={onTerminal} />
      ) : openNote ? (
      <main className="home-main home-note">
        <NoteDialog
          key={'loose' in openNote ? `loose:${openNote.loose}` : `${openNote.project}:${openNote.path}`}
          embedded
          project={'path' in openNote ? openNote.project : null}
          path={'path' in openNote ? openNote.path : null}
          looseId={'loose' in openNote ? openNote.loose : null}
          projects={visible.map((p) => ({ id: p.id, name: p.name }))}
          onSaved={() => setNoteTick((n) => n + 1)}
          onClose={() => { setOpenNote(null); setNoteTick((n) => n + 1); }}
        />
      </main>
      ) : (
      <main className="home-main">
        <img className="hero" src="./hero.png" alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = './favicon.svg'; e.currentTarget.className = 'hero fallback'; }} />
        <h1>Moki</h1>
        <p className="muted">{t('Version {version}', { version })}</p>

        <div className="home-actions">
          {!creating ? (
            <div className="home-action">
              <div>
                <strong>{t('Create a new project')}</strong>
                <p className="muted small">{t('One project per system you test. Its context and history stay on this computer.')}</p>
              </div>
              <AddButton size="lg" title={t('Create')} onClick={() => setCreating(true)} />
            </div>
          ) : (
            <form className="home-action create" onSubmit={(e) => { void submit(e); }}>
              <label className="field">
                <strong>{t('Project name')}</strong>
                <span className="muted small">{t('The system under test, e.g. "Billing Portal".')}</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Billing Portal" maxLength={80} />
              </label>
              <fieldset className="field">
                <legend className="label">{t('Start with')}</legend>
                <label className="field inline">
                  <input type="radio" name="starter" checked={starter === 'qa'} onChange={() => setStarter('qa')} />
                  <span>{t('QA context files')} <span className="muted small">{t('(glossary, business rules, flows, permissions…)')}</span></span>
                </label>
                <label className="field inline">
                  <input type="radio" name="starter" checked={starter === 'blank'} onChange={() => setStarter('blank')} />
                  <span>{t('A blank project')} <span className="muted small">{t('(after your description, the AI asks what it needs and proposes a plan)')}</span></span>
                </label>
              </fieldset>
              <div className="field">
                <strong>{t('Tags')}</strong>
                <span className="muted small">{t('Optional. Projects and files with the same tag share their context with this one.')}</span>
                <TagPicker catalog={catalog} value={newTags} onChange={setNewTags} onCatalog={setCatalog} />
              </div>
              {folder && (
                <div className="field">
                  <span className="label">{t('Existing folder')}</span>
                  <span className="row-actions">
                    <code className="small">{folder}</code>
                    <button type="button" className="icon-btn" onClick={() => setFolder('')} title={t('Do not link a folder')}><IconX size={14} /></button>
                  </span>
                  <span className="muted small">{t('Its AI settings (.claude, AGENTS.md…) are backed up inside it, in .moki-backup/. Nothing else in it changes.')}</span>
                </div>
              )}
              {error && <p className="error small">{error}</p>}
              <div className="row-actions">
                <button type="submit" className="btn" disabled={busy || !name.trim()}>{busy ? t('Creating…') : t('Create project')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setCreating(false); setName(''); setFolder(''); setNewTags([]); setError(''); }}>{t('Cancel')}</button>
              </div>
            </form>
          )}
          <div className="home-action">
            <div>
              <strong>{t('Open a project')}</strong>
              <p className="muted small">{t('Choose one on the left, or pick a folder you already have.')}</p>
            </div>
            <button type="button" className="home-action-icon" onClick={pickFolder} title={t('Open a project')} aria-label={t('Open a project')}><IconOpenProject size={20} /></button>
          </div>
        </div>

        <p className="muted small home-tools">
          {installed.length
            ? <>{t('AI tools found:')} {installed.map((ai) => ai.label.replace(/ \(.*\)$/, '')).join(' · ')}</>
            : t('No AI tool found on this computer. Install Claude Code, Codex, Cursor or another supported tool.')}
        </p>
      </main>
      )}
    </div>
  );
}
