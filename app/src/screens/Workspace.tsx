// Project workspace, Obsidian-style: ribbon, file tree, tabs with documents
// (view and edit) and terminals (AI tools or a shell), and a side panel with
// the activity or project details.

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { api, type FileContent, type ProjectSummary, type Tag, type TerminalRef, type ToolInfo, type TreeNode } from '../api';
import { conversationLanguage, t } from '../i18n';
import { recall, remember } from '../prefs';
import { DocView } from '../components/DocView';
import { FileTree } from '../components/FileTree';
import { LaunchDialog } from '../components/LaunchDialog';
import { NoteDialog } from '../components/NoteDialog';
import { OperationsPanel } from '../components/OperationsPanel';
import { OperationLaunch } from '../components/OperationLaunch';
import { OperationRunView } from '../components/OperationRunView';
import { SidePanel } from '../components/SidePanel';
import { SetupDialog } from '../components/SetupDialog';
import { TerminalView } from '../components/TerminalView';
import { UsageStatus } from '../components/UsageStatus';
import { TagPicker } from '../components/TagPicker';
import { SearchPanel } from '../components/SearchPanel';
import { IconCopy, IconExternal, IconEyeOff, IconFile, IconFolder, IconGraph, IconMore, IconPlay, IconStar, IconTerminal, IconX } from '../components/Icons';
import { NewEntryDialog } from '../components/NewEntryDialog';
import { favoriteNotes, hideProject, isFavorite, setFavorite } from '../side-menu';
import { AddButton } from '../components/AddButton';
import { FileIcon } from '../icons';
import { Ribbon } from '../components/Ribbon';
import { Settings, type SettingsTab } from './Settings';

interface Props { project: ProjectSummary; tools: ToolInfo[]; onHome: () => void; settings: SettingsTab | null; onSettings: (tab: SettingsTab | null) => void; onProjectChanged: () => void; launchOnOpen?: boolean; startSetup?: boolean; startNotice?: string; pendingTerminal?: TerminalRef | null; onPendingTerminal?: () => void; pendingPath?: string | null; onPendingPath?: () => void; search?: boolean; onSearch?: () => void; onFound?: (project: string, path?: string) => void }

interface Tab { path: string; content: FileContent; draft: string; mode: 'preview' | 'edit'; saving: boolean }
interface TermTab extends TerminalRef { running: boolean }

// The picture above the project name when nothing is open.
const THINKING_CAT = `./${encodeURIComponent('Thoughtful Pixel Cat at Work.png')}`;

const textOf = (c: FileContent): string => (c.kind === 'markdown' || c.kind === 'text' ? c.text : '');
const isDirty = (t: Tab): boolean => (t.content.kind === 'markdown' || t.content.kind === 'text') && t.content.editable && t.draft !== t.content.text;

// Resolves a link found in a document relative to that document's folder.
function resolveLink(from: string, href: string): string | null {
  const parts = from.split('/').slice(0, -1);
  for (const seg of decodeURI(href.split('#')[0]).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
  }
  return parts.join('/');
}

// What linking a folder did, shown after "Choose my folder" or creating a project from a folder.
export const linkedNotice = (r: ProjectSummary & { backup?: string }): string => (r.backup
  ? t('Linked {folder}. Its AI settings were backed up to {backup}', { folder: r.repository, backup: r.backup })
  : t('Linked {folder}. It has no AI settings (.claude, AGENTS.md…) to back up.', { folder: r.repository }));

