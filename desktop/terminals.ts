// Embedded terminals of the desktop app (same model as Orca): each terminal tab
// in the UI is a real pseudo-terminal (node-pty) owned by this process, drawn in
// the window with xterm.js. Only commands prepared here can start — the AI tools
// of the fixed TOOLS list (desktop/launcher.ts) or the user's shell — and the UI
// can only start, type into, resize and close them by id. A terminal outlives its
// tab: leaving the project only detaches it; it keeps running here, with the end of
// its output kept so the tab draws it again when the project opens. It stops when
// its tab is closed, or the app quits.

import { createRequire } from 'node:module';

export interface TermSpec { file: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv; title?: string }
const KEEP = 128 * 1024; // characters of output kept per terminal, drawn again when its tab comes back
const BATCH_MS = 16; // output is sent to the window once per frame, not once per chunk of the process
const FLOW_HIGH = 1024 * 1024; // characters sent and not yet drawn by the window above which the process is paused
const FLOW_LOW = 256 * 1024; // ... and below which it goes on
const FLOW_STALL_MS = 5000; // a paused process whose window confirms nothing for this long goes on anyway

// The last `keep` characters of a stream, kept as chunks: appending never rebuilds the whole text
// (small chunks join the last one, so the list stays short) and only the head is cut.
export function createTail(keep: number) {
  const chunks: string[] = [];
  let size = 0;
  return {
    push(data: string): void {
      if (!data) return;
      if (chunks.length && chunks[chunks.length - 1].length < 8192) chunks[chunks.length - 1] += data;
      else chunks.push(data);
      size += data.length;
      while (size > keep) {
        const extra = size - keep;
        if (chunks[0].length <= extra) size -= chunks.shift()!.length;
        else { chunks[0] = chunks[0].slice(extra); size -= extra; }
      }
    },
    text: (): string => chunks.join(''),
  };
}

// Groups what arrives within `ms` into one call of `emit`, in order. flush() sends what waits now; cancel() drops it.
export function createBatcher(emit: (data: string) => void, ms: number) {
  let waiting: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => { if (timer) clearTimeout(timer); timer = undefined; };
  const flush = (): void => {
    stop();
    if (!waiting.length) return;
    const data = waiting.join('');
    waiting = [];
    emit(data);
  };
  return {
    add(data: string): void { waiting.push(data); timer ??= setTimeout(flush, ms); },
    flush,
    cancel(): void { stop(); waiting = []; },
  };
}

// Backpressure between a process and the window drawing it: `sent(n)` counts what was sent, `acked(n)` what the window
// confirmed drawing. Above `high` unconfirmed the process is paused, below `low` it goes on (the gap avoids flapping).
// It never leaves a process paused for good: reset() (a window attached again), release() (no window to draw: output is
// not counted until it confirms something again), dispose() and a window that confirms nothing for `stallMs` all resume it.
export function createFlowControl(o: { high: number; low: number; pause: () => void; resume: () => void; stallMs?: number }) {
  let pending = 0;
  let paused = false;
  let off = false; // no window is drawing: nothing is counted and nothing pauses
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => { if (timer) clearTimeout(timer); timer = undefined; };
  const go = (): void => { clear(); if (!paused) return; paused = false; try { o.resume(); } catch { /* the process is gone */ } };
  const watch = (): void => {
    clear();
    timer = setTimeout(() => { pending = 0; off = true; go(); }, o.stallMs ?? FLOW_STALL_MS);
    timer.unref?.();
  };
  return {
    sent(n: number): void {
      if (off || !(n > 0)) return;
      pending += n;
      if (paused || pending <= o.high) return;
      paused = true;
      try { o.pause(); } catch { paused = false; return; } // a terminal that cannot pause just is not slowed
      watch();
    },
    // The window is not trusted: anything but a finite number >= 0 counts as nothing.
    acked(n: number): void {
      if (!Number.isFinite(n) || n <= 0) return;
      off = false;
      pending = Math.max(0, pending - n);
      if (!paused) return;
      if (pending < o.low) go(); else watch(); // progress: the stall timer starts again
    },
    reset(): void { pending = 0; off = false; go(); },
    release(): void { pending = 0; off = true; go(); },
    dispose(): void { pending = 0; off = true; go(); },
  };
}

