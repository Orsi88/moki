// Numbers for the status bar, as in Orca: how much of each AI plan is used (Claude
// Code and Codex, asked to each provider with the login the tool saved on this
// computer) and the memory of the computer, of Moki itself and, apart, of the terminals of each project.
// The logins are only read here and sent to their own provider; the UI never sees them.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { freemem, homedir, totalmem } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const C_LOCALE = { ...process.env, LC_ALL: 'C', LANG: 'C' };

export interface PlanWindow { label: string; percent: number; resetsAt: number | null }
export interface PlanUsage { tool: 'claude' | 'codex'; label: string; windows: PlanWindow[]; error?: string }
export interface ProjectMemory { project: string; bytes: number; sessions: { id: string; bytes: number }[] } // a session is one terminal tab
// How a process is measured: PSS on Linux (shared pages split between the processes that share them,
// so a sum is not inflated), private bytes on Windows, the resident size on macOS.
export type MemoryMetric = 'pss' | 'private' | 'rss';
// Moki's own processes by role: the main process (service, Node), each kind of window, the GPU process and the rest of Chromium.
export type AppProcessKind = 'main' | 'window' | 'notes' | 'search' | 'gpu' | 'other';
export interface AppProcess { kind: AppProcessKind; bytes: number; count: number }
// app: Moki itself. tools: everything the terminal tabs started (the shells and AI tools), listed by project in projects.
export interface MemoryUsage { total: number; used: number; metric: MemoryMetric; app: { bytes: number; processes: AppProcess[] }; tools: number; projects: ProjectMemory[] }
// One process of app.getAppMetrics() (sizes in kilobytes; privateBytes only on Windows).
export interface AppMetric { pid: number; type: string; memory: { workingSetSize: number; privateBytes?: number } }
export type WindowKind = 'window' | 'notes' | 'search';

// '5h', '7d', '30d' from a window length in seconds.
export const windowLabel = (seconds: number): string => (seconds % 86400 === 0 ? `${seconds / 86400}d` : `${Math.round(seconds / 3600)}h`);

