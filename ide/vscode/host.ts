// Moki light inside VS Code: finds the Moki project of the open folder and shows the
// Moki panel (app/src/companion, a webview with the app's look) where the person
// starts activities, uses the project's agents, chooses the context and follows the
// runs. The page talks only to desktop/companion-api.ts (a closed list of calls, always
// for the active project). VS Code's AI gets Moki's MCP server (ide/mcp/server.ts) and
// the servers the project has on in the MCP Manager (scripts/lib/mcp.ts); Claude Code
// in the IDE gets them through the folder's .mcp.json (Connect Claude Code).
// Multi-agent operations run here as in the app: each step in its own VS Code terminal,
// with an id the engine keeps on the step, and the loop (companion-api drive) runs on
// every change of the project's files, so an operation moves on with the panel closed.

import * as vscode from 'vscode';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, workspaceDir } from '../../scripts/lib/repo.mjs';
import { TOOLS, linkedFolder, listProjects, projectSummary, projectsDir, which } from '../../scripts/lib/core.ts';
import { setWorkspaceEnv } from '../../desktop/workspaces.ts';
import { createService } from '../../desktop/service.ts';
import { launchInTerminal, launchTool, openFolder } from '../../desktop/launcher.ts';
import type { TermSpec } from '../../desktop/terminals.ts';
import { openCompanion, projectsForFolder, type Companion } from '../../desktop/companion.ts';
import { createCompanionApi } from '../../desktop/companion-api.ts';
import { MCP_FILE, generatedEntries, mokiServer, resolveServer, syncCursorFolder, type McpServer } from '../../scripts/lib/mcp.ts';

const PICKED = 'moki.project'; // the project chosen for this VS Code workspace (workspaceState)

// The chat the request goes to: Claude Code's input when its extension is there, else VS Code's chat (Copilot) with the request typed in.
async function focusChat(prompt: string): Promise<string> {
  const commands = new Set(await vscode.commands.getCommands(true));
  if (commands.has('claude-vscode.focus')) { await vscode.commands.executeCommand('claude-vscode.focus'); return 'Claude Code'; }
  if (commands.has('workbench.action.chat.open')) { await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt, isPartialQuery: true }); return 'Copilot Chat'; }
  return '';
}

