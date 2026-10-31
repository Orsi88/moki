// Electron main process of the Moki desktop app. Opens one window,
// exposes the service to the UI through a single validated IPC channel, runs
// the embedded terminals, and watches the open project folder so files written
// by the AI tools appear live.

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, screen, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { existsSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../scripts/lib/repo.mjs';
import { TOOLS, isTool, listProjects, projectsDir, type ToolKey } from '../scripts/lib/core.ts';
import { callService, createService } from './service.ts';
import { launchInTerminal, launchTool, openFolder } from './launcher.ts';
import { notebookKey, noteQuery, parseNoteRequest, type NoteRequest } from './notes.ts';
import { setWorkspaceEnv } from './workspaces.ts';
import { appChooser } from './open-with.ts';
import { pdfcraftAvailable, runPdfcraft } from './pdfcraft.ts';
import { createTerminals, shellSpec } from './terminals.ts';
import { memoryUsage, planUsage } from './usage.ts';

const DIST = dirname(fileURLToPath(import.meta.url)); // app/dist-electron
const UI = join(DIST, '..', 'dist'); // app/dist, inside the app (not the framework folder)
const ICON = join(UI, 'icon.png');
// The tool runner must be a real file on disk: in the installer it is unpacked from app.asar.
process.env.QA_RUN_TOOL = join(DIST, 'run-tool.mjs').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);

const terminals = createTerminals((channel, id, payload) => win?.webContents.send(channel, id, payload));

// QA_FAKE_TOOLS (UI tests only): every AI tool looks installed and nothing is started.
const fakeTools = process.env.QA_FAKE_TOOLS === '1';

const service = createService(ROOT, {
  // Terminal tools open in a tab of the app; editors, or no node-pty, use the external launcher.
  launch: (tool, prompt, root, plugins = []) => (fakeTools ? { opened: true, message: 'fake' }
    : terminals.available() && !TOOLS[tool].clipboard ? launchInTerminal(tool, prompt, root, terminals.prepare, plugins) : launchTool(tool, prompt, root, plugins)),
  ...(fakeTools ? { detectTools: () => Object.fromEntries(Object.keys(TOOLS).map((k) => [k, true])) as Record<ToolKey, boolean> } : {}),
  openFolder,
  openPath: (file) => { void shell.openPath(file); },
  reveal: (path) => shell.showItemInFolder(path),
  copy: (text) => clipboard.writeText(text),
  appChooser,
  pdfcraft: { available: pdfcraftAvailable, run: runPdfcraft },
  trash: (path) => shell.trashItem(path),
  pickFolder: async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  },
  onWorkspace: (dir) => setWorkspaceEnv(ROOT, dir),
});

let win: BrowserWindow | null = null;
let watcher: FSWatcher | null = null;
const noteWindows = new Map<string, BrowserWindow>();

function isNoteWindow(contents: WebContents): boolean {
  for (const note of noteWindows.values()) if (!note.isDestroyed() && note.webContents === contents) return true;
  return false;
}

// Only our own UI (loaded from app/dist) may call the service.
function trusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return Boolean(event.senderFrame?.url.startsWith('file://')) && (event.sender === win?.webContents || isNoteWindow(event.sender));
}

// The notebook: its own window, so it can be dragged past the main window onto the desktop. One per group:
// the loose notes, or one project's notes. A note of a group whose notebook is open becomes a tab there.
function openNoteWindow(target: NoteRequest): void {
  const key = notebookKey(target);
  const existing = noteWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.webContents.send('qa:notebook-open', { project: target.project, path: target.path, loose: target.loose });
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  const width = 760;
  const height = 640;
  const anchor = win?.getBounds() ?? screen.getPrimaryDisplay().workArea;
  const area = screen.getDisplayMatching(anchor).workArea;
  const offset = noteWindows.size * 28;
  const x = Math.min(Math.max(Math.round(anchor.x + (anchor.width - width) / 2) + offset, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(Math.round(anchor.y + 48) + offset, area.y), area.y + area.height - height);
  const note = new BrowserWindow({
    width, height, x, y, minWidth: 440, minHeight: 360,
    title: 'Moki',
    frame: false,
    thickFrame: true,
    backgroundColor: target.theme === 'light' ? '#fbf8f1' : '#1c1b19',
    icon: existsSync(ICON) ? ICON : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(DIST, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  noteWindows.set(key, note);
  note.once('ready-to-show', () => note.show());
  note.on('closed', () => { if (noteWindows.get(key) === note) noteWindows.delete(key); });
  void note.loadFile(join(UI, 'index.html'), { query: noteQuery(target) });
  note.webContents.on('will-navigate', (e) => e.preventDefault());
  note.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Moki',
    icon: existsSync(ICON) ? ICON : undefined,
    backgroundColor: "#1c1b19",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(DIST, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // QA_OPEN_PROJECT opens a project directly, QA_OPEN_VIEW=library|launch the agent library or the launch wizard (used by checks and shortcuts).
  const query: Record<string, string> = {};
  if (process.env.QA_OPEN_PROJECT) query.project = process.env.QA_OPEN_PROJECT;
  if (['library', 'launch'].includes(process.env.QA_OPEN_VIEW ?? '')) query.view = process.env.QA_OPEN_VIEW as string;
  void win.loadFile(join(UI, 'index.html'), { query });

  // Visual check for development: QA_SCREENSHOT=<file.png> saves the window and quits.
  const shot = process.env.QA_SCREENSHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void win?.webContents.capturePage().then((image) => {
          writeFileSync(shot, image.toPNG());
          app.quit();
        });
      }, Number(process.env.QA_SCREENSHOT_DELAY ?? 1500));
    });
  }

  // The UI never navigates away or opens windows; web links go to the browser.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    win = null;
    for (const note of noteWindows.values()) if (!note.isDestroyed()) note.close();
    noteWindows.clear();
    watcher?.close();
    watcher = null;
    terminals.killAll();
  });
}

