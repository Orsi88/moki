// Electron main process of the Moki desktop app. Opens one window,
// exposes the service to the UI through a single validated IPC channel, runs
// the embedded terminals, and watches the open project folder so files written
// by the AI tools appear live.

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, screen, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, workspaceDir } from '../scripts/lib/repo.mjs';
import { TOOLS, isProject, isTool, projectRepository, projectSummary, projectsDir, type ToolKey } from '../scripts/lib/core.ts';
import { callService, createService, servedFile, type CallResult } from './service.ts';
import { FILE_SCHEME, createFileGrants } from './file-protocol.ts';
import { watchProject } from './project-watch.ts';
import { launchInTerminal, launchTool, openFolder } from './launcher.ts';
import { notebookKey, noteQuery, parseNoteRequest, type NoteRequest } from './notes.ts';
import { setWorkspaceEnv } from './workspaces.ts';
import { appChooser } from './open-with.ts';
import { pdfcraftAvailable, runPdfcraft } from './pdfcraft.ts';
import { createTerminals, shellSpec } from './terminals.ts';
import { memoryUsage, planUsage } from './usage.ts';
import { fixToolPath } from './tool-path.ts';
import { describeSwitches, resolveSwitches } from './chromium-switches.ts';
import { createParseClient } from './parse-pool.ts';

const DIST = dirname(fileURLToPath(import.meta.url)); // app/dist-electron
const UI = join(DIST, '..', 'dist'); // app/dist, inside the app (not the framework folder)
const ICON = join(UI, 'icon-512.png'); // 512 is enough for a window icon; the 1254 px icon.png stays for the installers
// The tool runner must be a real file on disk: in the installer it is unpacked from app.asar.
process.env.QA_RUN_TOOL = join(DIST, 'run-tool.mjs').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
// Moki's MCP server, which the AI tools started from the app get (bundled from ide/mcp/server.ts), unpacked the same way.
process.env.QA_MCP_SERVER = join(DIST, 'mcp.mjs').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);

// A terminal that ended may have run a step of an operation: the run learns it here, even when its project is not on screen.
const terminals = createTerminals((channel, id, payload) => win?.webContents.send(channel, id, payload), (id, project) => {
  if (project) { try { service.operationStepExited(project, id); } catch { /* a run that is gone */ } }
});

// QA_FAKE_TOOLS (UI tests only): every AI tool looks installed and nothing is started.
const fakeTools = process.env.QA_FAKE_TOOLS === '1';