export function start(context: vscode.ExtensionContext): void {
  const dist = join(context.extensionPath, 'dist');
  const mcpScript = join(dist, 'mcp.cjs');
  const webRoot = vscode.Uri.file(join(dist, 'webview'));
  const buildId = ((): string => { try { return (JSON.parse(readFileSync(join(dist, 'build-info.json'), 'utf8')) as { buildId: string }).buildId; } catch { return '0'; } })();

  let companion: Companion | null = null;

  // The terminals Moki opened, by an id of this session: an operation step keeps it (markStarted), to
  // answer a question in it, close it, or learn that it closed before the step was done.
  const terminals = new Map<string, { terminal: vscode.Terminal; project: string | null }>();
  const session = Date.now().toString(36);
  let opened = 0;
  // Arguments as an array and no shell, so the request is never read as a command line.
  const openTerminal = (spec: TermSpec): string => {
    const id = `vs${session}-${++opened}`;
    const terminal = vscode.window.createTerminal({
      name: spec.title ? `Moki · ${spec.title}` : 'Moki', shellPath: which(spec.file) ?? spec.file, shellArgs: spec.args, cwd: spec.cwd,
      // VS Code terminals do not inherit this process's environment; the tools need the active workspace.
      env: spec.env ?? { QA_WORKSPACE: process.env.QA_WORKSPACE ?? null },
    });
    terminals.set(id, { terminal, project: companion?.project ?? null });
    terminal.show();
    return id;
  };
  const live = (id: string) => terminals.get(id)?.terminal;

  // The same service as the desktop app (it opens the workspace used last); the AI tools open in VS Code's terminals.
  const service = createService(ROOT, {
    launch: (tool, prompt, root, plugins = [], extra = []) => {
      if (TOOLS[tool].clipboard) return launchTool(tool, prompt, root, plugins, extra);
      const r = launchInTerminal(tool, prompt, root, openTerminal, plugins, extra);
      return { opened: r.opened, message: r.message, terminal: r.terminal };
    },
    openFolder,
    openPath: (file) => { void vscode.env.openExternal(vscode.Uri.file(file)); },
    copy: (text) => { void vscode.env.clipboard.writeText(text); },
    onWorkspace: (dir) => setWorkspaceEnv(ROOT, dir),
    terminalAlive: (id) => { const t = live(id); return Boolean(t && t.exitStatus === undefined); },
    writeTerminal: (id, data) => { live(id)?.sendText(data, false); }, // the engine ends the answer with a carriage return itself
    killTerminal: (id) => { live(id)?.dispose(); terminals.delete(id); },
  });

  let candidates: string[] = [];
  const panels = new Set<vscode.WebviewView>();
  const mcpChanged = new vscode.EventEmitter<void>();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'moki.chooseProject';
  status.show();

  const folders = (): string[] => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const name = (id: string): string => projectSummary(id, ROOT).name;
  const refresh = (): void => { for (const p of panels) void p.webview.postMessage({ event: 'changed', project: companion?.project ?? '' }); };

  let watcher: vscode.FileSystemWatcher | null = null;
  let timer: NodeJS.Timeout | undefined;
  const later = (): void => { clearTimeout(timer); timer = setTimeout(() => { drive(); refresh(); mcpChanged.fire(); }, 400); };
  const watch = (project: string | null): void => {
    watcher?.dispose();
    watcher = null;
    if (!project) return;
    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(join(projectsDir(ROOT), project)), '**'));
    watcher.onDidCreate(later); watcher.onDidChange(later); watcher.onDidDelete(later);
  };
  // The workspace's MCP catalog lives outside the project folder.
  const catalog = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(workspaceDir(ROOT)), MCP_FILE));
  catalog.onDidCreate(later); catalog.onDidChange(later); catalog.onDidDelete(later);

  // Another project means another context: nothing of the previous one stays visible or reachable.
  const use = (project: string | null): void => {
    if (project !== (companion?.project ?? null)) {
      companion = project ? openCompanion(ROOT, project) : null;
      watch(project);
      mcpChanged.fire();
    }
    status.text = companion ? `$(moki-cat) Moki: ${name(companion.project)}` : candidates.length > 1 ? '$(moki-cat) Moki: choose a project' : '$(moki-cat) Moki: no project';
    status.tooltip = companion ? 'Moki project of this folder. Click to change.' : 'Choose the Moki project of this folder.';
    drive();
    refresh();
  };
  const pick = (id: string): void => { void context.workspaceState.update(PICKED, id); use(id); };

  // A project chosen for this VS Code workspace wins while it exists; otherwise the one linked to the folder.
  const resolveProject = (): void => {
    candidates = [...new Set(folders().flatMap((f) => projectsForFolder(ROOT, f)))];
    const picked = context.workspaceState.get<string>(PICKED);
    if (picked && listProjects(ROOT).includes(picked)) use(picked);
    else if (candidates.length === 1) use(candidates[0]);
    else use(null);
  };

  const chooseProject = async (): Promise<void> => {
    const known = listProjects(ROOT);
    if (!known.length) { void vscode.window.showInformationMessage('There are no Moki projects in the active workspace. Create one in the Moki desktop app.'); return; }
    const order = [...candidates, ...known.filter((p) => !candidates.includes(p))];
    const choice = await vscode.window.showQuickPick(order.map((id) => ({
      label: name(id), description: id, detail: candidates.includes(id) ? 'Linked to this folder' : projectSummary(id, ROOT).description || undefined, id,
    })), { title: 'Moki project for this folder' });
    if (choice) pick(choice.id);
  };

  const api = createCompanionApi(ROOT, service, {
    companion: () => companion,
    choose: pick,
    copy: async (text) => { await vscode.env.clipboard.writeText(text); },
    focusChat,
    confirm: async (message, detail) => (await vscode.window.showWarningMessage(message, { modal: true, detail }, 'Write')) === 'Write',
    folder: () => folders()[0] ?? null,
    tracked: (folder, file) => { try { execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: folder, stdio: 'ignore', windowsHide: true }); return true; } catch { return false; } },
    mokiServer: (project) => mokiServer(project, ROOT, mcpScript, which('node')),
    language: () => (vscode.env.language.toLowerCase().startsWith('pt') ? 'Portuguese (pt-BR)' : 'English'),
    showTerminal: (id) => { const t = live(id); t?.show(); return Boolean(t); },
  });
  // The operations' loop; a failure here never stops the extension (the run shows it).
  function drive(): void { try { api.drive(); } catch { /* shown in the run */ } }

  // The built page (app/companion.html) with a policy for the webview: scripts only with this page's nonce, no network.
  const page = (webview: vscode.Webview): string => {
    const nonce = randomBytes(16).toString('base64');
    const src = webview.cspSource;
    const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src ${src} 'unsafe-inline'; img-src ${src} data:; font-src ${src}; connect-src 'none'; base-uri ${src}; form-action 'none'`;
    const lang = vscode.env.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
    return readFileSync(join(webRoot.fsPath, 'companion.html'), 'utf8')
      .replace(/<html[^>]*>/, `<html lang="${lang}" data-lang="${lang}" data-theme="dark">`)
      .replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<base href="${webview.asWebviewUri(webRoot)}/">`)
      .replace(/ crossorigin/g, '') // the webview serves its files from its own origin
      .replace(/<script /g, `<script nonce="${nonce}" `);
  };

  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView: (view) => {
      view.webview.options = { enableScripts: true, localResourceRoots: [webRoot] };
      view.webview.html = page(view.webview);
      panels.add(view);
      view.onDidDispose(() => panels.delete(view));
      view.onDidChangeVisibility(() => { void view.webview.postMessage({ event: 'visible', visible: view.visible }); });
      // Messages come only from this page; each call is checked by companion-api.
      view.webview.onDidReceiveMessage(async (raw: unknown) => {
        const msg = (raw ?? {}) as { id?: unknown; method?: unknown; args?: unknown; event?: unknown; url?: unknown };
        if (msg.event === 'openLink' && typeof msg.url === 'string' && /^https?:\/\//.test(msg.url)) { void vscode.env.openExternal(vscode.Uri.parse(msg.url, true)); return; }
        // Run updates the person has not seen: a number on the Moki icon of the Activity Bar.
        if (msg.event === 'badge') {
          const count = typeof (raw as { count?: unknown }).count === 'number' ? Math.max(0, Math.floor((raw as { count: number }).count)) : 0;
          view.badge = count ? { value: count, tooltip: count === 1 ? '1 run update' : `${count} run updates` } : undefined;
          return;
        }
        if (typeof msg.id !== 'number') return;
        const reply = await api(msg.method, msg.args);
        void view.webview.postMessage({ id: msg.id, reply });
      });
    },
  };

  // The project's servers with their variables read from this environment; one whose variable is missing is left out.
  const servers = (): McpServer[] => (companion?.mcpServers() ?? []).flatMap((s) => { try { return [resolveServer(s)]; } catch { return []; } });
  // A definition's version changes only when its configuration does, so VS Code restarts only that server.
  const version = (s: McpServer): string => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);

  context.subscriptions.push(
    status, mcpChanged, catalog, new vscode.Disposable(() => { clearTimeout(timer); watcher?.dispose(); }),
    vscode.window.registerWebviewViewProvider('moki.panel', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    // VS Code's AI (Copilot) gets Moki's server, fixed to the project of this folder, and the servers the project has on.
    vscode.lm.registerMcpServerDefinitionProvider('moki', {
      onDidChangeMcpServerDefinitions: mcpChanged.event,
      provideMcpServerDefinitions: () => {
        if (!companion) return [];
        const own = servers().map((s): vscode.McpServerDefinition => (s.transport === 'http'
          ? new vscode.McpHttpServerDefinition(s.name, vscode.Uri.parse(s.url), s.headers, version(s))
          : new vscode.McpStdioServerDefinition(s.name, which(s.command) ?? s.command, s.args, s.env, version(s))));
        return [new vscode.McpStdioServerDefinition(
          'Moki', process.execPath, [mcpScript, '--project', companion.project],
          { ELECTRON_RUN_AS_NODE: '1', QA_ROOT: ROOT, QA_WORKSPACE: process.env.QA_WORKSPACE ?? null }, `${companion.project}-${buildId}`,
        ), ...own];
      },
    }),
    // Cursor opened on the linked folder reads <folder>/.cursor/mcp.json: Moki's entries go there after the person confirms.
    vscode.commands.registerCommand('moki.syncCursor', async () => {
      if (!companion) { void vscode.window.showInformationMessage('Choose the Moki project of this folder first.'); return; }
      const linked = linkedFolder(companion.project, ROOT);
      if (!linked || !existsSync(linked.path)) { void vscode.window.showWarningMessage('This project has no linked folder on this computer. Link it in the Moki desktop app (Choose my folder).'); return; }
      if (linked.writeBlocked) { void vscode.window.showWarningMessage(`project.json does not allow writing to ${linked.path} (writeAllowed: false).`); return; }
      const ok = await vscode.window.showWarningMessage(`Write the MCP servers this project has on to ${linked.path}/.cursor/mcp.json?`, {
        modal: true, detail: 'Only Moki\'s entries (moki, moki-*) change; yours stay. The current file is backed up to .moki-backup/ first.',
      }, 'Write');
      if (ok !== 'Write') return;
      try {
        const r = syncCursorFolder(linked.path, generatedEntries(mokiServer(companion.project, ROOT, mcpScript, which('node')), companion.mcpServers()));
        companion.log('sync-cursor', { changed: r.changed });
        void vscode.window.showInformationMessage(r.changed ? `Cursor updated: ${r.file}` : 'Cursor already had these servers.');
      } catch (e) { void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e)); }
    }),
    vscode.commands.registerCommand('moki.connectClaude', async () => {
      const r = await api('connectClaude', []);
      if (!r.ok) void vscode.window.showErrorMessage(r.error);
      else if (!(r.value as { cancelled: boolean }).cancelled) void vscode.window.showInformationMessage(`Claude Code connected: ${(r.value as { file: string }).file}`);
    }),
    vscode.commands.registerCommand('moki.showActivity', async () => {
      if (!companion) return;
      try { await vscode.window.showTextDocument(vscode.Uri.file(companion.logFile), { preview: true }); } catch {
        void vscode.window.showInformationMessage('The AI has not read anything from Moki in this project yet.');
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(resolveProject),
    // A step's terminal closed: done if it wrote its summary, else failed (the engine decides).
    vscode.window.onDidCloseTerminal((closed) => {
      for (const [id, { terminal, project }] of terminals) {
        if (terminal !== closed) continue;
        terminals.delete(id);
        if (project) { try { service.operationStepExited(project, id); } catch { /* not a step */ } }
        later();
      }
    }),
    vscode.commands.registerCommand('moki.chooseProject', chooseProject),
    vscode.commands.registerCommand('moki.refresh', () => { resolveProject(); refresh(); }),
  );

  resolveProject();
}
