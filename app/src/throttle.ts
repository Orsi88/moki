// At most one call per `ms`: the first goes out at once, the ones inside the window collapse into a single call at its end.

export function throttle(fn: () => void, ms: number): { (): void; cancel: () => void } {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => { timer = undefined; last = Date.now(); fn(); };
  const call = () => {
    if (timer) return;
    const wait = last + ms - Date.now();
    if (wait <= 0) run(); else timer = setTimeout(run, wait);
  };
  call.cancel = () => { if (timer) clearTimeout(timer); timer = undefined; };
  return call;
}
