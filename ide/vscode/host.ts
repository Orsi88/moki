// The Moki Companion inside VS Code: finds the Moki project of the open folder,
// lists what it offers (context, notes, context shared by tags, agents, skills) in
// native views, keeps what the person selects or allows, and gives VS Code's AI the
// Moki MCP server (ide/mcp/server.ts) fixed to that project, plus the MCP servers the
// project has on in Moki's MCP Manager (scripts/lib/mcp.ts). The Moki desktop UI does
// not load here; everything goes through desktop/companion.ts, which only reads.

import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, setWorkspaceDir, workspaceDir } from '../../scripts/lib/repo.mjs';
import { linkedFolder, listProjects, projectSummary, projectsDir, which } from '../../scripts/lib/core.ts';
import { MCP_FILE, generatedEntries, mokiServer, resolveServer, syncCursorFolder, type McpServer } from '../../scripts/lib/mcp.ts';
import { activeWorkspace, setWorkspaceEnv } from '../../desktop/workspaces.ts';
import { DEFAULT_MODES, openCompanion, projectsForFolder, type Companion, type Mode, type Resource, type ResourceKind } from '../../desktop/companion.ts';

const GROUPS: { kind: ResourceKind; label: string; icon: string }[] = [
  { kind: 'context', label: 'Context', icon: 'book' },
  { kind: 'note', label: 'Notes', icon: 'note' },
  { kind: 'shared', label: 'Shared by tags', icon: 'tag' },
  { kind: 'agent', label: 'Agents', icon: 'person' },
  { kind: 'skill', label: 'Skills', icon: 'tools' },
];
const MODE_LABELS: Record<Mode, { label: string; detail: string; icon: string }> = {
  auto: { label: 'Automatic', detail: 'The AI may find and read it when it needs it.', icon: 'pass' },
  ask: { label: 'Ask first', detail: 'The AI sees it in the list but reads it only after you select it.', icon: 'question' },
  manual: { label: 'Manual only', detail: 'Hidden from the AI until you select it.', icon: 'eye-closed' },
};
const PICKED = 'moki.project'; // the project chosen for this VS Code workspace (workspaceState)

type Node = { group: ResourceKind } | { resource: Resource } | { mcp: true } | { server: McpServer; problem: string };

