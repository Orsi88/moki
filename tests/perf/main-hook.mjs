// Opt-in probe of the Electron main process for the memory and load battery (QA_PERF=1).
// The harness runs these three functions inside the main process with Playwright's
// app.evaluate(fn): Playwright sends each function's source text, so each one must be
// self-contained (no imports, no outer variables). Nothing in desktop/ knows about this file.
//
// What it measures, from the moment it is installed (the app and its first window are already up):
//   - event loop lag of the main process (max), with a 20 ms timer;
//   - calls of the single IPC channel 'qa:call' per method, the size of what they return
//     (characters of strings and bytes of buffers, summed over the result; it does not serialize
//     anything, so it adds almost no CPU) and the readFile calls per path;
//   - calls of child_process.execFileSync.
// Limits: it reads the handler map Electron keeps (ipcMain._invokeHandlers, private, like S4),
// so another Electron version may hide it (then `ipc` is false and the harness says so); other
// channels (terminals, watch, notes) are not counted; what ran before the install, such as the
// shell lookup at start-up, is not counted; execFileSync is seen only by code that reads it after
// the install (live ESM binding, refreshed with syncBuiltinESMExports).

export function installHook({ ipcMain }) {
  if (globalThis.__mokiPerf) return { ipc: globalThis.__mokiPerf.ipc };
  const st = { calls: {}, reads: {}, bytes: 0, total: 0, exec: 0, lag: 0, ipc: false };
  globalThis.__mokiPerf = st;
  let last = performance.now();
  setInterval(() => { const now = performance.now(); st.lag = Math.max(st.lag, now - last - 20); last = now; }, 20).unref();
  const size = (v, depth = 0) => (v == null ? 0 : typeof v === 'string' ? v.length : ArrayBuffer.isView(v) ? v.byteLength : typeof v === 'object' && depth < 4 ? Object.values(v).reduce((n, x) => n + size(x, depth + 1), 0) : 8);
  const handlers = ipcMain._invokeHandlers;
  const original = handlers?.get('qa:call');
  if (original) {
    st.ipc = true;
    handlers.set('qa:call', async (event, method, args) => {
      st.calls[method] = (st.calls[method] ?? 0) + 1;
      st.total += 1;
      if (method === 'readFile' && Array.isArray(args) && typeof args[1] === 'string') st.reads[args[1]] = (st.reads[args[1]] ?? 0) + 1;
      const result = await original(event, method, args);
      st.bytes += size(result);
      return result;
    });
  }
  const childProcess = process.getBuiltinModule('node:child_process');
  const execFileSync = childProcess.execFileSync;
  childProcess.execFileSync = (...a) => { st.exec += 1; return execFileSync(...a); };
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
  return { ipc: st.ipc };
}

// Zeroes the counters: the window of a measurement starts here.
export function resetHook() {
  const st = globalThis.__mokiPerf;
  if (!st) return false;
  st.calls = {}; st.reads = {}; st.bytes = 0; st.total = 0; st.exec = 0; st.lag = 0;
  return true;
}

export function readHook() {
  const st = globalThis.__mokiPerf;
  return st ? { ipc: st.ipc, calls: { ...st.calls }, reads: { ...st.reads }, bytes: st.bytes, total: st.total, exec: st.exec, lag: st.lag } : null;
}
