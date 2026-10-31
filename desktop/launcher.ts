// Opens AI tools for the desktop app. Terminal tools (claude, codex, gemini,
// antigravity, cursor-agent) start in a terminal tab of the app (launchInTerminal) or, when
// embedded terminals are unavailable, in a NEW terminal window; editors open
// the framework folder. Only tools from the fixed TOOLS list can be started, and user text
// only ever travels as the prompt argument.
//
// Windows: the request goes to a UTF-8 JSON file read by desktop/run-tool.ts in
// the new window (batch files would corrupt accents). macOS/Linux: a small
// bash script (bash reads UTF-8) opened in the terminal app.

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { TOOLS, copyToClipboard, which, type ToolKey } from '../scripts/lib/core.ts';
import type { TermSpec } from './terminals.ts';

export interface LaunchResult { opened: boolean; message: string; copied?: boolean; terminal?: { id: string; title: string } }

export type Launcher = (tool: ToolKey, prompt: string, root: string, plugins?: string[]) => LaunchResult;
export type FolderOpener = (folder: string) => void;

// Inside the desktop app, main.ts points QA_RUN_TOOL to the bundled run-tool and
// runs it with Electron's own Node (ELECTRON_RUN_AS_NODE). In Node it is the .ts file.
const runToolPath = (): string => process.env.QA_RUN_TOOL || join(dirname(fileURLToPath(import.meta.url)), 'run-tool.ts');

// Prompts are one line of plain text; control characters and line breaks are removed.
export const cleanPrompt = (prompt: string): string => prompt.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

// macOS/Linux launcher script. Single quotes, with embedded single quotes
// closed and escaped, so the shell never interprets user text. Pure, for testing.
export function scriptFor(command: string, args: string[], root: string, title: string): string {
  const q = (a: string): string => `'${cleanPrompt(a).replace(/'/g, `'\\''`)}'`;
  return ['#!/bin/bash', `printf '\\033]0;%s\\007' ${q(title)}`, `cd ${q(root)} || exit 1`, `${command} ${args.map(q).join(' ')}`, ''].join('\n');
}

// Windows: `start` opens a new console running node + run-tool with the JSON
// file. Only paths and a fixed title appear on this command line. Pure, for testing.
export function windowsStartArgs(nodePath: string, runTool: string, requestFile: string, title: string): string {
  const q = (s: string): string => `"${s.replace(/"/g, '')}"`;
  return `/d /s /c "start ${q(title)} ${q(nodePath)} ${q(runTool)} ${q(requestFile)}"`;
}

export function detached(cmd: string, args: string[], options: { shell?: boolean; windowsVerbatimArguments?: boolean; env?: NodeJS.ProcessEnv } = {}): void {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...options });
  child.on('error', () => { /* reported by the caller's availability check */ });
  child.unref();
}

// Plugins only for the sessions the app opens (adapters/app-plugins/README.md); each is
// skipped when what it needs is missing. Codex has no per-session plugins, so it gets
// one line of developer instructions (one line: launcher scripts drop line breaks).
// `plugins` are the ones the project turned on (project.json plugins: caveman, superpowers).
export function pluginArgs(tool: ToolKey, root: string, plugins: string[] = []): string[] {
  const node = tool === 'codex' || Boolean(which('node')); // the Claude hooks run on Node
  const rtk = Boolean(which('rtk'));
  const caveman = node && plugins.includes('caveman');
  const superpowers = plugins.includes('superpowers'); // its hook runs on bash and skips itself without it
  const dir = join(root, 'adapters', 'app-plugins');
  if (tool === 'claude') return [...(node ? ['ponytail'] : []), ...(rtk ? ['rtk'] : []), ...(caveman ? ['caveman'] : []), ...(superpowers ? ['superpowers'] : [])].flatMap((p) => ['--plugin-dir', join(dir, p)]);
  if (tool !== 'codex') return [];
  const lines = [`Ponytail mode is active (level full): before writing, changing or reviewing code, read ${join(dir, 'ponytail', 'skills', 'ponytail', 'SKILL.md')} and follow it.`];
  if (rtk) lines.push('Run shell commands through rtk to shrink their output (rtk git status, rtk grep, rtk ls...); rtk proxy CMD runs one unfiltered.');
  if (caveman) lines.push(`Caveman mode is active: before every reply, read ${join(dir, 'caveman', 'skills', 'caveman', 'SKILL.md')} and follow it.`);
  if (superpowers) lines.push(`Superpowers skills are active: read ${join(dir, 'superpowers', 'skills', 'using-superpowers', 'SKILL.md')} and follow it; the other skills are in ${join(dir, 'superpowers', 'skills')}.`);
  return ['-c', `developer_instructions=${lines.join(' ')}`];
}

