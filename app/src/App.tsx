import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, hasBridge, pageParams, type ProjectSummary, type Starter, type TerminalRef, type ToolInfo, type WorkspaceInfo } from './api';
import { t, useLang } from './i18n';
import { SearchPanel } from './components/SearchPanel';
import { hiddenIds, setMenuWorkspace } from './side-menu';
import { Ribbon } from './components/Ribbon';
import { UsageStatus } from './components/UsageStatus';
import { WorkspacePicker } from './screens/WorkspacePicker';
import type { SettingsTab } from './screens/Settings';

// Each window loads only the screens it shows: the search and note windows are separate renderers,
// and the editor, PDF, terminal and drawing code of the main screens would otherwise load in every one.
const Home = lazy(() => import('./screens/Home').then((m) => ({ default: m.Home })));
const Workspace = lazy(() => import('./screens/Workspace').then((m) => ({ default: m.Workspace })));
const Notebook = lazy(() => import('./components/Notebook').then((m) => ({ default: m.Notebook })));
const Loading = ({ children }: { children: ReactNode }) => <Suspense fallback={<div className="notice muted">{t('Loading…')}</div>}>{children}</Suspense>;

const noteParams = pageParams();
const isNoteWindow = noteParams.get('view') === 'note';
const isSearchWindow = noteParams.get('view') === 'search';

const LAST_PROJECT = 'qa-last-project';
const recall = () => { try { return window.localStorage.getItem(LAST_PROJECT); } catch { return null; } };
const remember = (id: string | null) => {
  try { if (id) window.localStorage.setItem(LAST_PROJECT, id); else window.localStorage.removeItem(LAST_PROJECT); } catch { /* optional */ }
};

