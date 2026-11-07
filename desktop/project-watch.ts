// Watches a project folder without fs.watch({ recursive: true }). On Linux that
// recursive watch runs on the main event loop and froze the app on a large tree.
// One non-recursive watcher per folder, with a depth cap, a folder cap and names
// to skip. A burst of changes calls back once.

import { readdirSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

export interface WatchOptions {
  ignore?: string[];
  maxDepth?: number;
  maxDirs?: number;
  /** Quiet time before a burst is reported (default 400 ms). */
  burstMs?: number;
  /** Longest a burst may postpone the report while changes keep coming (default 2 s). */
  maxWaitMs?: number;
}

const BURST_MS = 400;
const MAX_WAIT_MS = 2000;

export function watchProject(root: string, onChange: () => void, options: WatchOptions = {}): () => void {
  const ignore = new Set(options.ignore ?? []);
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const maxDirs = options.maxDirs ?? Number.POSITIVE_INFINITY;
  const burstMs = options.burstMs ?? BURST_MS;
  const maxWaitMs = options.maxWaitMs ?? MAX_WAIT_MS;
  const watchers = new Map<string, FSWatcher>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let burstStart = 0;
  let stopped = false;

  // Debounce with a ceiling: continuous writes still report every maxWaitMs.
  const fire = () => {
    if (stopped) return;
    const now = Date.now();
    if (timer) clearTimeout(timer); else burstStart = now;
    const wait = Math.min(burstMs, Math.max(0, burstStart + maxWaitMs - now));
    timer = setTimeout(() => { timer = null; if (!stopped) onChange(); }, wait);
  };

  const scan = (dir: string, depth: number) => {
    if (stopped || depth >= maxDepth || watchers.size >= maxDirs) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    // A Dirent of a symlink is never a directory, so links are not followed.
    for (const entry of entries) {
      if (!entry.isDirectory() || ignore.has(entry.name)) continue;
      arm(join(dir, entry.name), depth + 1);
    }
  };

  const arm = (dir: string, depth: number) => {
    if (stopped || depth > maxDepth || watchers.has(dir) || watchers.size >= maxDirs) return;
    let opened: FSWatcher;
    try {
      // Only a rename (create, delete, move) can add a folder; a change just reports.
      opened = watch(dir, (eventType) => { if (eventType === 'rename') scan(dir, depth); fire(); });
    } catch (e) {
      if (watchers.size === 0) throw e;
      return;
    }
    watchers.set(dir, opened);
    scan(dir, depth);
  };

  arm(root, 0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    for (const opened of watchers.values()) opened.close();
    watchers.clear();
  };
}