export function Workspace({ project, tools, onHome, settings, onSettings, onProjectChanged, launchOnOpen = false, startSetup = false, startNotice = '', pendingTerminal = null, onPendingTerminal, pendingPath = null, onPendingPath, search = false, onSearch, onFound }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // The right panel is open or collapsed to a thin rail; the choice is remembered.
  const [panelRail, setPanelRail] = useState(() => recall('qa-panel') === 'rail');
  const togglePanel = () => setPanelRail((v) => { remember('qa-panel', v ? 'open' : 'rail'); return !v; });
  const [launch, setLaunch] = useState<{ activity: string; run?: string; skipActivity?: boolean } | null>(launchOnOpen ? { activity: 'open' } : null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(startNotice);
  const [terms, setTerms] = useState<TermTab[]>([]);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  // Graph view is a placeholder tab. The rail button under the AI icon opens it.
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphFocus, setGraphFocus] = useState(false);
  const openGraph = () => { setGraphOpen(true); setGraphFocus(true); setActiveTerm(null); };
  const closeGraph = () => { setGraphOpen(false); setGraphFocus(false); };
  const toggleGraph = () => { if (graphFocus) closeGraph(); else openGraph(); };
  const openedTerm = useRef<string | null>(null);
  const [showSetup, setShowSetup] = useState(startSetup); // after creating the project or linking a folder
  const [note, setNote] = useState<{ path: string | null } | null>(null); // open note (main area); path null = new note
  // A multi-agent operation in the main area: its start screen, or one of its runs.
  const [opView, setOpView] = useState<{ kind: 'launch' | 'run'; id: string } | null>(null);
  const [opsTick, setOpsTick] = useState(0);
  const advanceRef = useRef<() => void>(() => {});
  const [termMenu, setTermMenu] = useState<{ left: number; top: number } | null>(null);
  // The tree item menu (right click or ⋯); path '' is the project folder. canCreate: a folder outside runs/.
  const [itemMenu, setItemMenu] = useState<{ path: string; canCreate: boolean; left: number; top: number } | null>(null);
  const [creating, setCreating] = useState<{ parent: string; kind: 'file' | 'folder' } | null>(null);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Tags: the catalog, and the tags of this project's files (the tree marks them, the open file can change them).
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [fileTags, setFileTags] = useState<Record<string, string[]>>({});
  const loadTree = useCallback(() => {
    api.tree(project.id).then(setTree).catch((e: Error) => setError(e.message));
    api.fileTags(project.id).then(setFileTags).catch(() => setFileTags({}));
  }, [project.id]);
  useEffect(() => { api.tags().then(setCatalog).catch(() => setCatalog([])); }, []);
  const tagProject = (ids: string[]) => { api.setProjectTags(project.id, ids).then(onProjectChanged).catch((e: Error) => setError(e.message)); };
  const tagFile = (path: string, ids: string[]) => {
    api.setFileTags(project.id, path, ids).then((saved) => setFileTags((all) => {
      const next = { ...all };
      if (saved.length) next[path] = saved; else delete next[path];
      return next;
    })).catch((e: Error) => setError(e.message));
  };
  const colorsOf = (path: string) => (fileTags[path] ?? []).map((id) => catalog.find((tg) => tg.id === id)?.color).filter((c): c is string => Boolean(c));

  // Live updates: the AI tool writes files while the app is open.
  useEffect(() => {
    loadTree();
    void api.watch(project.id);
    const off = api.onChanged((changed) => {
      if (changed !== project.id) return;
      setOpsTick((n) => n + 1);
      advanceRef.current(); // a step may have just delivered its work
      loadTree();
      setRefreshKey((k) => k + 1);
      onProjectChanged();
      for (const t of tabsRef.current) {
        if (isDirty(t)) continue;
        api.readFile(project.id, t.path)
          .then((content) => setTabs((all) => all.map((x) => (x.path === t.path && !isDirty(x) ? { ...x, content, draft: textOf(content) } : x))))
          .catch(() => { /* file removed: keep the tab as it was */ });
      }
    });
    return () => { off(); void api.watch(null); };
  }, [project.id, loadTree, onProjectChanged]);

  const openPath = useCallback((path: string, mode: Tab['mode'] = 'preview') => {
    setError('');
    setOpView(null);
    if (/^notes\/[^/]+\.md$/.test(path)) { setNote({ path }); return; } // notes open in the main area, over the tabs
    setNote(null);
    setGraphFocus(false);
    setActiveTerm(null);
    if (tabsRef.current.some((t) => t.path === path)) { setActive(path); return; }
    api.readFile(project.id, path).then((content) => {
      setTabs((all) => [...all, { path, content, draft: textOf(content), mode: content.kind === 'markdown' ? mode : 'preview', saving: false }]);
      setActive(path);
      // Reveal the file in the tree.
      setExpanded((s) => { const n = new Set(s); path.split('/').slice(0, -1).reduce((acc, seg) => { const p = acc ? `${acc}/${seg}` : seg; n.add(p); return p; }, ''); return n; });
    }).catch((e: Error) => setError(e.message));
  }, [project.id]);

  const update = (path: string, patch: Partial<Tab>) => setTabs((all) => all.map((t) => (t.path === path ? { ...t, ...patch } : t)));

  // "Open with": the program kept for a file type (by extension) is a preference of this computer; the system's default never changes.
  const [kept, setKept] = useState<Record<string, { id: string; name: string }>>(() => { try { return JSON.parse(recall('qa-open-with') ?? '{}'); } catch { return {}; } });
  const keep = (ext: string, app: { id: string; name: string } | null) => {
    const next = { ...kept };
    if (app) next[ext] = { id: app.id, name: app.name }; else delete next[ext];
    remember('qa-open-with', JSON.stringify(next));
    setKept(next);
  };
  const extOf = (path: string) => path.slice(path.lastIndexOf('.')).toLowerCase();
  const openExternal = (path: string) => {
    const system = () => { api.openExternal(project.id, path).catch((e: Error) => setError(e.message)); };
    const app = kept[extOf(path)];
    if (!app) { system(); return; }
    api.openWith(project.id, path, app.id).catch(() => {
      keep(extOf(path), null);
      setNotice(t('{name} is no longer offered for this file, so it opened with the default program.', { name: app.name }));
      system();
    });
  };

  const save = useCallback((path: string) => {
    const tab = tabsRef.current.find((t) => t.path === path);
    if (!tab || !isDirty(tab)) return;
    update(path, { saving: true });
    api.writeFile(project.id, path, tab.draft)
      .then((content) => update(path, { content, draft: textOf(content), saving: false }))
      .catch((e: Error) => { update(path, { saving: false }); setError(e.message); });
  }, [project.id]);

  const close = useCallback((path: string) => {
    const tab = tabsRef.current.find((t) => t.path === path);
    if (tab && isDirty(tab) && !window.confirm(t('Discard unsaved changes in {file}?', { file: path.split('/').pop() ?? path }))) return;
    setTabs((all) => {
      const i = all.findIndex((t) => t.path === path);
      const next = all.filter((t) => t.path !== path);
      setActive((cur) => (cur === path ? next[Math.min(i, next.length - 1)]?.path ?? null : cur));
      return next;
    });
  }, []);

  const addTerminal = useCallback((t: TerminalRef) => { setTerms((all) => (all.some((x) => x.id === t.id) ? all : [...all, { ...t, running: true }])); setGraphFocus(false); setActiveTerm(t.id); }, []);

  // Operations move on when a step's files are there: the next step starts in a terminal tab (or waits for approval).
  const advancing = useRef(false);
  const advanceOps = useCallback(() => {
    if (advancing.current) return;
    advancing.current = true;
    api.advanceOperations(project.id)
      .then((ready) => Promise.all(ready.map((r) => api.startOperationStep(project.id, r.run, r.step, conversationLanguage())
        .then((res) => { if (res.terminal) addTerminal(res.terminal); else if (!res.opened) setError(res.message ?? t('Could not open the tool.')); })
        .catch((e: Error) => setError(e.message)))))
      .catch(() => { /* shown in the run */ })
      .finally(() => { advancing.current = false; setOpsTick((n) => n + 1); });
  }, [project.id, addTerminal]);
  advanceRef.current = advanceOps;
  useEffect(() => { advanceOps(); }, [advanceOps]);

  // A skill draft started in Settings opens here, once, when this project comes back.
  useEffect(() => {
    if (!pendingTerminal || openedTerm.current === pendingTerminal.id) return;
    openedTerm.current = pendingTerminal.id;
    addTerminal(pendingTerminal);
    onPendingTerminal?.();
  }, [pendingTerminal, addTerminal, onPendingTerminal]);

  // A file a note window mentions (clicked in its reading view) opens here.
  useEffect(() => {
    if (!pendingPath) return;
    openPath(pendingPath);
    onPendingPath?.();
  }, [pendingPath, openPath, onPendingPath]);

  // tool '' opens the user's shell; otherwise the AI tool starts right away in the tab.
  const newTerminal = (tool: string) => {
    setTermMenu(null);
    setError('');
    const bridge = api.term();
    if (!bridge) { setError(t('Terminals are only available in the desktop app.')); return; }
    bridge.create(tool)
      .then((r) => (r.terminal ? addTerminal(r.terminal) : setError(r.error ?? t('Could not open the terminal.'))))
      .catch((e: Error) => setError(e.message));
  };
  const openTermMenu = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTermMenu({ left: r.left, top: r.bottom + 4 });
  };

  // Closing the tab stops what runs in it (TerminalView kills it when unmounted).
  const closeTerm = (id: string) => {
    if (terms.find((t) => t.id === id)?.running && !window.confirm(t('Close this terminal? What is running in it will stop.'))) return;
    setTerms((all) => {
      const i = all.findIndex((t) => t.id === id);
      const next = all.filter((t) => t.id !== id);
      setActiveTerm((cur) => (cur === id ? next[Math.min(i, next.length - 1)]?.id ?? null : cur));
      return next;
    });
  };

  // Where a tree item is on this computer: shown selected in the file manager, or its full path copied.
  const openItemMenu = (node: TreeNode | null, at: { left: number; top: number }) => {
    const path = node?.path ?? '';
    const canCreate = (!node || node.type === 'dir') && path !== 'runs' && !path.startsWith('runs/');
    setItemMenu({ path, canCreate, left: Math.min(at.left, window.innerWidth - 220), top: Math.min(at.top, window.innerHeight - (canCreate ? 160 : 90)) });
  };
  // Favorite notes of this project (the star in a note, or the note's menu here). Note windows tell when it changes.
  const [favTick, setFavTick] = useState(0);
  useEffect(() => api.onNotesChanged(() => setFavTick((n) => n + 1)), []);
  const favorites = useMemo(() => new Set(favoriteNotes().filter((n) => n.project === project.id).map((n) => n.path)), [favTick, project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const isNote = (path: string) => /^notes\/[^/]+\.md$/.test(path);
  const toggleFavorite = (path: string) => {
    setItemMenu(null);
    setFavorite({ project: project.id, path }, !isFavorite({ project: project.id, path }));
    setFavTick((n) => n + 1);
    window.qa?.notesChanged();
  };
  const startCreate = (parent: string, kind: 'file' | 'folder') => { setItemMenu(null); setCreating({ parent, kind }); };
  // The new file opens to be written; a new folder shows open in the tree.
  const created = (path: string, kind: 'file' | 'folder') => {
    setCreating(null);
    loadTree();
    setExpanded((s) => { const n = new Set(s); path.split('/').slice(0, kind === 'folder' ? undefined : -1).reduce((acc, seg) => { const p = acc ? `${acc}/${seg}` : seg; n.add(p); return p; }, ''); return n; });
    if (kind === 'file') openPath(path, 'edit');
  };
  const revealItem = (path: string) => {
    setItemMenu(null);
    api.revealPath(project.id, path).catch((e: Error) => setError(e.message));
  };
  const copyItemPath = (path: string) => {
    setItemMenu(null);
    api.copyPath(project.id, path).then((full) => setNotice(t('Path copied: {path}', { path: full }))).catch((e: Error) => setError(e.message));
  };

  // Leaving the workspace closes its terminals.
  const canLeave = () => !(tabsRef.current.some(isDirty) && !window.confirm(t('There are unsaved changes. Leave anyway?')))
    && !(terms.some((t) => t.running) && !window.confirm(t('Terminals are still running in this project. Leaving closes them. Leave anyway?')));

  const goHome = () => { if (canLeave()) onHome(); };
  const hideThis = () => {
    if (!window.confirm(t('Hide {name} from Moki? The files stay on this computer. You can show it again under Hidden.', { name: project.name }))) return;
    if (!canLeave()) return;
    hideProject(project.id);
    onHome();
  };

  const toggleSettings = () => { if (settings) onSettings(null); else if (canLeave()) onSettings('agents'); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !active || activeTerm || graphFocus || note) return; // in a terminal the keys belong to it
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); save(active); }
      if (key === 'w') { e.preventDefault(); close(active); }
      if (key === 'e') {
        e.preventDefault();
        setTabs((all) => all.map((t) => (t.path === active && t.content.kind === 'markdown' ? { ...t, mode: t.mode === 'edit' ? 'preview' : 'edit' } : t)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, activeTerm, graphFocus, note, save, close]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (tabsRef.current.some(isDirty)) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Links a folder of this machine (chosen in the native dialog). Its AI settings are backed up inside it (.moki-backup/).
  const linkFolder = () => {
    setError(''); setNotice('');
    api.linkRepository(project.id).then((r) => {
      if (!r) return;
      onProjectChanged(); loadTree();
      setNotice(linkedNotice(r));
      setShowSetup(true);
    }).catch((e: Error) => setError(e.message));
  };
  const myFolder = () => {
    if (!project.repository) { linkFolder(); return; }
    api.openLinkedFolder(project.id).catch((e: Error) => setError(e.message));
  };

  const tab = activeTerm || graphFocus ? null : tabs.find((t) => t.path === active) ?? null;
  const runId = active?.match(/^runs\/([^/]+)\//)?.[1] ?? null;
  const words = tab && tab.content.kind === 'markdown' ? tab.draft.split(/\s+/).filter(Boolean).length : null;

  const fileDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragEnter = (e: DragEvent) => {
    if (!fileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDropping(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!fileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: DragEvent) => {
    if (!fileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  // A drop copies the files into the project inbox. They stay in the tree after this.
  const onDrop = (e: DragEvent) => {
    if (!fileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    const paths = Array.from(e.dataTransfer.files).map((f) => window.qa?.filePath(f) ?? '').filter(Boolean);
    if (!paths.length) { setError(t('Drop files from your computer.')); return; }
    api.importFiles(project.id, paths).then((r) => {
      loadTree();
      setExpanded((s) => new Set(s).add('inbox'));
      for (const p of r.saved.slice(0, 8)) openPath(p);
      setNotice(r.saved.length === 1
        ? t('Added {name} to the inbox. It stays in this project.', { name: r.saved[0].split('/').pop() ?? '' })
        : t('Added {n} files to the inbox. They stay in this project.', { n: r.saved.length }));
      setError(r.skipped.length ? t('Skipped {names}. Only files are kept, not folders.', { names: r.skipped.join(', ') }) : '');
    }).catch((err: Error) => setError(t(err.message)));
  };

  const onLink = (href: string) => {
    if (/^https?:\/\//.test(href)) { void api.openLink(href); return; }
    if (!tab) return;
    const target = resolveLink(tab.path, href);
    if (target) openPath(target);
  };

  return (
    <div
      className={`workspace${panelRail && !settings ? ' panel-rail' : ''}${settings ? ' is-settings' : ''}${dropping ? ' dropping' : ''}`}
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      <Ribbon
        project={project}
        settingsOn={settings !== null}
        onHome={goHome}
        onSettings={toggleSettings}
        onPlay={() => setLaunch({ activity: 'open' })}
        onTerminal={openTermMenu}
        onFolder={() => { void api.openFolder(project.id); }}
        onLink={linkFolder}
        onRefresh={() => { loadTree(); setRefreshKey((k) => k + 1); }}
        onPanel={togglePanel}
        searchOn={search}
        onSearch={onSearch}
      />

      {settings ? (
        <main className="main">
          <Settings tab={settings} onTab={onSettings} onClose={() => onSettings(null)} project={project} projects={[project]} tools={tools} onTerminal={(term) => { onSettings(null); addTerminal(term); }} />
        </main>
      ) : <>
      <aside className="sidebar">
        {search && onSearch && onFound ? <SearchPanel onOpenProject={(id) => onFound(id)} onOpenFile={onFound} onClose={onSearch} /> : <>
        <div className="sidebar-head">
          <button type="button" className="project-switch" onClick={goHome} title={t('Switch project')}>{project.name}</button>
          <button type="button" className="icon-btn sidebar-more" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openItemMenu(null, { left: r.left, top: r.bottom + 2 }); }}
            title={t('Project folder options')} aria-label={t('Project folder options')} aria-haspopup="menu"><IconMore size={16} /></button>
          <button type="button" className="icon-btn sidebar-hide" onClick={hideThis} title={t('Hide from Moki')} aria-label={t('Hide from Moki')}><IconEyeOff size={16} /></button>
        </div>
        <div className="sidebar-tags" title={t('Projects and files with the same tag share their context with this project')}>
          <TagPicker catalog={catalog} value={project.tags} onChange={tagProject} onCatalog={setCatalog} compact />
        </div>
        <div className="sidebar-scroll" onContextMenu={(e) => { e.preventDefault(); openItemMenu(null, { left: e.clientX, top: e.clientY }); }}>
          <FileTree
            tagColors={colorsOf}
            nodes={tree}
            activePath={activeTerm || graphFocus ? null : active}
            onOpen={openPath}
            expanded={expanded}
            onNewNote={() => setNote({ path: null })}
            onMenu={openItemMenu}
            favorites={favorites}
            onToggle={(p) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; })}
          />
          <OperationsPanel project={project.id} tick={opsTick} active={opView?.id ?? null}
            onStart={(id) => { setNote(null); setOpView({ kind: 'launch', id }); }}
            onRun={(id) => { setNote(null); setOpView({ kind: 'run', id }); }} />
        </div>
        </>}
      </aside>

      <main className="main">
        {opView && !note && (
          <div className="note-host ops-host">
            {opView.kind === 'launch'
              ? <OperationLaunch key={opView.id} project={project.id} operation={opView.id} tools={tools} onClose={() => setOpView(null)}
                  onStarted={(run) => { setOpView({ kind: 'run', id: run.id }); advanceOps(); }} />
              : <OperationRunView key={opView.id} project={project.id} run={opView.id} tick={opsTick} tools={tools}
                  hasTerminal={(id) => terms.some((x) => x.id === id)}
                  onTerminal={(term) => { setOpView(null); addTerminal(term); }}
                  onOpenFile={(path) => openPath(path)} onClose={() => setOpView(null)} onChanged={advanceOps} />}
          </div>
        )}
        {note && (
          <div className="note-host">
            <NoteDialog key={note.path ?? 'new'} embedded project={project.id} path={note.path}
              onSaved={(saved) => { if ('path' in saved && saved.path !== note.path) loadTree(); }} onClose={() => { setNote(null); loadTree(); }} />
          </div>
        )}
        <div className="tabs" role="tablist">
          {graphOpen && (
            <div role="tab" aria-selected={graphFocus} className={`tab${graphFocus ? ' active' : ''}`} onClick={openGraph} title={t('Graph view')}>
              <IconGraph size={14} />
              <span className="tab-name">{t('Graph view')}</span>
              <button type="button" className="tab-close" onClick={(e) => { e.stopPropagation(); closeGraph(); }} title={t('Close')}><IconX size={13} /></button>
            </div>
          )}
          {tabs.map((doc) => {
            const on = !activeTerm && !graphFocus && doc.path === active;
            return (
              <div key={doc.path} role="tab" aria-selected={on} className={`tab${on ? ' active' : ''}`} onClick={() => { setGraphFocus(false); setActive(doc.path); setActiveTerm(null); }} title={doc.path}
                onAuxClick={(e) => { if (e.button === 1) close(doc.path); }}>
                <FileIcon name={doc.path} size={14} />
                <span className="tab-name">{doc.path.split('/').pop()}</span>
                {isDirty(doc) && <span className="tab-dirty" title={t('Unsaved changes')}>●</span>}
                <button type="button" className="tab-close" onClick={(e) => { e.stopPropagation(); close(doc.path); }} title={t('Close (Ctrl+W)')}><IconX size={13} /></button>
              </div>
            );
          })}
          {terms.map((term) => (
            <div key={term.id} role="tab" aria-selected={term.id === activeTerm} className={`tab tab-term${term.id === activeTerm ? ' active' : ''}${term.running ? '' : ' exited'}`}
              onClick={() => { setGraphFocus(false); setActiveTerm(term.id); }} title={term.running ? term.title : t('{title} (finished)', { title: term.title })} onAuxClick={(e) => { if (e.button === 1) closeTerm(term.id); }}>
              <IconTerminal size={13} />
              <span className="tab-name">{term.title}</span>
              <button type="button" className="tab-close" onClick={(e) => { e.stopPropagation(); closeTerm(term.id); }} title={t('Close the terminal')}><IconX size={13} /></button>
            </div>
          ))}
          <AddButton size="sm" variant="ghost" title={t('New terminal')} onClick={openTermMenu} />
        </div>
        {notice && <div className="error-bar info-bar" role="status">{notice}<button type="button" className="icon-btn" onClick={() => setNotice('')}><IconX size={14} /></button></div>}
        {error && <div className="error-bar">{error}<button type="button" className="icon-btn" onClick={() => setError('')}><IconX size={14} /></button></div>}
        {terms.map((t) => (
          <TerminalView key={t.id} id={t.id} project={project.id} active={t.id === activeTerm} onExit={() => setTerms((all) => all.map((x) => (x.id === t.id ? { ...x, running: false } : x)))} />
        ))}
        {graphFocus ? (
          <div className="welcome">
            <h1>{t('Graph view')}</h1>
            <p className="muted">{t('Under construction.')}</p>
          </div>
        ) : activeTerm ? null : tab ? (<>
          {tab.path !== 'project.json' && tab.path !== 'tags.json' && (
            <div className="file-tags-bar">
              <span className="label">{t('Tags')}</span>
              <TagPicker catalog={catalog} value={fileTags[tab.path] ?? []} onChange={(ids) => tagFile(tab.path, ids)} onCatalog={setCatalog} compact />
            </div>
          )}
          <DocView
            content={tab.content}
            project={project.id}
            mode={tab.mode}
            draft={tab.draft}
            dirty={isDirty(tab)}
            saving={tab.saving}
            onDraft={(draft) => update(tab.path, { draft })}
            onMode={(mode) => update(tab.path, { mode })}
            onSave={() => save(tab.path)}
            onOpenExternal={() => openExternal(tab.path)}
            onLink={onLink}
            onPdfSaved={(path) => {
              if (path !== tab.path) { openPath(path); return; }
              api.readFile(project.id, path).then((content) => update(path, { content, draft: textOf(content) })).catch((e: Error) => setError(e.message));
            }}
            openWith={{
              kept: kept[extOf(tab.path)] ?? null,
              apps: () => api.openWithApps(project.id, tab.path).catch((e: Error) => { setError(e.message); return null; }),
              open: (app, always) => {
                if (app && always) keep(extOf(tab.path), app);
                api.openWith(project.id, tab.path, app?.id ?? '').catch((e: Error) => setError(e.message));
              },
              reset: () => keep(extOf(tab.path), null),
            }}
          />
        </>) : (
          <div className="welcome">
            <img className="hero" src={THINKING_CAT} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h1>{project.name}</h1>
            <p className="muted">{t('Open a file on the left, drop files here to keep them in the project, or start working with your AI tool.')}</p>
            <div className="welcome-tips muted small">
              <p><strong>{t('Inbox')}</strong> — {t('put the stories, logs and documents for the AI here.')}</p>
              <p><strong>{t('Activities')}</strong> — {t('every review, test design or analysis, with its results.')}</p>
              <p><strong>{t('Context')}</strong> — {t('what the AI knows about this system. You can edit it here.')}</p>
            </div>
          </div>
        )}
      </main>

      <SidePanel project={project} runId={runId} refreshKey={refreshKey} tools={tools} onOpenPath={openPath} onLaunch={(p) => setLaunch(p ?? { activity: 'open' })} onTerminal={addTerminal} onMyFolder={myFolder} onSetup={() => setShowSetup(true)} collapsed={panelRail} onToggle={togglePanel} graphOn={graphFocus} onGraph={toggleGraph} />
      </>}

      {dropping && <div className="drop-veil" role="status">{t('Drop to keep the files in this project')}</div>}

      <footer className="statusbar">
        <span>{project.name}</span>
        {tab && <span className="muted">{tab.path}</span>}
        {tab && isDirty(tab) && <span className="warn-text">{t('unsaved')}</span>}
        <span className="statusbar-spacer" />
        {words !== null && <span className="muted">{t('{n} words', { n: words })}</span>}
        <UsageStatus names={{ [project.id]: project.name }} terminals={terms} onTerminal={(id) => { setGraphFocus(false); setActiveTerm(id); }} />
      </footer>

      {termMenu && (
        <div className="menu-backdrop" onMouseDown={() => setTermMenu(null)}>
          <ul className="term-menu" role="menu" style={termMenu} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setTermMenu(null); }}>
            <li><button type="button" role="menuitem" autoFocus onClick={() => newTerminal('')}><IconTerminal size={15} /> {t('Terminal')} <span className="muted small">{t('your shell')}</span></button></li>
            {tools.filter((ai) => ai.kind === 'terminal').map((ai) => (
              <li key={ai.id}>
                <button type="button" role="menuitem" disabled={!ai.available} onClick={() => newTerminal(ai.id)}>
                  <IconPlay size={15} /> {ai.label} <span className="muted small">{ai.available ? ai.command : t('not installed')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {itemMenu && (
        <div className="menu-backdrop" onMouseDown={() => setItemMenu(null)} onContextMenu={(e) => { e.preventDefault(); setItemMenu(null); }}>
          <ul className="term-menu item-menu" role="menu" style={{ left: itemMenu.left, top: itemMenu.top }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setItemMenu(null); }}>
            {itemMenu.canCreate && <>
              <li><button type="button" role="menuitem" autoFocus onClick={() => startCreate(itemMenu.path, 'file')}><IconFile size={15} /> {t('New file')}</button></li>
              <li><button type="button" role="menuitem" onClick={() => startCreate(itemMenu.path, 'folder')}><IconFolder size={15} /> {t('New folder')}</button></li>
              <li className="ws-menu-sep" />
            </>}
            {isNote(itemMenu.path) && <>
              <li><button type="button" role="menuitem" autoFocus onClick={() => { const path = itemMenu.path; setItemMenu(null); void api.openNoteWindow({ project: project.id, path }); }}>
                <IconExternal size={15} /> {t('Open in the notebook')}
              </button></li>
              <li><button type="button" role="menuitem" onClick={() => toggleFavorite(itemMenu.path)}>
                <span className={`star-mark${favorites.has(itemMenu.path) ? '' : ' off'}`}><IconStar size={15} /></span> {favorites.has(itemMenu.path) ? t('Remove from favorites') : t('Add to favorites')}
              </button></li>
              <li className="ws-menu-sep" />
            </>}
            <li><button type="button" role="menuitem" autoFocus={!itemMenu.canCreate && !isNote(itemMenu.path)} onClick={() => revealItem(itemMenu.path)}><IconFolder size={15} /> {t('Show in folder')}</button></li>
            <li><button type="button" role="menuitem" onClick={() => copyItemPath(itemMenu.path)}><IconCopy size={15} /> {t('Copy path')}</button></li>
          </ul>
        </div>
      )}
      {creating && <NewEntryDialog project={project.id} parent={creating.parent} kind={creating.kind} onClose={() => setCreating(null)} onCreated={(path) => created(path, creating.kind)} />}
      {showSetup && <SetupDialog project={project} onClose={() => setShowSetup(false)}
        onSaved={(activity) => { setShowSetup(false); onProjectChanged(); if (activity) setLaunch({ activity }); }} />}
      {launch && <LaunchDialog project={project} tools={tools} preset={launch} onClose={() => setLaunch(null)} onTerminal={(t) => { setLaunch(null); addTerminal(t); }} />}
    </div>
  );
}