const service = createService(ROOT, {
  // Terminal tools open in a tab of the app; editors, or no node-pty, use the external launcher.
  launch: (tool, prompt, root, plugins = [], extra = []) => (fakeTools ? { opened: true, message: 'fake' }
    : terminals.available() && !TOOLS[tool].clipboard ? launchInTerminal(tool, prompt, root, terminals.prepare, plugins, extra) : launchTool(tool, prompt, root, plugins, extra)),
  ...(fakeTools ? {
    detectTools: () => Object.fromEntries(Object.keys(TOOLS).map((k) => [k, true])) as Record<ToolKey, boolean>,
    which: (command: string) => command,
    runCommand: async (_command: string, args: string[]) => (args[0] === '--version' ? '1.0.0 (fake)' : ''),
  } : { fixPath: () => fixToolPath() }),
  openFolder,
  openPath: (file) => { void shell.openPath(file); },
  reveal: (path) => shell.showItemInFolder(path),
  copy: (text) => clipboard.writeText(text),
  appChooser,
  // Word and spreadsheet previews parse on a worker thread; like run-tool.mjs it is a real file, unpacked from app.asar.
  parse: createParseClient({ workerPath: join(DIST, 'parse-worker.mjs').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`) }),
  // PDF comments and page edits: PdfCraft when it is installed, otherwise Moki itself (desktop/pdf-local.ts).
  pdfcraft: { available: () => true, run: (steps, root) => (pdfcraftAvailable() ? runPdfcraft(steps, root) : import('./pdf-local.ts').then((m) => m.runPdfLocal(steps, root))) },
  trash: (path) => shell.trashItem(path),
  pickFolder: async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  },
  saveFile: async (name, extension, title) => {
    const parent = BrowserWindow.getFocusedWindow() ?? win; // the note window or the main one
    if (!parent) return null;
    const r = await dialog.showSaveDialog(parent, { title: title ?? 'Export the note', defaultPath: `${name}.${extension}`, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    return r.canceled ? null : r.filePath ?? null;
  },
  pickFile: async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { title: 'Choose a .zip file', properties: ['openFile'], filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  },
  onWorkspace: (dir) => { searchWindow?.close(); setWorkspaceEnv(ROOT, dir); },
  killTerminal: (id) => terminals.kill(id),
  terminalAlive: (id) => terminals.alive(id),
  writeTerminal: (id, data) => terminals.write(id, data),
});

let win: BrowserWindow | null = null;
let searchWindow: BrowserWindow | null = null;
let watcher: (() => void) | null = null; // stops the watch of the open project
let linkedWatcher: (() => void) | null = null; // stops the watch of the open project's linked folder
const noteWindows = new Map<string, BrowserWindow>();

// Every custom scheme of the app goes in this one list: Electron takes the call once, before 'ready'.
protocol.registerSchemesAsPrivileged([
  // moki-file://<token>/: a PDF or image of the open project, read by URL with Range (desktop/file-protocol.ts).
  { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// The URLs a window may read are granted by qa:call (below) and die with the window or its project.
const files = createFileGrants({
  workspace: () => workspaceDir(ROOT),
  bases: (project) => (isProject(project, ROOT) ? [join(projectsDir(ROOT), project), projectRepository(project, ROOT)].filter(Boolean) : null),
});
const granting = new Set<number>(); // windows whose end is already watched

// A PDF or image the UI reads comes with the URL it loads it from, granted to the window that asked (nothing else sends bytes).
function withFileUrl(sender: WebContents, project: unknown, result: CallResult): CallResult {
  const file = result.ok ? servedFile(result.value) : undefined;
  if (!result.ok || !file) return result;
  const url = typeof project === 'string' ? files.grant(sender.id, project, file) : null;
  if (!url) return { ok: false, error: 'File not found.' };
  if (!granting.has(sender.id)) {
    granting.add(sender.id);
    sender.once('destroyed', () => { granting.delete(sender.id); files.revokeScope(sender.id); });
  }
  return { ok: true, value: { ...(result.value as object), url } };
}

function isNoteWindow(contents: WebContents): boolean {
  for (const note of noteWindows.values()) if (!note.isDestroyed() && note.webContents === contents) return true;
  return false;
}

// Only our own UI (loaded from app/dist) may call the service.
function trusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return Boolean(event.senderFrame?.url.startsWith('file://')) && (event.sender === win?.webContents || isNoteWindow(event.sender));
}

function fromSearch(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return Boolean(event.senderFrame?.url.startsWith('file://')) && event.sender === searchWindow?.webContents;
}

function openSearchWindow(): void {
  if (searchWindow && !searchWindow.isDestroyed()) { if (searchWindow.isMinimized()) searchWindow.restore(); searchWindow.focus(); return; }
  const search = new BrowserWindow({ width: 800, height: 650, minWidth: 440, minHeight: 360, title: 'Moki', icon: existsSync(ICON) ? ICON : undefined, autoHideMenuBar: true, show: false,
    webPreferences: { preload: join(DIST, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  searchWindow = search;
  search.once('ready-to-show', () => search.show());
  search.on('closed', () => { if (searchWindow === search) searchWindow = null; });
  search.webContents.on('will-navigate', (e) => e.preventDefault());
  search.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void search.loadFile(join(UI, 'index.html'), { query: { view: 'search', workspace: service.workspaces().active } });
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
    searchWindow?.close();
    for (const note of noteWindows.values()) if (!note.isDestroyed()) note.close();
    noteWindows.clear();
    watcher?.();
    watcher = null;
    linkedWatcher?.();
    linkedWatcher = null;
    terminals.killAll();
  });
}

// A UI test sets this so it does not share the profile, or the single-instance lock, with the app you have open.
if (process.env.QA_USER_DATA) app.setPath('userData', process.env.QA_USER_DATA);

// Chromium switches, before 'ready': the built-in defaults (none for now) plus QA_ELECTRON_ARGS="--disable-gpu" (see chromium-switches.ts).
const switches = resolveSwitches(process.env);
for (const { switch: name, value } of switches.applied) app.commandLine.appendSwitch(name, value);
if (switches.rejected.length) console.error(`QA_ELECTRON_ARGS: ignored (not allowed): ${switches.rejected.join(' ')}`);
if (process.env.QA_PERF === '1') console.error(describeSwitches(switches));

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

    protocol.handle(FILE_SCHEME, async (request) => {
      const r = await files.serve(request.method, request.url, request.headers.get('range'));
      return new Response(r.body instanceof Readable ? (Readable.toWeb(r.body) as ReadableStream) : r.body, { status: r.status, headers: r.headers });
    });

    ipcMain.handle('qa:call', async (event, method: unknown, args: unknown) => {
      if (!trusted(event) && !(fromSearch(event) && (method === 'searchExpanded' || method === 'tags' || method === 'projects'))) return { ok: false, error: 'Untrusted caller.' };
      const result = await callService(service, method, args);
      return method === 'readFile' ? withFileUrl(event.sender, Array.isArray(args) ? args[0] : undefined, result) : result;
    });

    ipcMain.handle('qa:search-window', (event) => { if (trusted(event) && event.sender === win?.webContents) { openSearchWindow(); return true; } return false; });
    ipcMain.on('qa:search-close', (event) => { if (trusted(event) && event.sender === win?.webContents) searchWindow?.close(); });
    ipcMain.on('qa:search-open', (event, project: unknown, path: unknown) => {
      if (!fromSearch(event) || typeof project !== 'string' || !isProject(project, ROOT)) return;
      if (typeof path !== 'string' || path.length > 400 || path.startsWith('/') || path.split(/[\\/]/).includes('..')) return;
      win?.webContents.send('qa:open-in-main', project, path);
      if (win?.isMinimized()) win.restore();
      win?.focus();
    });

    // Watch one project at a time; changes are debounced and sent to the UI.
    ipcMain.handle('qa:watch', (event, project: unknown) => {
      if (!trusted(event)) return false;
      if (typeof project === 'string' && project) files.revokeOutside(event.sender.id, project);
      watcher?.();
      watcher = null;
      linkedWatcher?.();
      linkedWatcher = null;
      if (typeof project !== 'string' || !isProject(project, ROOT)) return false;
      const changed = () => win?.webContents.send('qa:changed', project);
      try {
        watcher = watchProject(join(projectsDir(ROOT), project), changed, { maxDirs: 2000 });
      } catch { return false; }
      // The linked folder shows live in the tree too; changes in its build and dependency folders are not news.
      const linked = projectRepository(project, ROOT);
      if (linked) {
        try {
          linkedWatcher = watchProject(linked, changed, { ignore: ['dist', 'build', '__pycache__'], maxDepth: 6, maxDirs: 500 });
        } catch { /* a folder that cannot be watched still lists; it just does not refresh by itself */ }
      }
      return true;
    });

    // Embedded terminals: the UI only refers to terminals prepared here, by id.
    const isSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 1000;
    // New terminal tab: the user's shell (tool '') or a terminal AI tool started without a request.
    ipcMain.handle('qa:term-new', (event, tool: unknown, project: unknown) => {
      if (!trusted(event)) return { error: 'Untrusted caller.' };
      if (!terminals.available()) return { error: 'Terminals inside the app are not available on this computer (node-pty is not installed).' };
      if (tool === '') return { terminal: { id: terminals.prepare({ ...shellSpec(ROOT), title: 'Terminal' }), title: 'Terminal' } };
      if (typeof tool !== 'string' || !isTool(tool) || !TOOLS[tool].command || TOOLS[tool].clipboard) return { error: 'Unknown tool.' };
      const plugins = isProject(project, ROOT) ? projectSummary(project, ROOT).plugins : [];
      const r = launchInTerminal(tool, '', ROOT, terminals.prepare, plugins);
      return r.terminal ? { terminal: r.terminal } : { error: r.message };
    });
    ipcMain.handle('qa:term-start', (event, id: unknown, cols: unknown, rows: unknown, project: unknown) => {
      if (!trusted(event) || typeof id !== 'string' || !isSize(cols) || !isSize(rows)) return 'Invalid terminal.';
      return terminals.start(id, cols, rows, isProject(project, ROOT) ? project : '');
    });
    ipcMain.on('qa:term-input', (event, id: unknown, data: unknown) => {
      if (trusted(event) && typeof id === 'string' && typeof data === 'string' && data.length <= 1_000_000) terminals.write(id, data);
    });
    ipcMain.on('qa:term-resize', (event, id: unknown, cols: unknown, rows: unknown) => {
      if (trusted(event) && typeof id === 'string' && isSize(cols) && isSize(rows)) terminals.resize(id, cols, rows);
    });
    ipcMain.on('qa:term-kill', (event, id: unknown) => { if (trusted(event) && typeof id === 'string') terminals.kill(id); });
    // A project opened again: the terminals still running for it, and what one printed while its tab was away.
    ipcMain.handle('qa:term-list', (event, project: unknown) => (trusted(event) && typeof project === 'string'
      ? terminals.list().filter((x) => x.project === project).map((x) => ({ id: x.id, title: x.title })) : []));
    ipcMain.handle('qa:term-attach', (event, id: unknown) => (trusted(event) && typeof id === 'string' ? terminals.attach(id) : null));
    // Flow control: the window confirms how much output it drew (finite, >= 0, capped), or that its tab left.
    ipcMain.on('qa:term-ack', (event, id: unknown, bytes: unknown) => {
      if (trusted(event) && typeof id === 'string' && typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0) terminals.ack(id, Math.min(bytes, 1 << 30));
    });
    ipcMain.on('qa:term-detach', (event, id: unknown) => { if (trusted(event) && typeof id === 'string') terminals.detach(id); });

    // Status bar: plan usage of the AI tools, and memory of the computer, of Moki and of each project's terminals.
    ipcMain.handle('qa:usage', async (event, refresh: unknown) => {
      if (!trusted(event)) return null;
      const appProcesses = app.getAppMetrics().map((m) => ({ pid: m.pid, kb: m.memory.workingSetSize }));
      const [memory, plans] = await Promise.all([memoryUsage(terminals.list(), appProcesses), planUsage(refresh === true)]);
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
      trusted(event) && isNoteWindow(event.sender) && isProject(project, ROOT);
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
