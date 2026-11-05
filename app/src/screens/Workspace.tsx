// Project workspace, Obsidian-style: ribbon, file tree, tabs with documents
// (view and edit) and terminals (AI tools or a shell), and a side panel with
// the activity or project details.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react';
import { api, type FileContent, type ProjectSummary, type Tag, type TerminalRef, type ToolInfo, type TreeNode } from '../api';
import { conversationLanguage, t } from '../i18n';
import { defaultTool, recall, remember } from '../prefs';
import { DocView } from '../components/DocView';
import { FileTree, OTHER_FILES, friendlyName, groupTree } from '../components/FileTree';
import { NewMenu } from '../components/NewMenu';
import { LaunchDialog } from '../components/LaunchDialog';
import { NoteDialog } from '../components/NoteDialog';
import { OperationsPanel } from '../components/OperationsPanel';
import { OperationLaunch } from '../components/OperationLaunch';
import { ActivityRunView } from '../components/ActivityRunView';
import { OperationRunView } from '../components/OperationRunView';
import { SidePanel } from '../components/SidePanel';
import { SetupDialog } from '../components/SetupDialog';
import { TerminalView } from '../components/TerminalView';
import { UsageStatus } from '../components/UsageStatus';
import { TagPicker } from '../components/TagPicker';
import { SearchPanel } from '../components/SearchPanel';
import { IconCode, IconCopy, IconExternal, IconEyeOff, IconFile, IconFolder, IconGraph, IconMore, IconStar, IconTerminal, IconX } from '../components/Icons';
import { NewEntryDialog } from '../components/NewEntryDialog';
import { favoriteNotes, hideProject, isFavorite, setFavorite, touchRecentFile } from '../side-menu';
import { AddButton } from '../components/AddButton';
import { CraftDownloads } from '../components/CraftDownloads';
import { FileIcon } from '../icons';
import { Ribbon } from '../components/Ribbon';
import { Settings, type SettingsTab } from './Settings';
import { parseActivityLaunches, type ActivityLaunch, type ActivityLaunchPhase } from '../activity-launches';

interface Props { workspaceId: string; project: ProjectSummary; tools: ToolInfo[]; onHome: () => void; settings: SettingsTab | null; onSettings: (tab: SettingsTab | null) => void; onProjectChanged: () => void; launchOnOpen?: boolean; startSetup?: boolean; startNotice?: string; pendingTerminal?: TerminalRef | null; onPendingTerminal?: () => void; pendingPath?: string | null; onPendingPath?: () => void; search?: boolean; onSearch?: () => void; onFound?: (project: string, path?: string) => void; onToolsChanged: () => void }

interface Tab { path: string; content: FileContent; draft: string; mode: 'preview' | 'edit'; saving: boolean }
interface TermTab extends TerminalRef { running: boolean }

// The picture above the project name when nothing is open.
const THINKING_CAT = `./${encodeURIComponent('Thoughtful Pixel Cat at Work.png')}`;

const textOf = (c: FileContent): string => (c.kind === 'markdown' || c.kind === 'text' ? c.text : '');
const isDirty = (t: Tab): boolean => (t.content.kind === 'markdown' || t.content.kind === 'text') && t.content.editable && t.draft !== t.content.text;
const sidebarWidthWithinBounds = (width: number) => Math.max(180, Math.min(720, Math.round(width)));

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

