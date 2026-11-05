// Watches a project folder without fs.watch({ recursive: true }). On Linux that
// recursive watch runs on the main event loop and froze the app on a large tree.
// One non-recursive watcher per folder, with a depth cap, a folder cap and names
// to skip. A burst of changes calls back once.

import { lstatSync, readdirSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

export interface WatchOptions {
  ignore?: string[];
  maxDepth?: number;
  maxDirs?: number;
}

const BURST_MS = 400;

export function watchProject(root: string, onChange: () => void, options: WatchOptions = {}): () => void {
  const ignore = new Set(options.ignore ?? []);
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const maxDirs = options.maxDirs ?? Number.POSITIVE_INFINITY;
  const watchers = new Map<string, FSWatcher>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const fire = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; if (!stopped) onChange(); }, BURST_MS);
  };

  const scan = (dir: string, depth: number) => {
    if (stopped || depth >= maxDepth || watchers.size >= maxDirs) return;
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (ignore.has(name)) continue;
      const child = join(dir, name);
      let st;
      try { st = lstatSync(child); } catch { continue; }
      if (st.isSymbolicLink() || !st.isDirectory()) continue;
      arm(child, depth + 1);
    }
  };

  const arm = (dir: string, depth: number) => {
    if (stopped || depth > maxDepth || watchers.has(dir) || watchers.size >= maxDirs) return;
    let opened: FSWatcher;
    try {
      opened = watch(dir, () => { scan(dir, depth); fire(); });
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
