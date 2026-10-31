// Running a multi-agent operation in a project: one run folder (runs/<id>/),
// one step at a time. Each time a step runs is a visit with its own slot ("s2",
// then "s2-2" when a loop brings it back): the agent (in a terminal tab of its AI
// tool) reads the request and the files of the visit before it, delivers in
// outputs/<slot>/ and, when done, writes handoff/<slot>.md, with "outcome: <result>"
// when its agent declares results. Moki sees a visit as done when its handoff and
// its declared outputs are there; then it follows the arrow of the result (or the
// arrow without one), starts the next step or waits for the user's approval (an
// approval arrow, or an agent that executes through an MCP). The user decides when
// no arrow fits the result, and when a step would run more than maxRounds times.
// While the agent waits for an answer in its terminal it writes waiting/<slot>.md
// (the question): the run waits for the user. Pausing lets the running visit finish.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nowStamp } from './repo.mjs';
import { nextLink, startOf, type Operation, type OperationAgent, type OperationLink } from './operations.ts';
import type { McpServer } from './mcp.ts';

export type VisitStatus = 'awaiting-approval' | 'ready' | 'running' | 'done';
export interface RunStep {
  id: string; agent: string; name: string; file: string; // the agent and its file (relative to the framework root, or absolute)
  inputs: string[]; outputs: string[]; outcomes: string[]; executes: string[]; // MCP servers it executes through
  lane: string; ai: string;
  servers?: McpServer[]; // the MCP servers of its agent the project had on when the run started (only ${VARIABLE} references, no values)
}
export interface Visit {
  slot: string; step: string; round: number; from: string; // the visit before ('' for the first)
  gate: string; map: Record<string, string>; // of the arrow taken into it
  status: VisitStatus; outcome?: string; question?: string; terminal?: string; startedAt?: string; finishedAt?: string;
}
// What the run waits for the user to decide: which arrow to follow, or whether to go past the limit of rounds.
export interface Decision { kind: 'path' | 'limit'; from: string; outcome?: string; options: { to: string; when: string }[] }
export interface OperationRun {
  schemaVersion: '1'; id: string; project: string; workflow: string; operation: { id: string; name: string };
  createdAt: string; updatedAt: string; status: string; currentStep: string; completedSteps: string[];
  pending: { id: string; description: string }[]; approvals: { step: string; decision: string; at: string; by?: string; notes?: string }[];
  inputs: { path: string; description?: string }[]; results: object[]; artifacts: string[];
  steps: RunStep[]; links: OperationLink[]; maxRounds: number; visits: Visit[]; decision: Decision | null; ended: boolean; paused: boolean;
}

// What the user gives when starting: the AI of each step, answers to the initial form (text and inbox files), the general context.
export interface RunRequest {
  tools: Record<string, string>;
  answers: { step: string; input: string; text: string; files: string[] }[];
  context: string;
}

const now = () => new Date().toISOString();
const stateFile = (dir: string) => join(dir, 'state.json');
export const readRun = (dir: string): OperationRun => JSON.parse(readFileSync(stateFile(dir), 'utf8')) as OperationRun;
const writeRun = (dir: string, run: OperationRun) => { run.updatedAt = now(); writeFileSync(stateFile(dir), `${JSON.stringify(run, null, 2)}\n`, 'utf8'); };
export const isOperationRun = (state: unknown): state is OperationRun => Boolean(state && typeof state === 'object' && Array.isArray((state as OperationRun).visits) && (state as OperationRun).operation);
const stepOf = (run: OperationRun, id: string) => run.steps.find((s) => s.id === id) as RunStep;
const current = (run: OperationRun) => run.visits[run.visits.length - 1];

// The run's overall status, from its last visit (the persistence protocol's vocabulary, plus "paused").
function settle(run: OperationRun): void {
  const last = current(run);
  run.completedSteps = run.visits.filter((v) => v.status === 'done').map((v) => v.slot);
  run.currentStep = run.ended ? '' : last?.slot ?? '';
  run.pending = [
    ...(last?.question && last.status === 'running' ? [{ id: `${last.slot}-question`, description: last.question }] : []),
    ...(run.decision ? [{ id: `${run.decision.from}-${run.decision.kind}`, description: run.decision.kind === 'path' ? 'Choose the next step' : 'Go past the limit of rounds?' }] : []),
  ];
  if (run.status === 'cancelled') return;
  if (run.ended) run.status = 'completed';
  else if (last?.status === 'running') run.status = last.question ? 'awaiting-input' : 'in-progress';
  else if (run.decision) run.status = 'awaiting-input';
  else if (run.paused) run.status = 'paused';
  else if (last?.status === 'awaiting-approval') run.status = 'awaiting-approval';
  else run.status = 'in-progress';
}

