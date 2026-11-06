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
const KEEP = 256 * 1024; // characters of output kept per terminal, drawn again when its tab comes back
const FLUSH_MS = 8; // output that arrives together is sent to the window as one message

// The end of a terminal's output: chunks as they came, dropped from the front past KEEP characters.
// An AI tool redraws its screen many times a second; keeping one string would copy all of it on every chunk.
export function outputTail(keep = KEEP) {
  let chunks: string[] = [];
  let size = 0;
  return {
    push(data: string): void {
      chunks.push(data);
      size += data.length;
      while (size - chunks[0].length >= keep) size -= chunks.shift()!.length;
    },
    text(): string {
      const all = chunks.join('');
      chunks = [all]; // read rarely (a tab coming back): joined once, kept joined
      return all.length > keep ? all.slice(-keep) : all;
    },
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
  const output = new Map<string, ReturnType<typeof outputTail>>(); // the end of each running terminal's output
  const pending = new Map<string, string>(); // output not sent to the window yet
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = (): void => {
    timer = null;
    for (const [id, data] of pending) send('qa:term-data', id, data);
    pending.clear();
  };
  const flushOne = (id: string): void => {
    const data = pending.get(id);
    if (data === undefined) return;
    pending.delete(id);
    send('qa:term-data', id, data);
  };
  let next = 0;
  // Ids differ between sessions: a run started before Moki was restarted never takes a new terminal for its own.
  const session = Date.now().toString(36);

  const forget = (id: string): void => { projectOf.delete(id); titleOf.delete(id); output.delete(id); pending.delete(id); };
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
        const tail = outputTail();
        output.set(id, tail);
        proc.onData((data) => {
          tail.push(data);
          pending.set(id, (pending.get(id) ?? '') + data);
          timer ??= setTimeout(flush, FLUSH_MS);
        });
        proc.onExit(({ exitCode }) => {
          flushOne(id); // its last output comes before the exit
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
    // The output not sent yet is already in what is returned, so it is not sent again after.
    attach: (id: string): string | null => {
      if (!running.has(id)) return null;
      pending.delete(id);
      return output.get(id)?.text() ?? '';
    },
    killAll: (): void => { for (const id of [...prepared.keys(), ...running.keys()]) kill(id); },
  };
}

export type Terminals = ReturnType<typeof createTerminals>;
