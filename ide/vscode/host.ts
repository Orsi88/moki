// The Moki page inside VS Code: the desktop UI (app/dist) in a webview panel,
// served by the same service as the desktop app (desktop/service.ts) through
// webview messages instead of Electron IPC. The AI tools open in VS Code's own
// terminals with the exact command and arguments the desktop app would run.

import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/repo.mjs';
import { TOOLS, listProjects, projectsDir, which } from '../../scripts/lib/core.ts';
import { callService, createService } from '../../desktop/service.ts';
import { launchInTerminal, launchTool, openFolder } from '../../desktop/launcher.ts';
import { noteKey, noteQuery, parseNoteRequest } from '../../desktop/notes.ts';
import { setWorkspaceEnv } from '../../desktop/workspaces.ts';
import { pdfcraftAvailable, runPdfcraft } from '../../desktop/pdfcraft.ts';
import type { TermSpec } from '../../desktop/terminals.ts';

// Arguments as an array and no shell, so the request is never read as a command line.
function openTerminal(spec: TermSpec): string {
  const terminal = vscode.window.createTerminal({
    name: 'Moki', shellPath: which(spec.file) ?? spec.file, shellArgs: spec.args, cwd: spec.cwd,
    // VS Code terminals do not inherit this process's environment; the tools need the active workspace.
    env: spec.env ?? { QA_WORKSPACE: process.env.QA_WORKSPACE ?? null },
  });
  terminal.show();
  return terminal.name;
}

// Files written by the AI tools appear live, debounced like the desktop app.
function watchProject(project: unknown, onChange: () => void): vscode.Disposable | null {
  if (typeof project !== 'string' || !listProjects(ROOT).includes(project)) return null;
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(join(projectsDir(ROOT), project)), '**'));
  let timer: NodeJS.Timeout | undefined;
  const changed = (): void => { clearTimeout(timer); timer = setTimeout(onChange, 400); };
  watcher.onDidCreate(changed);
  watcher.onDidChange(changed);
  watcher.onDidDelete(changed);
  return new vscode.Disposable(() => { clearTimeout(timer); watcher.dispose(); });
}

// app/dist/index.html with a webview CSP, a base for its relative URLs and the bridge loaded first.
function page(webview: vscode.Webview, ui: vscode.Uri, query: string): string {
  const src = webview.cspSource;
  const csp = `default-src 'none'; script-src ${src}; style-src ${src} 'unsafe-inline'; img-src ${src} data:; font-src ${src}; frame-src blob:; worker-src blob:; connect-src 'none'; object-src 'none'; base-uri ${src}; form-action 'none'`;
  const head = `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<base href="${webview.asWebviewUri(ui)}/">\n`
    + `<script src="${webview.asWebviewUri(vscode.Uri.joinPath(ui, 'webview-bridge.js'))}" data-query="${query.replace(/&/g, '&amp;')}"></script>`;
  return readFileSync(join(ui.fsPath, 'index.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace('<head>', head);
}

export function start(context: vscode.ExtensionContext): void {
  const service = createService(ROOT, {
    launch: (tool, prompt, root, plugins = []) => {
      if (TOOLS[tool].clipboard) return launchTool(tool, prompt, root, plugins); // editors: as in the desktop app
      const r = launchInTerminal(tool, prompt, root, openTerminal, plugins);
      return { opened: r.opened, message: r.message }; // no terminal id: the page has no terminal tabs here
    },
    openFolder,
    openPath: (file) => { void vscode.env.openExternal(vscode.Uri.file(file)); },
    trash: async (path) => { await vscode.workspace.fs.delete(vscode.Uri.file(path), { recursive: true, useTrash: true }); },
    pickFolder: async () => (await vscode.window.showOpenDialog({ title: 'Choose a folder', canSelectFolders: true, canSelectFiles: false }))?.[0]?.fsPath ?? null,
    onWorkspace: (dir) => setWorkspaceEnv(ROOT, dir),
    pdfcraft: { available: pdfcraftAvailable, run: runPdfcraft },
  });
  const ui = vscode.Uri.joinPath(context.extensionUri, 'dist', 'ui');
  const panels = new Map<string, vscode.WebviewPanel>(); // '' is the main page; notes by noteKey

  const open = (key: string, title: string, query: string): void => {
    const existing = panels.get(key);
    if (existing) { existing.reveal(); return; }
    const panel = vscode.window.createWebviewPanel('moki', title, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [ui] });
    panels.set(key, panel);
    panel.iconPath = vscode.Uri.joinPath(ui, 'icon.png');
    panel.webview.html = page(panel.webview, ui, query);
    let watcher: vscode.Disposable | null = null;
    panel.onDidDispose(() => { watcher?.dispose(); panels.delete(key); });
    // Messages come only from this panel's page; each kind validates its arguments like desktop/main.ts.
    panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      const { id, type, args } = (raw ?? {}) as { id?: unknown; type?: unknown; args?: unknown };
      const a: unknown[] = Array.isArray(args) ? args : [];
      let value: unknown = null;
      if (type === 'call') value = await callService(service, a[0], a[1]);
      else if (type === 'watch') {
        watcher?.dispose();
        watcher = watchProject(a[0], () => { void panel.webview.postMessage({ event: 'changed', project: a[0] }); });
        value = Boolean(watcher);
      } else if (type === 'openLink' && typeof a[0] === 'string' && /^https?:\/\//.test(a[0])) void vscode.env.openExternal(vscode.Uri.parse(a[0], true));
      else if (type === 'openNoteWindow' && key === '') {
        const note = parseNoteRequest(a[0], ROOT);
        if (note) open(noteKey(note) || `new:${Date.now()}`, 'Moki note', new URLSearchParams(noteQuery(note)).toString());
        value = Boolean(note);
      } else if (type === 'notesChanged') void panels.get('')?.webview.postMessage({ event: 'notes-changed' });
      if (typeof id === 'number') void panel.webview.postMessage({ id, value });
    });
  };
  context.subscriptions.push(vscode.commands.registerCommand('moki.open', () => open('', 'Moki', '')));
}