// A step waits for the user before it starts after an approval arrow, or when its agent executes through an MCP.
const needsApproval = (step: RunStep, gate: string) => gate === 'approval' || step.executes.length > 0;

function visit(run: OperationRun, stepId: string, from: Visit | undefined, link?: OperationLink): Visit {
  const round = run.visits.filter((v) => v.step === stepId).length + 1;
  const step = stepOf(run, stepId);
  const v: Visit = { slot: round === 1 ? stepId : `${stepId}-${round}`, step: stepId, round, from: from?.slot ?? '', gate: link?.gate ?? '', map: link?.map ?? {}, status: 'ready' };
  if (needsApproval(step, v.gate)) v.status = 'awaiting-approval';
  run.visits.push(v);
  return v;
}

export function createOperationRun(projectDir: string, project: string, op: Operation, agents: (OperationAgent & { file: string; servers?: McpServer[] })[], order: string[], req: RunRequest): OperationRun {
  const runs = join(projectDir, 'runs');
  let id = `${nowStamp()}-op-${op.id}`.slice(0, 120);
  for (let i = 2; existsSync(join(runs, id)); i++) id = `${nowStamp()}-op-${op.id}-${i}`;
  const dir = join(runs, id);
  for (const sub of ['inputs', 'outputs', 'handoff', 'waiting', 'logs']) mkdirSync(join(dir, sub), { recursive: true });

  const laneOf = (x: number) => {
    let left = 0;
    for (const l of op.lanes) { if (x < left + l.width) return l.name; left += l.width; }
    return '';
  };
  const steps: RunStep[] = order.map((sid) => {
    const step = op.steps.find((s) => s.id === sid);
    const agent = agents.find((a) => a.key === step?.agent);
    if (!step || !agent) throw new Error(`Step ${sid}: its agent is not available.`);
    const ai = req.tools[sid] ?? '';
    if (!ai) throw new Error(`Choose the AI of ${agent.name}.`);
    return {
      id: sid, agent: agent.name, name: agent.name, file: agent.file, inputs: agent.inputs, outputs: agent.outputs, outcomes: agent.outcomes ?? [],
      executes: agent.mcps.filter((m) => m.mode === 'execute').map((m) => m.name), lane: laneOf(step.x + 105), ai, // the lane under the middle of its card
      servers: agent.servers ?? [],
    };
  });

  // The request every step reads first.
  const lines = [`# ${op.name}`, '', '## What the user wants', '', req.context.trim() || '(nothing added)', ''];
  const files: string[] = [];
  for (const s of steps) {
    const answers = req.answers.filter((a) => a.step === s.id);
    if (!answers.length) continue;
    lines.push(`## For ${s.name}`, '');
    for (const a of answers) {
      lines.push(`### ${a.input}`, '', a.text.trim() || '(no text)', '');
      for (const f of a.files) { lines.push(`- File: \`workspace/projects/${project}/${f}\``); files.push(f); }
      if (a.files.length) lines.push('');
    }
  }
  writeFileSync(join(dir, 'inputs', 'request.md'), `${lines.join('\n')}\n`, 'utf8');

  const created = now();
  const run: OperationRun = {
    schemaVersion: '1', id, project, workflow: `operation-${op.id}`, operation: { id: op.id, name: op.name },
    createdAt: created, updatedAt: created, status: 'in-progress', currentStep: '', completedSteps: [],
    pending: [], approvals: [], inputs: [{ path: `workspace/projects/${project}/runs/${id}/inputs/request.md`, description: 'Request and answers to the initial form' },
      ...[...new Set(files)].map((f) => ({ path: `workspace/projects/${project}/${f}`, description: 'Attached when the operation started' }))],
    results: [], artifacts: [], steps, links: op.links.filter((l) => order.includes(l.from) && order.includes(l.to)), maxRounds: op.maxRounds,
    visits: [], decision: null, ended: false, paused: false,
  };
  visit(run, startOf(op), undefined);
  settle(run);
  writeRun(dir, run);
  appendFileSync(join(projectDir, 'activity-log.md'), `| ${created.slice(0, 10)} | operation: ${op.name} | ${id} | ${run.status} |\n`);
  return run;
}