const pct = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null);
const time = (v: unknown): number | null => {
  const ms = typeof v === 'number' ? (v < 1e10 ? v * 1000 : v) : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

type Json = Record<string, any>; // provider answers, read defensively field by field

// Claude's /api/oauth/usage: every limit of the plan in limits[] (session, weekly, weekly of one model...).
export function claudeWindows(data: Json): PlanWindow[] {
  const limits: Json[] = Array.isArray(data.limits) ? data.limits
    : [{ group: 'session', percent: data.five_hour?.utilization, resets_at: data.five_hour?.resets_at },
      { group: 'weekly', percent: data.seven_day?.utilization, resets_at: data.seven_day?.resets_at }];
  return limits.flatMap((l) => {
    const percent = pct(l?.percent);
    if (percent === null) return [];
    const base = l.group === 'session' ? '5h' : l.group === 'weekly' ? '7d' : String(l.group ?? l.kind ?? '');
    const model = l.scope?.model?.display_name;
    return [{ label: model ? `${base} ${model}` : base, percent, resetsAt: time(l.resets_at) }];
  });
}

// Codex's /backend-api/wham/usage: a primary and an optional secondary window, each with its length.
export function codexWindows(data: Json): PlanWindow[] {
  return [data.rate_limit?.primary_window, data.rate_limit?.secondary_window].flatMap((w: Json | null | undefined) => {
    const percent = pct(w?.used_percent);
    if (!w || percent === null) return [];
    return [{ label: typeof w.limit_window_seconds === 'number' ? windowLabel(w.limit_window_seconds) : '', percent, resetsAt: time(w.reset_at) }];
  });
}

async function claudeToken(): Promise<string | null> {
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  let raw = await readFile(join(dir, '.credentials.json'), 'utf8').catch(() => '');
  if (!raw && process.platform === 'darwin') {
    raw = await run('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 5000 }).then((r) => r.stdout, () => '');
  }
  try { return (JSON.parse(raw) as Json).claudeAiOauth?.accessToken || null; } catch { return null; }
}

async function codexAuth(): Promise<{ token: string; account?: string } | null> {
  try {
    const tokens = (JSON.parse(await readFile(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'), 'utf8')) as Json).tokens;
    return tokens?.access_token ? { token: tokens.access_token, account: tokens.account_id } : null;
  } catch { return null; }
}

async function getJson(url: string, headers: Record<string, string>): Promise<Json> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (res.status === 401 || res.status === 403) throw new Error('The login of this tool expired. Open it once to sign in again.');
  if (!res.ok) throw new Error(`The provider answered ${res.status}.`);
  return res.json() as Promise<Json>;
}

// Only the tools logged in with a subscription (not an API key) appear.
async function fetchPlans(): Promise<PlanUsage[]> {
  const [claude, codex] = await Promise.all([claudeToken(), codexAuth()]);
  const ask = async (tool: PlanUsage['tool'], label: string, load: () => Promise<PlanWindow[]>): Promise<PlanUsage> => {
    try { return { tool, label, windows: await load() }; } catch (e) { return { tool, label, windows: [], error: e instanceof Error ? e.message : String(e) }; }
  };
  return Promise.all([
    ...(claude ? [ask('claude', 'Claude', async () => claudeWindows(await getJson('https://api.anthropic.com/api/oauth/usage', {
      Authorization: `Bearer ${claude}`, 'anthropic-beta': 'oauth-2025-04-20',
    })))] : []),
    ...(codex ? [ask('codex', 'Codex', async () => codexWindows(await getJson('https://chatgpt.com/backend-api/wham/usage', {
      Authorization: `Bearer ${codex.token}`, 'User-Agent': 'codex-cli', ...(codex.account ? { 'ChatGPT-Account-Id': codex.account } : {}),
    })))] : []),
  ]);
}

// The providers limit how often usage is asked; the status bar polls often, so answers are kept a while.
const PLAN_TTL = 5 * 60_000;
let plans: { at: number; value: Promise<PlanUsage[]> } | null = null;
export function planUsage(refresh = false): Promise<PlanUsage[]> {
  if (!plans || refresh || Date.now() - plans.at > PLAN_TTL) plans = { at: Date.now(), value: fetchPlans() };
  return plans.value;
}

// "pid ppid kilobytes" per line (ps on macOS/Linux, the same columns from PowerShell on Windows).
export function parseProcesses(out: string): Map<number, { ppid: number; kb: number }> {
  const rows = new Map<number, { ppid: number; kb: number }>();
  for (const line of out.split(/\r?\n/)) {
    const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number);
    if (Number.isInteger(pid) && Number.isInteger(ppid)) rows.set(pid, { ppid, kb: Number.isFinite(kb) ? kb : 0 });
  }
  return rows;
}

// A process and everything it started (the shell, the AI tool, its helpers).
export function treePids(rows: Map<number, { ppid: number; kb: number }>, root: number): number[] {
  const children = new Map<number, number[]>();
  for (const [pid, { ppid }] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const seen = new Set<number>();
  const queue = [root];
  for (let pid = queue.pop(); pid !== undefined; pid = queue.pop()) {
    if (seen.has(pid) || !rows.has(pid)) continue;
    seen.add(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return [...seen];
}

// Memory of a process tree, each process counted once. sizes: bytes measured per pid (PSS), used instead of the listed kilobytes.
export function treeBytes(rows: Map<number, { ppid: number; kb: number }>, root: number, sizes?: Map<number, number>): number {
  return treePids(rows, root).reduce((sum, pid) => sum + (sizes?.get(pid) ?? (rows.get(pid)?.kb ?? 0) * 1024), 0);
}

// The proportional set size from /proc/<pid>/smaps_rollup, in bytes; null when the line is missing.
export function parseSmapsRollup(text: string): number | null {
  const kb = /^Pss:\s+(\d+)\s*kB/m.exec(text)?.[1];
  return kb === undefined ? null : Number(kb) * 1024;
}

// PSS of each process that can be read (Linux only; a process that ended or is not readable is left out).
async function pssOf(pids: number[]): Promise<Map<number, number>> {
  const sizes = new Map<number, number>();
  if (process.platform !== 'linux') return sizes;
  await Promise.all(pids.map(async (pid) => {
    const bytes = parseSmapsRollup(await readFile(`/proc/${pid}/smaps_rollup`, 'utf8').catch(() => ''));
    if (bytes !== null) sizes.set(pid, bytes);
  }));
  return sizes;
}

const KIND_ORDER: AppProcessKind[] = ['main', 'window', 'notes', 'search', 'gpu', 'other'];

// Moki's processes grouped by role. windows: renderer pid -> the window it draws. sizes: PSS per pid when measured,
// otherwise private bytes (Windows) or the working set.
export function appMemory(metrics: AppMetric[], windows: Map<number, WindowKind>, sizes: Map<number, number> = new Map()): { bytes: number; processes: AppProcess[] } {
  const groups = new Map<AppProcessKind, AppProcess>();
  for (const m of metrics) {
    const kind: AppProcessKind = m.type === 'Browser' ? 'main' : m.type === 'GPU' ? 'gpu' : windows.get(m.pid) ?? 'other';
    const bytes = sizes.get(m.pid) ?? (m.memory.privateBytes ?? m.memory.workingSetSize) * 1024;
    const g = groups.get(kind) ?? { kind, bytes: 0, count: 0 };
    g.bytes += bytes;
    g.count += 1;
    groups.set(kind, g);
  }
  const processes = KIND_ORDER.flatMap((k) => groups.get(k) ?? []);
  return { bytes: processes.reduce((n, p) => n + p.bytes, 0), processes };
}

async function processes(): Promise<string> {
  try {
    if (process.platform !== 'win32') return (await run('ps', ['-A', '-o', 'pid=,ppid=,rss='], { env: C_LOCALE, timeout: 5000, maxBuffer: 10 << 20 })).stdout;
    return (await run('powershell.exe', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $([math]::Round($_.PrivatePageCount / 1KB))" }'],
    { timeout: 10_000, maxBuffer: 10 << 20, windowsHide: true })).stdout;
  } catch { return ''; }
}

// Memory the system can still give out: free memory alone hides the reclaimable cache on Linux and macOS.
async function available(): Promise<number> {
  if (process.platform === 'linux') {
    const kb = /^MemAvailable:\s*(\d+)\s*kB/m.exec(await readFile('/proc/meminfo', 'utf8').catch(() => ''))?.[1];
    if (kb) return Number(kb) * 1024;
  }
  if (process.platform === 'darwin') {
    const free = /free percentage:\s*(\d+)%/.exec(await run('memory_pressure', ['-Q'], { env: C_LOCALE, timeout: 2000 }).then((r) => r.stdout, () => ''))?.[1];
    if (free) return (totalmem() * Number(free)) / 100;
  }
  return freemem();
}

// metrics: Electron's own processes (app.getAppMetrics), which the terminals are not part of; windows: which window each renderer draws.
// Moki and the AI tools are measured apart, the same way, so neither number includes the other.
export async function memoryUsage(terminals: { id: string; pid: number; project: string }[], metrics: AppMetric[], windows: Map<number, WindowKind> = new Map()): Promise<MemoryUsage> {
  const [out, free] = await Promise.all([terminals.length ? processes() : Promise.resolve(''), available()]);
  const rows = parseProcesses(out);
  const trees = new Map(terminals.map((t) => [t.id, treePids(rows, t.pid)]));
  const sizes = await pssOf([...metrics.map((m) => m.pid), ...[...trees.values()].flat()]);
  const metric: MemoryMetric = sizes.size ? 'pss' : process.platform === 'win32' ? 'private' : 'rss';
  const byProject = new Map<string, ProjectMemory>();
  for (const { id, pid, project } of terminals) {
    const p = byProject.get(project) ?? { project, bytes: 0, sessions: [] };
    const bytes = treeBytes(rows, pid, sizes);
    p.bytes += bytes;
    p.sessions.push({ id, bytes });
    byProject.set(project, p);
  }
  const projects = [...byProject.values()].sort((a, b) => b.bytes - a.bytes);
  for (const p of projects) p.sessions.sort((a, b) => b.bytes - a.bytes);
  const total = totalmem();
  return { total, used: Math.max(0, total - free), metric, app: appMemory(metrics, windows, sizes), tools: projects.reduce((n, p) => n + p.bytes, 0), projects };
}
