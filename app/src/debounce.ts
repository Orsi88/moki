// A trailing debounce that never loses its last call: `flush` runs a pending call at once (before anything that reads
// the result "now": save, close, blur, unmount), `cancel` drops it. Pure: no React, so it is tested with fake timers.

export interface Debouncer { call: () => void; flush: () => void; cancel: () => void }

export function createDebouncer(run: () => void, ms: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  return {
    call: () => { cancel(); timer = setTimeout(() => { timer = undefined; run(); }, ms); },
    flush: () => { if (timer === undefined) return; cancel(); run(); },
    cancel,
  };
}

// The editors with a text not yet sent to its owner. The owner's own actions (save, close a tab, leave the project)
// call flushEdits() first, so what they read is what is on screen.
const flushers = new Set<() => void>();
export const onFlushEdits = (flush: () => void): (() => void) => { flushers.add(flush); return () => { flushers.delete(flush); }; };
export const flushEdits = () => { for (const flush of [...flushers]) flush(); };