// A UI test sets this so it does not share the profile, or the single-instance lock, with the app you have open.
if (process.env.QA_USER_DATA) app.setPath('userData', process.env.QA_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName('Moki');
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, done) => done(false));

    ipcMain.handle('qa:call', async (event, method: unknown, args: unknown) => {
      if (!trusted(event)) return { ok: false, error: 'Untrusted caller.' };
      return callService(service, method, args);
    });

    // Watch one project at a time; changes are debounced and sent to the UI.
    ipcMain.handle('qa:watch', (event, project: unknown) => {
      if (!trusted(event)) return false;
      watcher?.close();
      watcher = null;
      if (typeof project !== 'string' || !listProjects(ROOT).includes(project)) return false;
      let timer: NodeJS.Timeout | null = null;
      try {
        watcher = watch(join(projectsDir(ROOT), project), { recursive: true }, () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => win?.webContents.send('qa:changed', project), 400);
        });
      } catch { return false; }
      return true;
    });

    // Embedded terminals: the UI only refers to terminals prepared here, by id.
    const isSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 1000;
    // New terminal tab: the user's shell (tool '') or a terminal AI tool started without a request.
    ipcMain.handle('qa:term-new', (event, tool: unknown) => {
      if (!trusted(event)) return { error: 'Untrusted caller.' };
      if (!terminals.available()) return { error: 'Terminals inside the app are not available on this computer (node-pty is not installed).' };
      if (tool === '') return { terminal: { id: terminals.prepare(shellSpec(ROOT)), title: 'Terminal' } };
      if (typeof tool !== 'string' || !isTool(tool) || !TOOLS[tool].command || TOOLS[tool].clipboard) return { error: 'Unknown tool.' };
      const r = launchInTerminal(tool, '', ROOT, terminals.prepare);
      return r.terminal ? { terminal: r.terminal } : { error: r.message };
    });
    ipcMain.handle('qa:term-start', (event, id: unknown, cols: unknown, rows: unknown, project: unknown) => {
      if (!trusted(event) || typeof id !== 'string' || !isSize(cols) || !isSize(rows)) return 'Invalid terminal.';
      return terminals.start(id, cols, rows, typeof project === 'string' && listProjects(ROOT).includes(project) ? project : '');
    });
    ipcMain.on('qa:term-input', (event, id: unknown, data: unknown) => {
      if (trusted(event) && typeof id === 'string' && typeof data === 'string' && data.length <= 1_000_000) terminals.write(id, data);
    });
    ipcMain.on('qa:term-resize', (event, id: unknown, cols: unknown, rows: unknown) => {
      if (trusted(event) && typeof id === 'string' && isSize(cols) && isSize(rows)) terminals.resize(id, cols, rows);
    });
    ipcMain.on('qa:term-kill', (event, id: unknown) => { if (trusted(event) && typeof id === 'string') terminals.kill(id); });

    // Status bar: plan usage of the AI tools, and memory of the computer, of Moki and of each project's terminals.
    ipcMain.handle('qa:usage', async (event, refresh: unknown) => {
      if (!trusted(event)) return null;
      const appBytes = app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize * 1024, 0);
      const [memory, plans] = await Promise.all([memoryUsage(terminals.list(), appBytes), planUsage(refresh === true)]);
      return { memory, plans };
    });

    ipcMain.handle('qa:open-link', (event, url: unknown) => {
      if (trusted(event) && typeof url === 'string' && /^https?:\/\//.test(url)) void shell.openExternal(url);
    });

    // From the main window, or from the loose notebook when a note is sent to a project.
    ipcMain.handle('qa:note-window', (event, raw: unknown) => {
      if (!trusted(event)) return false;
      const target = parseNoteRequest(raw, ROOT);
      if (!target) return false;
      openNoteWindow(target);
      return true;
    });
    ipcMain.on('qa:notes-changed', (event) => { if (trusted(event)) win?.webContents.send('qa:notes-changed'); });
    // A note window asks the main window to show a terminal it started, or a file it mentions.
    const fromNote = (event: IpcMainEvent, project: unknown): project is string =>
      trusted(event) && isNoteWindow(event.sender) && typeof project === 'string' && listProjects(ROOT).includes(project);
    const toFront = () => { if (!win) return; if (win.isMinimized()) win.restore(); win.focus(); };
    ipcMain.on('qa:show-terminal', (event, project: unknown, id: unknown, title: unknown) => {
      if (!fromNote(event, project) || typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id) || typeof title !== 'string') return;
      win?.webContents.send('qa:show-terminal', project, { id, title: title.slice(0, 120) });
      toFront();
    });
    ipcMain.on('qa:open-in-main', (event, project: unknown, path: unknown) => {
      if (!fromNote(event, project) || typeof path !== 'string' || path.length > 400 || path.startsWith('/') || path.split(/[\\/]/).includes('..')) return;
      win?.webContents.send('qa:open-in-main', project, path);
      toFront();
    });
    ipcMain.on('qa:note-max', (event) => {
      const note = BrowserWindow.fromWebContents(event.sender);
      if (!note || !isNoteWindow(event.sender)) return;
      if (note.isMaximized()) note.unmaximize(); else note.maximize();
    });

    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  // Programs in the terminal tabs never outlive the app, also when it is stopped by a signal.
  app.on('will-quit', () => terminals.killAll());
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => app.quit());
}