export function App() {
  useLang(); // the whole app re-renders in the new language
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  // A project just made: the structured one opens with "Set up"; one opened from a folder says what linking it did.
  const [created, setCreated] = useState<{ id: string; setup: boolean; notice: string } | null>(null);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [launchOnOpen, setLaunchOnOpen] = useState(false);
  const [pendingTerm, setPendingTerm] = useState<TerminalRef | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null); // a file a note window asked to open
  // The open workspace. null: the app starts on the workspace picker, like Obsidian's vault switcher.
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [search, setSearch] = useState(false); // the search panel replaces the left list
  const toggleSearch = useCallback(() => { void window.qa?.openSearchWindow?.(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!isSearchWindow && !isNoteWindow && (e.ctrlKey || e.metaKey) && (e.shiftKey || projectId) && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleSearch(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSearch, projectId]);

  // Note windows can show a terminal they started, or open a file they mention, here.
  useEffect(() => {
    if (isNoteWindow) return;
    const show = (project: string) => { setSettings(null); setProjectId(project); remember(project); };
    const offTerm = window.qa?.onShowTerminal?.((project, terminal) => { setPendingTerm(terminal); show(project); });
    const offPath = window.qa?.onOpenInMain?.((project, path) => { setPendingPath(path); show(project); });
    return () => { offTerm?.(); offPath?.(); };
  }, []);

  const loadProjects = useCallback(() => api.projects().then(setProjects), []);
  const loadTools = useCallback(() => { api.integrations().then(setTools).catch(() => { /* keeps the list it has */ }); }, []);

  useEffect(() => {
    if (isSearchWindow) { setMenuWorkspace(noteParams.get('workspace') ?? ''); setReady(true); return; }
    if (!hasBridge()) { setError(t('Moki must be opened with the qa command.')); return; }
    Promise.all([api.session(), api.projects(), api.integrations(), api.workspaces()])
      .then(([session, list, toolList, spaces]) => {
        setVersion(session.version);
        setProjects(list);
        setTools(toolList);
        setMenuWorkspace(spaces.active);
        const params = pageParams();
        if (params.get('view') === 'note') { setReady(true); return; }
        const requested = params.get('project');
        // A project asked for at start (checks, shortcuts) opens in the workspace opened last; otherwise the picker comes first.
        if (!requested) { setReady(true); return; }
        setWorkspace(spaces.list.find((w) => w.id === spaces.active) ?? null);
        if (params.get('view') === 'library') setSettings('agents');
        if (params.get('view') === 'launch') setLaunchOnOpen(true);
        const last = requested || recall();
        // A project hidden from the list is not reopened on its own. An explicit request still opens it.
        if (last && list.some((p) => p.id === last) && (requested || !hiddenIds().includes(last))) setProjectId(last);
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const open = (id: string) => { setSettings(null); setProjectId(id); setCreated(null); remember(id); };
  const home = () => { setSettings(null); setProjectId(null); setCreated(null); remember(null); void loadProjects(); };
  // New project: Enter on the name (setup false) opens it as is; "Create and customize" opens it with "Set up".
  // With a folder (from "Open a project"), the project is linked to it and says what linking did.
  const create = async (name: string, starter: Starter, tags: string[] = [], setup = true, folder?: string) => {
    const project = await api.createProject(name, starter, folder, tags);
    await loadProjects();
    const notice = folder ? (await import('./screens/Workspace')).linkedNotice(project) : '';
    open(project.id);
    setCreated({ id: project.id, setup, notice });
  };
  const onProjectChanged = useCallback(() => { void loadProjects(); }, [loadProjects]);
  // A workspace was opened (picker or switcher): its projects, on the start screen. null goes back to the picker.
  const openWorkspace = (w: WorkspaceInfo | null) => {
    window.qa?.closeSearchWindow?.();
    setSettings(null); setProjectId(null); setCreated(null); remember(null);
    setWorkspace(w);
    if (!w) return;
    setMenuWorkspace(w.id);
    void loadProjects();
  };

  if (error) return <div className="notice"><img src="./favicon.svg" alt="" width={40} height={40} /><h1>{t('Something went wrong')}</h1><p>{error}</p></div>;
  if (!ready) return <div className="notice muted">{t('Loading…')}</div>;
  if (isSearchWindow) return <div className="search-window"><SearchPanel onOpenProject={(id) => window.qa?.searchOpen?.(id, '')} onOpenFile={(id, path) => window.qa?.searchOpen?.(id, path)} onClose={() => window.close()} /></div>;
  if (isNoteWindow) {
    const loose = noteParams.get('loose');
    return (
      <div className="note-float">
        <Loading><Notebook project={noteParams.get('project')} path={noteParams.get('path')} loose={loose} projects={projects.map((p) => ({ id: p.id, name: p.name }))} /></Loading>
      </div>
    );
  }

  // A search result: its project, and the file in it.
  const openFound = (id: string, path?: string) => {
    setSearch(false); setSettings(null); setCreated(null);
    setProjectId(id); remember(id);
    if (path) setPendingPath(path);
  };

  const openTerminal = (terminal: TerminalRef, id: string) => {
    setPendingTerm(terminal);
    setSettings(null);
    setProjectId(id);
    remember(id);
  };

  if (!workspace) return <WorkspacePicker version={version} onOpen={openWorkspace} />;

  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="shell">
        <Ribbon settingsOn={settings !== null} onHome={home} onSettings={() => setSettings(settings ? null : 'agents')} searchOn={search} onSearch={toggleSearch} />
        <Loading><Home projects={projects} tools={tools} version={version} onOpen={open} onCreate={create} settings={settings} onSettings={setSettings} project={null} onTerminal={openTerminal} workspace={workspace} onWorkspace={openWorkspace} search={search} onSearch={toggleSearch} onFound={openFound} onDeleted={() => { void loadProjects(); }} onToolsChanged={loadTools} /></Loading>
        <footer className="statusbar"><span className="statusbar-spacer" /><UsageStatus names={Object.fromEntries(projects.map((p) => [p.id, p.name]))} /></footer>
      </div>
    );
  }
  return <Loading><Workspace key={`${workspace.id}:${project.id}`} workspaceId={workspace.id} project={project} tools={tools} onHome={home} settings={settings} onSettings={setSettings} onProjectChanged={onProjectChanged} launchOnOpen={launchOnOpen} startSetup={created?.id === project.id && created.setup} startNotice={created?.id === project.id ? created.notice : ''} pendingTerminal={pendingTerm} onPendingTerminal={() => setPendingTerm(null)} pendingPath={pendingPath} onPendingPath={() => setPendingPath(null)} search={search} onSearch={toggleSearch} onFound={openFound} onToolsChanged={loadTools} /></Loading>;
}
