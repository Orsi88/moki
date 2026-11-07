// Parses Word and spreadsheet files on a worker thread, so a 30 MB file does not freeze the main
// process (terminals, IPC, windows). One worker, created on first use, reused, ended after it has
// been idle for a while (a worker holds its own V8 heap). Requests go one at a time, so the time
// limit counts from when a file is actually being parsed.
//
// A parse error in the file (a corrupt .docx) is the file's, and is thrown as it is. Anything wrong
// with the worker itself (cannot start, crashes, no answer in time, a malformed message) ends the
// worker and parses that file inline instead; after FAILURES_LIMIT in a row the worker is not tried again.

import { Worker } from 'node:worker_threads';
import { parseOffice, type OfficeKind, type OfficeParsed } from './parse-office.ts';

export interface ParseClient {
  parse: (kind: OfficeKind, data: Uint8Array) => Promise<OfficeParsed>;
  close: () => void; // ends the worker now; the next parse starts a new one
  alive: () => boolean;
}

export interface ParseOptions {
  workerPath: string | URL; // the bundled parse-worker.mjs (a real file on disk, unpacked from app.asar)
  idleMs?: number;
  timeoutMs?: number;
  inline?: (kind: OfficeKind, data: Uint8Array) => OfficeParsed;
  spawn?: (path: string | URL) => Worker; // tests
}

const FAILURES_LIMIT = 3;

class WorkerFailure extends Error {}

export function createParseClient({ workerPath, idleMs = 30_000, timeoutMs = 30_000, inline = parseOffice, spawn = (p) => new Worker(p) }: ParseOptions): ParseClient {
  let worker: Worker | null = null;
  let idle: NodeJS.Timeout | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let failures = 0;
  let seq = 0;

  const stop = () => {
    clearTimeout(idle);
    const w = worker;
    worker = null;
    if (!w) return;
    w.removeAllListeners();
    w.on('error', () => {}); // an 'error' with no listener would throw in the main process
    void w.terminate();
  };

  const start = () => {
    const w = spawn(workerPath);
    w.on('error', () => {}); // while nobody waits for it, a crash only drops the worker
    w.on('exit', () => { if (worker === w) worker = null; });
    w.unref(); // an idle worker must not keep the app from quitting
    return w;
  };

  const viaWorker = (kind: OfficeKind, data: Uint8Array) => new Promise<OfficeParsed>((resolve, reject) => {
    clearTimeout(idle);
    let w: Worker;
    try { w = worker ??= start(); } catch (e) { return reject(new WorkerFailure(String(e))); }
    const id = ++seq;
    const end = (action: () => void) => { clearTimeout(timer); w.off('message', onMessage); w.off('error', onFailure); w.off('exit', onFailure); action(); };
    const broken = (why: string) => { stop(); end(() => reject(new WorkerFailure(why))); };
    const timer = setTimeout(() => broken('timeout'), timeoutMs);
    const onFailure = () => broken('worker failed');
    const onMessage = (m: unknown) => {
      const r = m as { id?: unknown; result?: OfficeParsed; error?: unknown } | null;
      if (!r || r.id !== id) return broken('invalid message');
      if (typeof r.error === 'string') return end(() => reject(new Error(r.error as string)));
      if (!r.result || (r.result.kind !== 'docx' && r.result.kind !== 'xlsx')) return broken('invalid message');
      const result = r.result;
      end(() => resolve(result));
    };
    w.on('message', onMessage);
    w.on('error', onFailure);
    w.on('exit', onFailure);
    try { w.postMessage({ id, kind, data }); } catch (e) { broken(String(e)); }
  });

  const run = async (kind: OfficeKind, data: Uint8Array): Promise<OfficeParsed> => {
    if (failures >= FAILURES_LIMIT) return inline(kind, data);
    try {
      const r = await viaWorker(kind, data);
      failures = 0;
      return r;
    } catch (e) {
      if (!(e instanceof WorkerFailure)) throw e;
      failures++;
      return inline(kind, data);
    } finally {
      if (worker) { idle = setTimeout(stop, idleMs); idle.unref(); }
    }
  };

  return {
    parse: (kind, data) => {
      const p = queue.then(() => run(kind, data));
      queue = p.catch(() => {});
      return p;
    },
    close: stop,
    alive: () => worker !== null,
  };
}