export function start(context: vscode.ExtensionContext): void {
  // The workspace opened last in Moki; the MCP server gets it too.
  if (!process.env.QA_WORKSPACE) setWorkspaceDir(ROOT, activeWorkspace(ROOT).path);
  setWorkspaceEnv(ROOT, activeWorkspace(ROOT).path);

  let companion: Companion | null = null;
  let candidates: string[] = [];
  const changed = new vscode.EventEmitter<void>(); // trees
  const mcpChanged = new vscode.EventEmitter<void>();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'moki.chooseProject';
  status.show();

  const folders = (): string[] => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const name = (id: string): string => projectSummary(id, ROOT).name;

  let watcher: vscode.FileSystemWatcher | null = null;
  let timer: NodeJS.Timeout | undefined;
  const watch = (project: string | null): void => {
    watcher?.dispose();
    watcher = null;
    if (!project) return;
    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(join(projectsDir(ROOT), project)), '**'));
    const later = (): void => { clearTimeout(timer); timer = setTimeout(() => { changed.fire(); mcpChanged.fire(); }, 400); };
    watcher.onDidCreate(later); watcher.onDidChange(later); watcher.onDidDelete(later);
  };
  // The workspace's MCP catalog lives outside the project folder.
  const catalog = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(workspaceDir(ROOT)), MCP_FILE));
  const catalogChanged = (): void => { changed.fire(); mcpChanged.fire(); };
  catalog.onDidCreate(catalogChanged); catalog.onDidChange(catalogChanged); catalog.onDidDelete(catalogChanged);

  // The project's servers with their variables read from this environment; one whose variable is missing is left out, with why.
  const servers = (): { server: McpServer; resolved: McpServer | null; problem: string }[] => (companion?.mcpServers() ?? []).map((server) => {
    try { return { server, resolved: resolveServer(server), problem: '' }; } catch (e) { return { server, resolved: null, problem: e instanceof Error ? e.message : String(e) }; }
  });

  // Another project means another context: nothing of the previous one stays visible or reachable.
  const use = (project: string | null): void => {
    if (project !== (companion?.project ?? null)) {
      companion = project ? openCompanion(ROOT, project) : null;
      watch(project);
      mcpChanged.fire();
    }
    void vscode.commands.executeCommand('setContext', 'moki.connected', Boolean(companion));
    status.text = companion ? `$(beaker) Moki: ${name(companion.project)}` : candidates.length > 1 ? '$(beaker) Moki: choose a project' : '$(beaker) Moki: no project';
    status.tooltip = companion ? 'Moki project of this folder. Click to change.' : 'Choose the Moki project of this folder.';
    changed.fire();
  };

  // A project chosen in the panel for this VS Code workspace wins while it exists; otherwise the one linked to the folder.
  const resolveProject = (): void => {
    candidates = [...new Set(folders().flatMap((f) => projectsForFolder(ROOT, f)))];
    const picked = context.workspaceState.get<string>(PICKED);
    const known = listProjects(ROOT);
    if (picked && known.includes(picked)) use(picked);
    else if (candidates.length === 1) use(candidates[0]);
    else use(null);
  };

  const chooseProject = async (): Promise<void> => {
    const known = listProjects(ROOT);
    if (!known.length) {
      void vscode.window.showInformationMessage('There are no Moki projects in the active workspace. Create one in the Moki desktop app.');
      return;
    }
    const order = [...candidates, ...known.filter((p) => !candidates.includes(p))];
    const pick = await vscode.window.showQuickPick(order.map((id) => ({
      label: name(id), description: id, detail: candidates.includes(id) ? 'Linked to this folder' : projectSummary(id, ROOT).description || undefined, id,
    })), { title: 'Moki project for this folder', placeHolder: candidates.length ? undefined : 'This folder is not linked to a project (link it in the Moki desktop app: project → Choose my folder)' });
    if (!pick) return;
    await context.workspaceState.update(PICKED, pick.id);
    use(pick.id);
  };

  const item = (r: Resource): vscode.TreeItem => {
    const t = new vscode.TreeItem(r.title, vscode.TreeItemCollapsibleState.None);
    t.id = r.id;
    t.description = r.mode === DEFAULT_MODES[r.kind] ? undefined : MODE_LABELS[r.mode].label;
    t.tooltip = new vscode.MarkdownString(`**${r.title}**\n\n${r.description || ''}\n\n*${MODE_LABELS[r.mode].label}*: ${MODE_LABELS[r.mode].detail}`);
    t.iconPath = new vscode.ThemeIcon(MODE_LABELS[r.mode].icon);
    t.checkboxState = r.selected ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    t.contextValue = 'resource';
    t.command = { command: 'moki.openResource', title: 'Open', arguments: [{ resource: r }] };
    return t;
  };

  const resources: vscode.TreeDataProvider<Node> = {
    onDidChangeTreeData: changed.event,
    getTreeItem: (n) => {
      if ('resource' in n) return item(n.resource);
      if ('mcp' in n) {
        const t = new vscode.TreeItem('MCP servers', vscode.TreeItemCollapsibleState.Collapsed);
        t.id = 'group:mcp';
        t.description = String(companion?.mcpServers().length ?? 0);
        t.tooltip = 'The MCP servers this project has on in Moki (Settings › MCP servers). VS Code\'s AI gets them; turn them on or off in Moki.';
        t.iconPath = new vscode.ThemeIcon('plug');
        return t;
      }
      if ('server' in n) {
        const t = new vscode.TreeItem(n.server.name, vscode.TreeItemCollapsibleState.None);
        t.id = `mcp:${n.server.id}`;
        t.description = n.problem ? 'not available' : `${n.server.transport === 'http' ? 'HTTP' : 'stdio'}${n.server.access === 'execute' ? ' · executes' : ''}`;
        t.tooltip = n.problem || n.server.description || n.server.id;
        t.iconPath = new vscode.ThemeIcon(n.problem ? 'warning' : 'plug');
        return t;
      }
      const g = GROUPS.find((x) => x.kind === n.group)!;
      const count = companion?.allResources().filter((r) => r.kind === n.group).length ?? 0;
      const t = new vscode.TreeItem(g.label, n.group === 'context' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      t.id = `group:${n.group}`;
      t.description = String(count);
      t.iconPath = new vscode.ThemeIcon(g.icon);
      return t;
    },
    getChildren: (n) => {
      if (!companion) return [];
      const list = companion.allResources();
      if (!n) return [...GROUPS.filter((g) => list.some((r) => r.kind === g.kind)).map((g): Node => ({ group: g.kind })), ...(companion.mcpServers().length ? [{ mcp: true } as const] : [])];
      if ('mcp' in n) return servers().map(({ server, problem }) => ({ server, problem }));
      return 'group' in n ? list.filter((r) => r.kind === n.group).map((resource) => ({ resource })) : [];
    },
  };
  const selected: vscode.TreeDataProvider<Node> = {
    onDidChangeTreeData: changed.event,
    getTreeItem: (n) => ('resource' in n ? item(n.resource) : new vscode.TreeItem('')),
    getChildren: (n) => (n || !companion ? [] : companion.allResources().filter((r) => r.selected).map((resource) => ({ resource }))),
  };

  const views = [
    vscode.window.createTreeView('moki.resources', { treeDataProvider: resources, manageCheckboxStateManually: true }),
    vscode.window.createTreeView('moki.selected', { treeDataProvider: selected, manageCheckboxStateManually: true }),
  ];
  for (const view of views) {
    view.onDidChangeCheckboxState((e) => {
      if (!companion) return;
      for (const [n, state] of e.items) if ('resource' in n) companion.select(n.resource.id, state === vscode.TreeItemCheckboxState.Checked);
      changed.fire();
    });
  }

  // The resource of a command: the clicked row, or the selected row of the views.
  const target = (n?: Node): Resource | null => {
    const node = n ?? views.flatMap((v) => v.selection)[0];
    return node && 'resource' in node ? node.resource : null;
  };
  const guarded = (fn: (c: Companion, r: Resource) => unknown) => async (n?: Node) => {
    const r = target(n);
    if (!companion || !r) return;
    try { await fn(companion, r); } catch (e) { void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e)); }
  };

  const mcpScript = join(context.extensionPath, 'dist', 'mcp.cjs');
  const buildId = ((): string => { try { return (JSON.parse(readFileSync(join(context.extensionPath, 'dist', 'build-info.json'), 'utf8')) as { buildId: string }).buildId; } catch { return '0'; } })();

  // A definition's version changes only when its configuration does, so VS Code restarts only that server.
  const version = (s: McpServer): string => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);

  context.subscriptions.push(
    status, changed, mcpChanged, catalog, ...views, new vscode.Disposable(() => { clearTimeout(timer); watcher?.dispose(); }),
    // VS Code's AI gets Moki's server, fixed to the project of this folder, and the servers the project has on; none without a project.
    vscode.lm.registerMcpServerDefinitionProvider('moki', {
      onDidChangeMcpServerDefinitions: mcpChanged.event,
      provideMcpServerDefinitions: () => {
        if (!companion) return [];
        const own = servers().flatMap(({ resolved: s }): vscode.McpServerDefinition[] => {
          if (!s) return [];
          if (s.transport === 'http') return [new vscode.McpHttpServerDefinition(s.name, vscode.Uri.parse(s.url), s.headers, version(s))];
          return [new vscode.McpStdioServerDefinition(s.name, which(s.command) ?? s.command, s.args, s.env, version(s))];
        });
        return [new vscode.McpStdioServerDefinition(
          'Moki', process.execPath, [mcpScript, '--project', companion.project],
          { ELECTRON_RUN_AS_NODE: '1', QA_ROOT: ROOT, QA_WORKSPACE: process.env.QA_WORKSPACE ?? null }, `${companion.project}-${buildId}`,
        ), ...own];
      },
    }),
    // Cursor opened on this folder reads <folder>/.cursor/mcp.json: Moki's entries go there after the person confirms.
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
        const moki = mokiServer(companion.project, ROOT, mcpScript, which('node'));
        const r = syncCursorFolder(linked.path, generatedEntries(moki, companion.mcpServers()));
        companion.log('sync-cursor', { changed: r.changed });
        void vscode.window.showInformationMessage(r.changed ? `Cursor updated: ${r.file}` : 'Cursor already had these servers.');
      } catch (e) { void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e)); }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(resolveProject),
    vscode.commands.registerCommand('moki.chooseProject', chooseProject),
    vscode.commands.registerCommand('moki.refresh', resolveProject),
    vscode.commands.registerCommand('moki.openResource', guarded(async (c, r) => {
      const file = c.filePath(r.id);
      if (file) await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true });
    })),
    vscode.commands.registerCommand('moki.copyReference', guarded(async (_c, r) => {
      await vscode.env.clipboard.writeText(`Moki resource "${r.id}" (${r.title}): read it with the moki_get_resource tool.`);
      vscode.window.setStatusBarMessage('Moki: reference copied', 3000);
    })),
    vscode.commands.registerCommand('moki.copyContent', guarded(async (c, r) => {
      // Copying is the person's own action: it works whatever the mode.
      const file = c.filePath(r.id);
      if (!file) return;
      await vscode.env.clipboard.writeText(`<!-- Moki: ${r.id} -->\n${readFileSync(file, 'utf8')}`);
      vscode.window.setStatusBarMessage('Moki: content copied', 3000);
    })),
    vscode.commands.registerCommand('moki.select', guarded((c, r) => { c.select(r.id, !r.selected); changed.fire(); })),
    vscode.commands.registerCommand('moki.setMode', guarded(async (c, r) => {
      const pick = await vscode.window.showQuickPick((Object.keys(MODE_LABELS) as Mode[]).map((m) => ({
        label: `$(${MODE_LABELS[m].icon}) ${MODE_LABELS[m].label}`, detail: MODE_LABELS[m].detail, description: m === r.mode ? 'current' : m === DEFAULT_MODES[r.kind] ? 'default' : undefined, mode: m,
      })), { title: `How the AI may use "${r.title}"` });
      if (!pick) return;
      c.setMode(r.id, pick.mode);
      changed.fire();
    })),
    vscode.commands.registerCommand('moki.clearSelection', () => { companion?.clearSelection(); changed.fire(); }),
    vscode.commands.registerCommand('moki.showActivity', async () => {
      if (!companion) return;
      try { await vscode.window.showTextDocument(vscode.Uri.file(companion.logFile), { preview: true }); } catch {
        void vscode.window.showInformationMessage('The AI has not read anything from Moki in this project yet.');
      }
    }),
  );

  resolveProject();
}
