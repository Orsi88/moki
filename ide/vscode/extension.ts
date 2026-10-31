// Entry point of the Moki VS Code extension (the IDE Companion). Like desktop/boot.ts:
// installed, it keeps the framework in <Documents>/Moki (shared with the desktop app)
// and points QA_ROOT to it before host.ts loads; run from the repository (Extension
// Development Host) it uses the repository.

import * as vscode from 'vscode';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { frameworkTarget, syncFramework } from '../../desktop/framework.ts';

export function activate(context: vscode.ExtensionContext): void {
  const dist = join(context.extensionPath, 'dist');
  if (context.extensionMode === vscode.ExtensionMode.Production) {
    const target = frameworkTarget(documentsDir());
    let buildId = String(context.extension.packageJSON.version);
    try { buildId = (JSON.parse(readFileSync(join(dist, 'build-info.json'), 'utf8')) as { buildId: string }).buildId; } catch { /* use the version */ }
    syncFramework(join(dist, 'framework'), target, buildId);
    process.env.QA_ROOT = target;
  } else {
    process.env.QA_ROOT = resolve(context.extensionPath, '..', '..');
  }
  // The tool runner (Windows terminals) and Moki's MCP server, as built next to this file.
  process.env.QA_RUN_TOOL = join(dist, 'run-tool.mjs');
  process.env.QA_MCP_SERVER = join(dist, 'mcp.cjs');
  // host.cjs is a separate built file: ROOT (scripts/lib/repo.mjs) is read when it loads.
  (createRequire(import.meta.url)('./host.cjs') as typeof import('./host.ts')).start(context);
}

// The folder Electron's app.getPath('documents') returns, so both share <Documents>/Moki:
// the XDG folder on Linux (~/Documentos in Portuguese), the known folder on Windows (OneDrive included).
function documentsDir(): string {
  const query: [string, string[]] | null = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-Command', '[Environment]::GetFolderPath("MyDocuments")']]
    : process.platform === 'linux' ? ['xdg-user-dir', ['DOCUMENTS']] : null;
  try {
    const dir = query ? execFileSync(query[0], query[1], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim() : '';
    if (dir && dir !== homedir()) return dir;
  } catch { /* fall back to ~/Documents */ }
  return join(homedir(), 'Documents');
}