// The part of node-pty used here (it is an optional dependency, so its types may be absent).
interface IPty {
  pid: number;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (e: { exitCode: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  pause(): void;
  resume(): void;
}
interface PtyModule {
  spawn(file: string, args: string[], options: { name: string; cols: number; rows: number; cwd: string; env: NodeJS.ProcessEnv }): IPty;
}
let pty: PtyModule | null | undefined;

// node-pty is native; when it is not built for this machine the app falls back
// to opening the tools in external terminal windows.
export function loadPty(): PtyModule | null {
  if (pty === undefined) {
    try { pty = createRequire(import.meta.url)('node-pty') as PtyModule; } catch { pty = null; }
  }
  return pty;
}

// The user's own shell, for the "New terminal" tab.
export const shellSpec = (cwd: string): TermSpec => process.platform === 'win32'
  ? { file: 'powershell.exe', args: ['-NoLogo'], cwd }
  : { file: process.env.SHELL || '/bin/bash', args: [], cwd };

// onExit: a terminal ended, with the project whose tab ran it (operations follow their steps' terminals here, whatever is on screen).
export function createTerminals(send: (channel: 'qa:term-data' | 'qa:term-exit', id: string, payload: string | number) => void, onExit?: (id: string, project: string) => void) {
  const prepared = new Map<string, TermSpec>();
  const running = new Map<string, IPty>();
  const projectOf = new Map<string, string>(); // project whose tab runs the terminal, for the status bar
  const titleOf = new Map<string, string>();
  const output = new Map<string, { tail: ReturnType<typeof createTail>; batch: ReturnType<typeof createBatcher>; flow: ReturnType<typeof createFlowControl> }>(); // the end of each running terminal's output, the output not yet sent, and its backpressure
  let next = 0;
  // Ids differ between sessions: a run started before Moki was restarted never takes a new terminal for its own.
  const session = Date.now().toString(36);

  const forget = (id: string): void => { projectOf.delete(id); titleOf.delete(id); output.get(id)?.batch.cancel(); output.get(id)?.flow.dispose(); output.delete(id); };
  const kill = (id: string): void => {
    prepared.delete(id);
    forget(id);
    const proc = running.get(id);
    running.delete(id);
    try { proc?.kill(); } catch { /* already gone */ }
  };

  return {
    available: (): boolean => Boolean(loadPty()),

    prepare(spec: TermSpec): string {
      const id = `t${session}-${++next}`;
      prepared.set(id, spec);
      titleOf.set(id, spec.title ?? 'Terminal');
      return id;
    },

    // Starts a prepared terminal with the size of its tab. Returns an error message or ''. A running one is left as it is (its tab came back: attach).
    start(id: string, cols: number, rows: number, project = ''): string {
      if (running.has(id)) return '';
      const spec = prepared.get(id);
      const p = loadPty();
      if (!spec || !p) return 'This terminal can no longer be started.';
      prepared.delete(id);
      try {
        const proc = p.spawn(spec.file, spec.args, { name: 'xterm-256color', cols, rows, cwd: spec.cwd, env: spec.env ?? process.env });
        running.set(id, proc);
        projectOf.set(id, project);
        // The window confirms what it drew (ack): too much unconfirmed output pauses the process so the window's queue cannot grow without end.
        const flow = createFlowControl({ high: FLOW_HIGH, low: FLOW_LOW, pause: () => proc.pause(), resume: () => proc.resume() });
        const stream = { tail: createTail(KEEP), batch: createBatcher((data) => { send('qa:term-data', id, data); flow.sent(data.length); }, BATCH_MS), flow };
        output.set(id, stream);
        proc.onData((data) => { stream.tail.push(data); stream.batch.add(data); });
        proc.onExit(({ exitCode }) => {
          stream.batch.flush(); // the last output reaches the window before the end
          if (running.get(id) === proc) { running.delete(id); forget(id); }
          send('qa:term-exit', id, exitCode);
          onExit?.(id, project); // closed from its tab too: the project it ran for, kept here
        });
        return '';
      } catch (e) {
        return `Could not start ${spec.file}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    write: (id: string, data: string): void => { running.get(id)?.write(data); },
    alive: (id: string): boolean => prepared.has(id) || running.has(id), // its tab exists in this session (started or about to)
    resize: (id: string, cols: number, rows: number): void => { try { running.get(id)?.resize(cols, rows); } catch { /* exited */ } },
    kill,
    list: (): { id: string; pid: number; project: string; title: string }[] => [...running].map(([id, proc]) => ({ id, pid: proc.pid, project: projectOf.get(id) ?? '', title: titleOf.get(id) ?? 'Terminal' })),
    // What a running terminal printed (its last part), for a tab drawn again; null when it is not running.
    // Output waiting to be sent goes first, so it reaches the tab before this answer (which already contains it) and is not drawn twice.
    attach: (id: string): string | null => {
      if (!running.has(id)) return null;
      output.get(id)?.batch.flush();
      output.get(id)?.flow.reset(); // a window that attaches counts from zero (what it did not confirm before, a reload for one, is lost)
      return output.get(id)?.tail.text() ?? '';
    },
    ack: (id: string, n: number): void => { output.get(id)?.flow.acked(n); },
    // Its tab left the screen: nobody draws the output now, so it must not wait for confirmations.
    detach: (id: string): void => { output.get(id)?.flow.release(); },
    killAll: (): void => { for (const id of [...prepared.keys(), ...running.keys()]) kill(id); },
  };
}

export type Terminals = ReturnType<typeof createTerminals>;
