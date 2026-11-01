// Terminal menu of the `qa` command (`qa --terminal`): pick a project, an
// activity and input files, then open the AI tool with the request ready.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, SLUG } from './repo.mjs';
import {
  TOOLS, LANGUAGES, activityProblem, type ActivityKey, type ToolKey, type Request,
  buildPrompt, projectRepository, cleanPath, copyToClipboard, copyToInbox, detectTools, isFile, windowsSafePrompt,
  launchTool, listProjects, loadPrefs, openRuns, projectsDir, savePrefs,
} from './core.ts';
import { createUI, CancelError, c, type UI } from './tui.ts';
import { getActivity, listActivities } from './activities.ts';
import { readableInputs } from './docx.ts';

export interface MenuArgs {
  project?: string;
  activity?: ActivityKey;
  tool?: ToolKey;
  run?: string;
  file?: string[];
  note?: string;
  lang?: string;
  plain?: boolean;
}

interface Out { log(l: string): void; success(l: string): void; warn(l: string): void; outro(l: string): void }

const plainOut: Out = {
  log: (l) => console.log(l), success: (l) => console.log(`✔ ${l}`), warn: (l) => console.log(`! ${l}`),
  outro: (l) => console.log(`${l}\n`),
};

export async function deliver(request: Request & { tool: ToolKey; files: string[] }, out: Out = plainOut): Promise<number> {
  const prompt = buildPrompt({ ...request, files: readableInputs(request.files, ROOT), repository: projectRepository(request.project, ROOT) });
  mkdirSync(join(ROOT, 'workspace', 'temporary'), { recursive: true });
  writeFileSync(join(ROOT, 'workspace', 'temporary', 'last-prompt.txt'), `${prompt}\n`);
  const tool = TOOLS[request.tool];

  out.log(c.dim('Request (also saved in workspace/temporary/last-prompt.txt):'));
  out.log(prompt);

  if (tool.print) { out.outro('Done.'); return 0; }

  const projectDir = join(projectsDir(), request.project);
  if (tool.chat) {
    out.log('');
    if (copyToClipboard(prompt)) out.success('Request copied to the clipboard.');
    else out.warn('Copy the request above.');
    const bundle = join(ROOT, 'dist', 'chat', 'quality-agents-all.md');
    out.log('Upload these files to the chat (see adapters/chat/README.md):');
    out.log(existsSync(bundle) ? `  ${bundle}` : `  dist/chat/quality-agents-all.md ${c.yellow('(run npm run bundle first)')}`);
    out.log(`  ${join(projectDir, 'project.json')}`);
    out.log(`  ${join(projectDir, 'context', 'index.md')} + the context files it lists for this activity`);
    if (request.run) out.log(`  ${join(projectDir, 'runs', request.run, 'state.json')}`);
    request.files.forEach((f) => out.log(`  ${join(ROOT, f)}`));
    out.outro(`Save what the AI produces in ${join(projectDir, 'runs')}`);
    return 0;
  }

  if (tool.clipboard) {
    if (copyToClipboard(prompt)) out.success('Request copied to the clipboard — paste it in the agent chat.');
    else out.warn('Copy the request above into the agent chat.');
  }
  out.outro(`Opening ${c.bold(tool.label)} …`);
  const child = launchTool(request.tool, tool.clipboard ? prompt : windowsSafePrompt(prompt, request.project));
  return new Promise((done) => {
    child.on('exit', (code) => done(code ?? 0));
    child.on('error', (e) => { console.error(`Could not start ${tool.command}: ${e.message}`); done(1); });
  });
}