const LINUX_TERMINALS: [string, string[]][] = [
  ['x-terminal-emulator', ['-e']], ['gnome-terminal', ['--']], ['konsole', ['-e']], ['xfce4-terminal', ['-x']], ['xterm', ['-e']],
];

export const launchTool: Launcher = (tool, prompt, root, plugins = []) => {
  const t = TOOLS[tool];
  if (!t.command || !t.args) throw new Error(`${t.label} is not started from the app.`);
  if (!which(t.command)) return { opened: false, message: `${t.label} is not installed on this computer (command "${t.command}" not found).` };

  if (t.clipboard) {
    const copied = copyToClipboard(prompt);
    if (process.platform === 'win32') detached(`${t.command} "${root}"`, [], { shell: true });
    else detached(t.command, [root]);
    return {
      opened: true,
      copied,
      message: `${t.label} is opening the Moki folder. ${copied ? 'The request is in your clipboard — paste it in the AI chat.' : 'Copy the request below into the AI chat.'}`,
    };
  }

  const dir = join(root, 'workspace', 'temporary');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const title = `Moki - ${t.label}`;
  const args = [...pluginArgs(tool, root, plugins), ...t.args(cleanPrompt(prompt))];

  if (process.platform === 'win32') {
    const file = requestFile(tool, args, root, title);
    // Prefer Node.js: Electron in Node mode has no console, so interactive tools would start blank.
    detached('cmd.exe', [windowsStartArgs(which('node') ?? process.execPath, runToolPath(), file, title)], {
      windowsVerbatimArguments: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
  } else if (process.platform === 'darwin') {
    const file = join(dir, `open-${tool}-${stamp}.command`);
    writeFileSync(file, scriptFor(t.command, args, root, title));
    chmodSync(file, 0o755);
    detached('open', [file]);
  } else {
    const file = join(dir, `open-${tool}-${stamp}.sh`);
    writeFileSync(file, scriptFor(t.command, args, root, title));
    chmodSync(file, 0o755);
    const terminal = LINUX_TERMINALS.find(([cmd]) => which(cmd));
    if (!terminal) return { opened: false, message: `No terminal program found. Open a terminal and run: bash "${file}"` };
    detached(terminal[0], [...terminal[1], 'bash', file]);
  }
  return { opened: true, message: `${t.label} is opening in a new terminal window, already in the Moki folder with your request.` };
};

// Windows: the UTF-8 JSON request read by run-tool (see the header).
function requestFile(tool: ToolKey, args: string[], root: string, title: string): string {
  const dir = join(root, 'workspace', 'temporary');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `open-${tool}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ command: TOOLS[tool].command, args, cwd: root, title }), 'utf8');
  return file;
}

// Starts a terminal tool in a terminal tab of the app, with the request or, for an
// empty prompt, just the tool. `prepare` registers the command with
// desktop/terminals.ts; the tab starts it once it knows its size.
export function launchInTerminal(tool: ToolKey, prompt: string, root: string, prepare: (spec: TermSpec) => string, plugins: string[] = []): LaunchResult {
  const t = TOOLS[tool];
  if (!t.command || !t.args || t.clipboard) throw new Error(`${t.label} does not run in a terminal.`);
  if (!which(t.command)) return { opened: false, message: `${t.label} is not installed on this computer (command "${t.command}" not found).` };
  const args = [...pluginArgs(tool, root, plugins), ...(prompt ? t.args(cleanPrompt(prompt)) : [])];
  const id = prepare(process.platform === 'win32'
    ? { file: which('node') ?? process.execPath, args: [runToolPath(), requestFile(tool, args, root, t.label)], cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
    : { file: t.command, args, cwd: root });
  return { opened: true, message: `${t.label} opened in a terminal tab${prompt ? ' with your request' : ''}.`, terminal: { id, title: t.label } };
}

// Opens a folder in the system file manager (Explorer, Finder, ...).
export const openFolder: FolderOpener = (folder) => {
  if (process.platform === 'win32') spawnSync('explorer.exe', [folder]); // explorer returns 1 even on success
  else detached(process.platform === 'darwin' ? 'open' : 'xdg-open', [folder]);
};
