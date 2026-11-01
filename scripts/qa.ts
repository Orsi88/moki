#!/usr/bin/env node
// qa — Moki command.
//
//   qa                         open the Moki desktop app
//   qa --terminal [--plain]    guided menu in the terminal instead of the app
//   qa --project <id> --activity <key> --tool <key> [--file <path>]... [--note "<text>"]
//      [--run <run-id>] [--lang <language>]   prepare a request and open an AI tool directly
//
// Activities: open, review, tests, review-then-tests, failure, context, resume
// Tools: claude, codex, cursor-agent, gemini, antigravity, cursor, vscode, chat, print

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/repo.mjs';
import { TOOLS, activityProblem, cleanPath, copyToInbox, isFile, isTool, listProjects } from './lib/core.ts';
import { getActivity, listActivities } from './lib/activities.ts';
import { deliver, runTerminalMenu, type MenuArgs } from './lib/terminal-menu.ts';
import { c } from './lib/tui.ts';

const FLAGS = new Set(['help', 'h', 'terminal', 'interactive', 'plain']);

interface CliArgs { [key: string]: string | boolean | string[] | undefined; file?: string[]; ignored: string[] }

export function parseCli(argv: string[]): CliArgs {
  const args: CliArgs = { ignored: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('-')) { args.ignored.push(argv[i]); continue; }
    const key = argv[i].replace(/^--?/, '');
    if (FLAGS.has(key)) { args[key === 'h' ? 'help' : key] = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}. Run qa --help.`);
    if (key === 'file') (args.file ??= []).push(value); else args[key] = value;
    i++;
  }
  return args;
}

function str(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined; }

// Opens the desktop app (Electron) and gives the terminal back immediately.
export function openDesktopApp(root = ROOT): number {
  const built = existsSync(join(root, 'app', 'dist', 'index.html')) && existsSync(join(root, 'app', 'dist-electron', 'main.mjs'));
  let electron = '';
  try { electron = createRequire(import.meta.url)('electron') as string; } catch { /* not installed */ }
  if (!built || !electron) {
    console.error('The Moki app is not installed yet.\nRun this once in the quality-agents folder:  npm run setup');
    return 1;
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [root], { cwd: root, env, detached: true, stdio: 'ignore' });
  child.unref();
  console.log('Opening Moki…');
  return 0;
}

async function main(): Promise<number> {
  const args = parseCli(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 11).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }
  if (args.ignored.length) console.log(c.dim(`(ignoring "${args.ignored.join(' ')}" — qa takes only --options; see qa --help)`));

  const project = str(args.project);
  const activity = str(args.activity);
  const tool = str(args.tool);
  const wantsTerminal = Boolean(args.terminal || args.interactive || project || activity || tool || args.file || args.run);
  if (!wantsTerminal) return openDesktopApp();

  if (project && !listProjects().includes(project)) throw new Error(`Project "${project}" not found. Create it with: npm run new-project -- ${project}`);
  const def = activity ? getActivity(activity) : undefined;
  if (activity && !def) throw new Error(`Unknown activity "${activity}". Options: ${listActivities().map((a) => a.id).join(', ')}`);
  if (def && activityProblem(def)) throw new Error(`The activity "${def.label}" cannot run here: ${activityProblem(def)}.`);
  if (tool && !isTool(tool)) throw new Error(`Unknown tool "${tool}". Options: ${Object.keys(TOOLS).join(', ')}`);
  for (const f of args.file || []) if (!isFile(cleanPath(f))) throw new Error(`File not found: ${f}`);

  const menuArgs: MenuArgs = {
    project,
    activity: def ? def.id : undefined,
    tool: tool && isTool(tool) ? tool : undefined,
    run: str(args.run),
    file: args.file,
    note: str(args.note),
    lang: str(args.lang),
    plain: Boolean(args.plain),
  };

  const complete = menuArgs.project && menuArgs.activity && menuArgs.tool
    && (menuArgs.activity !== 'resume' || menuArgs.run)
    && (def?.files !== 'required' || menuArgs.file?.length);
  if (complete && menuArgs.project && menuArgs.activity && menuArgs.tool) {
    const files = (menuArgs.file || []).map((f) => copyToInbox(menuArgs.project as string, cleanPath(f)));
    return deliver({
      project: menuArgs.project, activity: menuArgs.activity, tool: menuArgs.tool, files,
      note: menuArgs.note || '', run: menuArgs.run || '', language: menuArgs.lang || 'English',
    });
  }
  return runTerminalMenu(menuArgs, { interactiveInput: Boolean(args.interactive) });
}

// realpath: `npm link` runs this file through a symlink on macOS/Linux.
const invokedDirectly = (() => {
  try { return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; }
})();
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((e: unknown) => {
    console.error(`qa: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
