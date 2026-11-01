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
  const output = new Map<string, string>(); // the end of each running terminal's output
  let next = 0;
  // Ids differ between sessions: a run started before Moki was restarted never takes a new terminal for its own.
  const session = Date.now().toString(36);

  const forget = (id: string): void => { projectOf.delete(id); titleOf.delete(id); output.delete(id); };
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
        output.set(id, '');
        proc.onData((data) => {
          const kept = (output.get(id) ?? '') + data;
          output.set(id, kept.length > KEEP ? kept.slice(-KEEP) : kept);
          send('qa:term-data', id, data);
        });
        proc.onExit(({ exitCode }) => {
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
    attach: (id: string): string | null => (running.has(id) ? output.get(id) ?? '' : null),
    killAll: (): void => { for (const id of [...prepared.keys(), ...running.keys()]) kill(id); },
  };
}

export type Terminals = ReturnType<typeof createTerminals>;