export function Workspace({ workspaceId, project, tools, onHome, settings, onSettings, onProjectChanged, launchOnOpen = false, startSetup = false, startNotice = '', pendingTerminal = null, onPendingTerminal, pendingPath = null, onPendingPath, search = false, onSearch, onFound, onToolsChanged }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => recall('qa-sidebar') === 'closed');
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(() => {
    const saved = recall('qa-sidebar-width');
    const width = saved === null ? NaN : Number(saved);
    return Number.isFinite(width) ? sidebarWidthWithinBounds(width) : null;
  });
  const sidebar = useRef<HTMLElement>(null);
  const resizeSidebar = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const setSidebarOpen = (open: boolean) => { setSidebarCollapsed(!open); remember('qa-sidebar', open ? 'open' : 'closed'); };
  useEffect(() => { if (search) setSidebarOpen(true); }, [search]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') setSidebarOpen(true); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // The right panel is open or collapsed to a thin rail; the choice is remembered.
  const [panelRail, setPanelRail] = useState(() => recall('qa-panel') === 'rail');
  const togglePanel = () => setPanelRail((v) => { remember('qa-panel', v ? 'open' : 'rail'); return !v; });
  // A document with its own column on the right (a PDF's comments) takes the panel's place: one open at a time.
  const [docSide, setDocSide] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setDocSide(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener('moki:doc-side', on);
    return () => window.removeEventListener('moki:doc-side', on);
  }, []);
  const toggleSide = () => {
    if (docSide) { window.dispatchEvent(new Event('moki:doc-side-close')); setPanelRail(false); return; }
    togglePanel();
  };
  const [launch, setLaunch] = useState<{ activity: string; run?: string; skipActivity?: boolean; tool?: string; agent?: string; startAtTool?: boolean } | null>(startSetup && project.starter === 'blank' ? { activity: 'plan', startAtTool: true } : launchOnOpen ? { activity: 'open' } : null);
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
  const [showSetup, setShowSetup] = useState(startSetup && project.starter !== 'blank'); // after creating the project or linking a folder
  const [note, setNote] = useState<{ path: string | null } | null>(null); // open note (main area); path null = new note
  // A multi-agent operation in the main area: its start screen, or one of its runs.
  const [opView, setOpView] = useState<{ kind: 'launch' | 'run'; id: string } | null>(null);
  // An activity run, in the same place. The right panel stays on the project.
  const [activityView, setActivityView] = useState<string | null>(null);
  const showActivity = (id: string) => { setNote(null); setOpView(null); setActivityView(id); };
  const showOperationRun = (id: string) => { setNote(null); setActivityView(null); setOpView({ kind: 'run', id }); };
  // An activity of an operation: its start form, in place of the request.
  const startOperationForm = (id: string) => { setLaunch(null); setNote(null); setActivityView(null); setOpView({ kind: 'launch', id }); };
  const openListedRun = (id: string) => {
    setNote(null);
    void api.run(project.id, id).then((run) => {
      if (run.operation) showOperationRun(id); else showActivity(id);
    }).catch((e: Error) => setError(e.message));
  };
  const [opsTick, setOpsTick] = useState(0);
  const launchKey = `qa-activity-launches:${workspaceId}:${project.id}`;
  const [activityLaunches, setActivityLaunches] = useState<ActivityLaunch[]>(() => parseActivityLaunches(recall(launchKey)));
  const [activityLaunchTick, setActivityLaunchTick] = useState(0);
  useEffect(() => { remember(launchKey, JSON.stringify(activityLaunches)); }, [launchKey, activityLaunches]);
  const beginActivity = (activity: string, label: string): string | undefined => {
    if (activity === 'resume' || activity === 'talk') return undefined;
    const id = crypto.randomUUID().replace(/-/g, '');
    setActivityLaunches((items) => [{ id, activity, label, at: new Date().toISOString(), phase: 'sending' }, ...items]);
    setActivityLaunchTick((n) => n + 1);
    return id;
  };
  const updateActivity = (id: string | undefined, phase: ActivityLaunchPhase) => {
    if (id) setActivityLaunches((items) => items.map((item) => item.id === id ? { ...item, phase } : item));
  };
  const advanceRef = useRef<() => void>(() => {});
  const [termMenu, setTermMenu] = useState<{ left: number; top: number } | null>(null);
  const [craftOpen, setCraftOpen] = useState(false); // download of the ArtCraft apps
  // The tree item menu (right click or ⋯); path '' is the project folder. canCreate: a folder outside runs/.
  const [itemMenu, setItemMenu] = useState<{ path: string; canCreate: boolean; left: number; top: number } | null>(null);
  const [creating, setCreating] = useState<{ parent: string; kind: 'file' | 'folder'; ext?: string } | null>(null); // ext: from New › File, which also lets the folder be chosen
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Tags: the catalog, and the tags of this project's files (the tree marks them, the open file can change them).
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [fileTags, setFileTags] = useState<Record<string, string[]>>({});
  const [noteTitles, setNoteTitles] = useState<Record<string, string>>({});
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
    if (tabsRef.current.some((t) => t.path === path)) { touchRecentFile(project.id, path); setActive(path); return; }
    api.readFile(project.id, path).then((content) => {
      touchRecentFile(project.id, path);
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

  // A change made by Moki itself (a comment in a .md): the new text is saved at once, edits not saved yet included.
  const commit = useCallback((path: string, text: string) => {
    update(path, { draft: text, saving: true });
    api.writeFile(project.id, path, text)
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

  // Terminals outlive the project's screen: the ones still running for it come back as tabs, with what they printed meanwhile.
  useEffect(() => {
    void api.term()?.list?.(project.id).then((running) => {
      if (!running.length) return;
      setTerms((all) => [...all, ...running.filter((r) => !all.some((x) => x.id === r.id)).map((r) => ({ ...r, running: true }))]);
      setActiveTerm((cur) => cur ?? running[running.length - 1].id);
    }).catch(() => { /* no terminals to bring back */ });
  }, [project.id]);

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

  // Closing the tab stops what runs in it (leaving the project does not: the terminal comes back when it opens again).
  // When it ran a step of an operation, the main process tells the run.
  const closeTerm = (id: string) => {
    if (terms.find((t) => t.id === id)?.running && !window.confirm(t('Close this terminal? What is running in it will stop.'))) return;
    api.term()?.kill(id);
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
  useEffect(() => {
    const refresh = () => { setFavTick((n) => n + 1); void api.noteTitles(project.id).then((items) => setNoteTitles(Object.fromEntries(items.map((item) => [item.path, item.title])))).catch((e: Error) => setError(e.message)); };
    refresh();
    return api.onNotesChanged(refresh);
  }, [project.id]);
  const favorites = useMemo(() => new Set(favoriteNotes().filter((n) => n.project === project.id).map((n) => n.path)), [favTick, project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sidebar shows the tree in blocks (files on top, the Operations card, Project settings and MCPs at the bottom); each block is a FileTree with the same behavior.
  const groups = useMemo(() => groupTree(tree), [tree]);
  const treeProps = {
    tagColors: colorsOf, activePath: activeTerm || graphFocus ? null : active, onOpen: openPath, expanded,
    onNewNote: () => setNote({ path: null }), onMenu: openItemMenu, favorites, onIde: openIde, noteTitles,
    onToggle: (p: string) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; }),
  };
  // Where New › File may save: the project's own folders (not the activities), then its root.
  const folders = useMemo(() => [
    ...tree.filter((n) => n.type === 'dir' && !n.path.startsWith('.') && n.path !== 'runs').map((n) => ({ path: n.path, label: friendlyName(n.name) })),
    { path: '', label: t('the project folder') },
  ], [tree]);
  // "Open in the IDE" (the linked folder): straight in with one IDE installed, a menu with more (the default AI first).
  const [ideMenu, setIdeMenu] = useState<{ left: number; top: number } | null>(null);
  const editors = tools.filter((x) => x.kind === 'editor' && x.available).sort((a, b) => Number(b.id === defaultTool()) - Number(a.id === defaultTool()));
  const runIde = (tool: string) => {
    setIdeMenu(null);
    api.openInEditor(project.id, tool).catch((e: Error) => setError(e.message));
  };
  function openIde(at: { left: number; top: number }) {
    if (!editors.length) { setError(t('No IDE found on this computer: install VS Code or Cursor (Settings › My AIs).')); return; }
    if (editors.length === 1) runIde(editors[0].id); else setIdeMenu({ left: Math.min(at.left, window.innerWidth - 240), top: at.top });
  }
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
    setExpanded((s) => { const n = new Set(s); if (kind === 'file' && !path.includes('/')) n.add(OTHER_FILES); path.split('/').slice(0, kind === 'folder' ? undefined : -1).reduce((acc, seg) => { const p = acc ? `${acc}/${seg}` : seg; n.add(p); return p; }, ''); return n; });
    if (kind === 'file') openPath(path, /\.(md|txt)$/i.test(path) ? 'edit' : 'preview'); // a new spreadsheet or Word file is shown, not edited here
  };
  const revealItem = (path: string) => {
    setItemMenu(null);
    api.revealPath(project.id, path).catch((e: Error) => setError(e.message));
  };
  const copyItemPath = (path: string) => {
    setItemMenu(null);
    api.copyPath(project.id, path).then((full) => setNotice(t('Path copied: {path}', { path: full }))).catch((e: Error) => setError(e.message));
  };

  // Leaving the workspace keeps its terminals running (they come back with it); only unsaved changes ask first.
  const canLeave = () => !(tabsRef.current.some(isDirty) && !window.confirm(t('There are unsaved changes. Leave anyway?')));

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
      if (!(e.ctrlKey || e.metaKey) || !active || activeTerm || graphFocus || note || (document.activeElement as HTMLElement | null)?.closest('.note-inline')) return; // note editors own their shortcuts
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
      className={`workspace${(panelRail || docSide) && !settings ? ' panel-rail' : ''}${sidebarCollapsed && !settings ? ' sidebar-collapsed' : ''}${settings ? ' is-settings' : ''}${dropping ? ' dropping' : ''}`}
      style={sidebarWidth === null ? undefined : { '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
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
        onPanel={() => setSidebarOpen(sidebarCollapsed)}
        sidebarCollapsed={sidebarCollapsed}
        searchOn={search}
        onSearch={onSearch ? () => { setSidebarOpen(true); onSearch(); } : undefined}
      />

      {settings ? (
        <main className="main">
          <Settings tab={settings} onTab={onSettings} onClose={() => onSettings(null)} project={project} projects={[project]} tools={tools} onTerminal={(term) => { onSettings(null); addTerminal(term); }} onToolsChanged={onToolsChanged} />
        </main>
      ) : <>
      <aside className="sidebar" ref={sidebar}>
        <div className="sidebar-resize" role="separator" aria-orientation="vertical" aria-label={t('Resize file sidebar')} aria-valuemin={180} aria-valuemax={720} aria-valuenow={sidebarWidth ?? 260} tabIndex={0}
          onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); const width = sidebar.current?.getBoundingClientRect().width ?? 260; resizeSidebar.current = { startX: e.clientX, startWidth: width, width }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { const drag = resizeSidebar.current; if (!drag) return; drag.width = sidebarWidthWithinBounds(drag.startWidth + e.clientX - drag.startX); setSidebarWidth(drag.width); }}
          onPointerUp={() => { const drag = resizeSidebar.current; if (drag) remember('qa-sidebar-width', String(drag.width)); resizeSidebar.current = null; }}
          onPointerCancel={() => { resizeSidebar.current = null; }}
          onKeyDown={(e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); const width = sidebarWidthWithinBounds((sidebar.current?.getBoundingClientRect().width ?? 260) + (e.key === 'ArrowRight' ? 20 : -20)); setSidebarWidth(width); remember('qa-sidebar-width', String(width)); }} />
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
          <FileTree {...treeProps} nodes={groups.main} />
        </div>
        {/* Fixed at the bottom of the sidebar, whatever the scroll: Project settings and the MCP servers. */}
        <div className="sidebar-foot"><FileTree {...treeProps} nodes={groups.settings} /></div>
        </>}
      </aside>

      <main className="main">
        {(activityView || opView) && !note && (
          <div className="note-host ops-host">
            {activityView
              ? <ActivityRunView key={activityView} project={project.id} run={activityView} onClose={() => setActivityView(null)}
                  onResume={() => setLaunch({ activity: 'resume', run: activityView })}
                  onOpenFile={(path) => { setActivityView(null); openPath(path); }} />
              : opView?.kind === 'launch'
              ? <OperationLaunch key={opView.id} project={project.id} operation={opView.id} tools={tools} onClose={() => setOpView(null)}
                  onStarted={(run) => { setOpView({ kind: 'run', id: run.id }); advanceOps(); }} />
              : opView && <OperationRunView key={opView.id} project={project.id} run={opView.id} tick={opsTick} tools={tools}
                  hasTerminal={(id) => terms.some((x) => x.id === id)}
                  onTerminal={(term) => { setOpView(null); addTerminal(term); }}
                  onOpenFile={(path) => openPath(path)} onClose={() => setOpView(null)} onChanged={advanceOps} />}
          </div>
        )}
        {note && (
          <div className="note-host">
            <NoteDialog key={note.path ?? 'new'} embedded project={project.id} path={note.path} onMyAis={() => onSettings('ai')}
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
              <div key={doc.path} role="tab" aria-selected={on} className={`tab${on ? ' active' : ''}`} onClick={() => { touchRecentFile(project.id, doc.path); setGraphFocus(false); setActive(doc.path); setActiveTerm(null); }} title={doc.path}
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
          <AddButton size="sm" variant="ghost" title={t('New: terminal, AI or file')} onClick={openTermMenu} />
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
          <DocView
            key={tab.path}
            content={tab.content}
            tags={tab.path !== 'project.json' && tab.path !== 'tags.json' && !tab.path.startsWith('@folder') ? <TagPicker catalog={catalog} value={fileTags[tab.path] ?? []} onChange={(ids) => tagFile(tab.path, ids)} onCatalog={setCatalog} compact /> : undefined}
            project={project.id}
            mode={tab.mode}
            draft={tab.draft}
            dirty={isDirty(tab)}
            saving={tab.saving}
            onDraft={(draft) => update(tab.path, { draft })}
            onMode={(mode) => update(tab.path, { mode })}
            onSave={() => save(tab.path)}
            onCommit={(text) => commit(tab.path, text)}
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
            <p className="muted">{t('Open or drop a file to get started.')}</p>
          </div>
        )}
      </main>

      <SidePanel project={project} runId={runId} refreshKey={refreshKey} tools={tools} onOpenPath={openPath} onLaunch={(p) => setLaunch(p ?? { activity: 'open' })} onOperation={startOperationForm} onOperationRun={showOperationRun} onOpenRun={openListedRun} onTerminal={addTerminal} onActivityStart={beginActivity} onActivityUpdate={updateActivity} onSetup={() => setShowSetup(true)} onProjectChanged={onProjectChanged} collapsed={panelRail || docSide} onToggle={toggleSide} graphOn={graphFocus} onGraph={toggleGraph} onMyAis={() => onSettings('ai')}
        operations={(
          <OperationsPanel project={project.id} tick={opsTick} active={activityView ?? opView?.id ?? null} launches={activityLaunches} activityLaunchTick={activityLaunchTick}
            onDismissLaunch={(id) => setActivityLaunches((items) => items.filter((item) => item.id !== id))} onActivityRun={showActivity}
            onResumeActivity={(id) => setLaunch({ activity: 'resume', run: id })}
            onRun={showOperationRun} />
        )} />
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
        <NewMenu at={termMenu} tools={tools} onTerminal={newTerminal} onClose={() => setTermMenu(null)}
          onFile={(ext) => { setTermMenu(null); setCreating({ parent: tree.some((n) => n.path === 'inbox') ? 'inbox' : '', kind: 'file', ext }); }}
          onCraft={() => { setTermMenu(null); setCraftOpen(true); }} />
      )}
      {ideMenu && (
        <div className="menu-backdrop" onMouseDown={() => setIdeMenu(null)}>
          <ul className="term-menu" role="menu" aria-label={t('Open in the IDE')} style={ideMenu} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setIdeMenu(null); }}>
            {editors.map((ed, i) => (
              <li key={ed.id}><button type="button" role="menuitem" autoFocus={i === 0} onClick={() => runIde(ed.id)}><IconCode size={15} /> {ed.label.replace(/ \(.*\)$/, '')}</button></li>
            ))}
          </ul>
        </div>
      )}
      {craftOpen && <CraftDownloads onClose={() => setCraftOpen(false)} />}
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
      {creating && <NewEntryDialog project={project.id} parent={creating.parent} kind={creating.kind} ext={creating.ext} folders={creating.ext ? folders : undefined} onClose={() => setCreating(null)} onCreated={(path) => created(path, creating.kind)} />}
      {showSetup && <SetupDialog project={project} onClose={() => setShowSetup(false)}
        onSaved={(activity) => { setShowSetup(false); onProjectChanged(); if (activity) setLaunch({ activity }); }} />}
      {launch && <LaunchDialog project={project} tools={tools} preset={launch} onClose={() => setLaunch(null)} onTerminal={(t) => { setLaunch(null); addTerminal(t); }} onActivityStart={beginActivity} onActivityUpdate={updateActivity} onOperation={startOperationForm} onMyAis={() => { setLaunch(null); onSettings('ai'); }} />}
    </div>
  );
}