async function interactive(args: MenuArgs, ui: UI): Promise<number> {
  const prefs = loadPrefs();
  ui.intro('Moki', 'Prepares your request and opens the AI tool you use. Your data stays in workspace/.');

  let project = args.project;
  if (!project) {
    const projects = listProjects();
    project = await ui.select<string>({
      message: 'Which project (system under test)?',
      options: [
        ...projects.map((p) => {
          const runs = openRuns(p).length;
          return { value: p, label: p, hint: runs ? `${runs} open run${runs > 1 ? 's' : ''}` : '' };
        }),
        { value: '__new', label: '+ New project' },
      ],
      initial: prefs.project,
    });
    if (project === '__new') {
      project = await ui.text({
        message: 'Project id',
        placeholder: 'lowercase, digits and hyphens, e.g. billing-portal',
        validate: (v) => (!SLUG.test(v) ? 'Use lowercase letters, digits and single hyphens.' : listProjects().includes(v) ? 'This project already exists.' : ''),
      });
      const name = (await ui.text({ message: 'Display name', placeholder: project })) || project;
      execFileSync(process.execPath, [join(ROOT, 'scripts', 'new-project.mjs'), project, name], { stdio: 'ignore' });
      ui.success(`Created workspace/projects/${project}/`);
    }
  }

  const runs = openRuns(project);
  const activity: ActivityKey = args.activity ?? await ui.select<ActivityKey>({
    message: 'What do you want to do?',
    options: listActivities(undefined, project).map((a) => ({
      value: a.id,
      label: a.label,
      hint: a.id === 'resume' ? `${runs.length} open` : a.description,
      disabled: a.id === 'resume' ? (runs.length ? '' : 'no open runs') : activityProblem(a),
    })),
  });

  let run = args.run || '';
  const files = (args.file || []).map((f) => copyToInbox(project, cleanPath(f)));
  if (activity === 'resume') {
    if (!run) {
      run = await ui.select<string>({
        message: 'Which run?',
        options: runs.map((r) => ({ value: r.id, label: r.id, hint: `${r.status} · step ${r.currentStep || '-'}` })),
      });
    }
  } else if (!files.length) {
    const required = getActivity(activity)?.files === 'required';
    for (;;) {
      const raw = await ui.text({
        message: files.length ? `Another file? (${files.length} added)` : `Input file${required ? '' : ' (optional)'}`,
        placeholder: files.length || !required ? 'type or drag a path · Enter to continue' : 'type or drag a path',
        vanishIfEmpty: true,
        validate: (v) => {
          if (!v) return files.length || !required ? '' : 'This activity needs at least one file.';
          return isFile(cleanPath(v)) ? '' : `File not found: ${cleanPath(v)}`;
        },
      });
      if (!raw) break;
      const rel = copyToInbox(project, cleanPath(raw));
      files.push(rel);
      ui.success(`File ${files.length} → ${rel}`);
    }
  }

  const note = args.note ?? await ui.text({ message: 'Anything else the AI should know?', placeholder: 'optional · Enter to skip' });

  const language = args.lang || await ui.select<string>({
    message: 'Conversation language',
    options: LANGUAGES.map((l) => ({ value: l, label: l })),
    initial: prefs.language || 'English',
  });

  const available = detectTools();
  const tool: ToolKey = args.tool ?? await ui.select<ToolKey>({
    message: 'Open with',
    options: (Object.keys(TOOLS) as ToolKey[]).map((key) => ({
      value: key, label: TOOLS[key].label, hint: TOOLS[key].hint, disabled: available[key] ? '' : 'not installed',
    })),
    initial: prefs.tool && available[prefs.tool as ToolKey] ? prefs.tool as ToolKey : undefined,
  });

  ui.note('Summary', [
    ['Project', project],
    ['Activity', (getActivity(activity)?.label ?? activity) + (run ? ` · ${run}` : '')],
    ...(files.length ? files.map((f, i): [string, string] => [i ? '' : 'Files', f]) : [['Files', c.dim('none')] as [string, string]]),
    ...(note ? [['Note', note] as [string, string]] : []),
    ['Language', language],
    ['Tool', TOOLS[tool].label],
  ]);

  if (!TOOLS[tool].print && !(await ui.confirm({ message: `Open ${TOOLS[tool].label} now?` }))) {
    ui.cancelled('Nothing was opened. Your files are already in the project inbox.');
    return 0;
  }

  savePrefs({ project, language, tool });
  ui.close();
  return deliver({ project, activity, files, note, run, language, tool }, ui);
}

export async function runTerminalMenu(args: MenuArgs, { interactiveInput = false } = {}): Promise<number> {
  if (!process.stdin.isTTY && !interactiveInput) throw new Error('Missing options and no interactive terminal. Run qa --help.');
  const ui = createUI({ forcePlain: args.plain || !process.stdin.isTTY });
  try {
    return await interactive(args, ui);
  } catch (e) {
    if (e instanceof CancelError) { ui.cancelled(); return 130; }
    throw e;
  } finally {
    ui.close();
  }
}