// Every file a visit delivered (relative to its outputs folder).
function delivered(dir: string, slot: string): string[] {
  const out = join(dir, 'outputs', slot);
  if (!existsSync(out)) return [];
  return readdirSync(out, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => join(e.parentPath ?? (e as unknown as { path: string }).path, e.name).slice(out.length + 1).split(/[\\/]/).join('/'));
}
const matches = (pattern: string, file: string) => {
  const name = file.split('/').pop() ?? file;
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
  return re.test(name);
};
export const missingOutputs = (dir: string, run: OperationRun, v: Visit): string[] => stepOf(run, v.step).outputs.filter((o) => !delivered(dir, v.slot).some((f) => matches(o, f)));
const finished = (dir: string, run: OperationRun, v: Visit) => existsSync(join(dir, 'handoff', `${v.slot}.md`)) && !missingOutputs(dir, run, v).length;
// "outcome: approved" (or "result:" / "resultado:") in the handoff, when its agent declares results.
const outcomeIn = (text: string, outcomes: string[]): string => {
  const m = text.match(/^\s*(?:\*\*)?(?:outcome|result|resultado)(?:\*\*)?\s*:\s*(.+)$/im);
  const said = m?.[1].replace(/[*`_]/g, '').trim().toLowerCase() ?? '';
  return outcomes.find((o) => o.toLowerCase() === said) ?? '';
};

// After a visit ends: the arrow of its result (or the one without), or a decision for the user, or the end.
function follow(run: OperationRun, done: Visit): void {
  const step = stepOf(run, done.step);
  const out = run.links.filter((l) => l.from === done.step);
  if (!out.length) { run.ended = true; return; }
  const link = nextLink(run.links, done.step, done.outcome ?? '');
  if (!link) {
    // A result with no arrow (and none without a result): ends there if the result is known, else the user picks.
    if (done.outcome && step.outcomes.length) { run.ended = true; return; }
    run.decision = { kind: 'path', from: done.slot, outcome: done.outcome, options: out.map((l) => ({ to: l.to, when: l.when })) };
    return;
  }
  if (run.visits.filter((v) => v.step === link.to).length >= run.maxRounds) {
    run.decision = { kind: 'limit', from: done.slot, outcome: done.outcome, options: [{ to: link.to, when: link.when }] };
    return;
  }
  visit(run, link.to, done, link);
}

// Looks at the running visit (its question, its files); when it is done, the run moves on. Returns the visit to start, if any.
export function advance(dir: string, project: string): string | null {
  const run = readRun(dir);
  if (run.status === 'cancelled' || run.ended) return null;
  const before = JSON.stringify(run);
  const last = current(run);
  if (last?.status === 'running') {
    const waiting = join(dir, 'waiting', `${last.slot}.md`);
    if (finished(dir, run, last)) {
      last.status = 'done'; last.finishedAt = now(); delete last.question;
      last.outcome = outcomeIn(readFileSync(join(dir, 'handoff', `${last.slot}.md`), 'utf8'), stepOf(run, last.step).outcomes) || undefined;
      for (const f of delivered(dir, last.slot)) run.artifacts.push(`workspace/projects/${project}/runs/${run.id}/outputs/${last.slot}/${f}`);
      run.artifacts.push(`workspace/projects/${project}/runs/${run.id}/handoff/${last.slot}.md`);
      follow(run, last);
    } else if (existsSync(waiting)) last.question = readFileSync(waiting, 'utf8').trim().slice(0, 2000) || '(see the terminal)';
    else delete last.question;
  }
  settle(run);
  if (JSON.stringify(run) !== before) writeRun(dir, run);
  const next = current(run);
  return !run.paused && !run.ended && !run.decision && next?.status === 'ready' ? next.slot : null;
}

export function markStarted(dir: string, slot: string, terminal?: string): OperationRun {
  const run = readRun(dir);
  const v = current(run);
  if (!v || v.slot !== slot || v.status !== 'ready' || run.paused || run.status === 'cancelled' || run.decision) throw new Error('This step cannot start now.');
  v.status = 'running'; v.startedAt = now(); v.terminal = terminal;
  settle(run); writeRun(dir, run);
  return run;
}

// The user's OK for the visit waiting for it. Returns its slot, now ready.
export function approve(dir: string, by = 'user'): string {
  const run = readRun(dir);
  const v = current(run);
  if (!v || v.status !== 'awaiting-approval' || run.status === 'cancelled') throw new Error('Nothing is waiting for your approval.');
  v.status = 'ready';
  run.approvals.push({ step: v.slot, decision: 'approved', at: now(), by });
  settle(run); writeRun(dir, run);
  return v.slot;
}

// The user's choice when the run waits for one: a step to go to, or '' to end the operation there.
export function decide(dir: string, to: string, by = 'user'): OperationRun {
  const run = readRun(dir);
  const d = run.decision;
  if (!d || run.status === 'cancelled') throw new Error('Nothing is waiting for a decision.');
  const done = run.visits.find((v) => v.slot === d.from) as Visit;
  run.decision = null;
  if (!to) run.ended = true;
  else {
    const link = run.links.find((l) => l.from === done.step && l.to === to && d.options.some((o) => o.to === to && o.when === l.when));
    if (!link) throw new Error('Choose one of the steps offered.');
    visit(run, to, done, link);
  }
  run.approvals.push({ step: d.from, decision: 'adjusted', at: now(), by, notes: to ? `went on to ${stepOf(run, to).name}` : 'ended the operation' });
  settle(run); writeRun(dir, run);
  return run;
}

export function setPaused(dir: string, paused: boolean): OperationRun {
  const run = readRun(dir);
  if (run.status === 'cancelled' || run.ended) throw new Error('This operation has ended.');
  run.paused = paused;
  settle(run); writeRun(dir, run);
  return run;
}

export function cancel(dir: string): OperationRun {
  const run = readRun(dir);
  run.status = 'cancelled';
  writeRun(dir, run);
  return run;
}

// What the AI tool of a visit is asked: who to be, where the request and the previous work are, what to deliver, and how to finish.
export function stepPrompt(run: OperationRun, slot: string, workspace: string, language: string): string {
  const v = run.visits.find((x) => x.slot === slot) as Visit;
  const step = stepOf(run, v.step);
  const prev = run.visits.find((x) => x.slot === v.from);
  const base = `${workspace}/projects/${run.project}/runs/${run.id}`;
  const fromPrev = step.inputs.filter((x) => v.map[x]);
  const asked = step.inputs.filter((x) => !v.map[x]);
  const earlier = run.visits.filter((x) => x.step === v.step && x.slot !== v.slot && x.status === 'done');
  return [
    `Follow AGENTS.md. Project: ${run.project}.`,
    `Act as the ${step.name} agent: read ${step.file} and follow it.`,
    `You are a step of the multi-agent operation "${run.operation.name}"${v.round > 1 ? ` (this step runs again: time ${v.round})` : ''}. Run folder: ${base}/ (its state.json is updated by Moki: do not change it).`,
    `First read the request: ${base}/inputs/request.md (what the user wants, answers and attached files).`,
    ...(prev ? [`The step before (${stepOf(run, prev.step).name}) delivered its files in ${base}/outputs/${prev.slot}/ and a summary in ${base}/handoff/${prev.slot}.md. Read them.`] : []),
    ...(earlier.length ? [`Your earlier work in this run: ${earlier.map((x) => `${base}/outputs/${x.slot}/ (summary ${base}/handoff/${x.slot}.md)`).join('; ')}. Build on it.`] : []),
    ...(fromPrev.length ? [`Your inputs from it: ${fromPrev.map((x) => `"${x}" is ${v.map[x]}`).join('; ')}.`] : []),
    ...(asked.length ? [`Your inputs answered in the request: ${asked.map((x) => `"${x}"`).join(', ')}. If one is missing, ask the user here.`] : []),
    `Save everything you deliver in ${base}/outputs/${v.slot}/${step.outputs.length ? `, including: ${step.outputs.join(', ')}` : ''}.`,
    `Before you stop to ask the user something here, write the question in ${base}/waiting/${v.slot}.md (Moki shows that you are waiting for them); delete that file when you have the answer.`,
    `Stop at your skills' approval points and ask the user here. Talk to the user in ${language}.`,
    `When you have finished, write ${base}/handoff/${v.slot}.md: a short summary of what you did, the files you delivered and the open points.${step.outcomes.length ? ` Its first line must be "outcome: <result>", the result being exactly one of: ${step.outcomes.join(', ')}.` : ''} Write it last: it tells Moki this step is done. Do not start the next step.`,
  ].join('\n');
}
