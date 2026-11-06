// Code loaded on demand (a screen, pdf.js, xterm.js) without React.lazy. React.lazy suspends on the
// first render even when the code is already there, and React 19 then keeps the Suspense fallback on
// screen ~300 ms more before showing what was loaded. Here the promise is marked fulfilled once loaded,
// so it is read at once: with use() (no suspending when it is fulfilled) or with useLoaded (no Suspense).

import { useEffect, useState } from 'react';

export type Loading<T> = Promise<T> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: T };

// load runs once, on the first call; every call returns the same promise.
export function loader<T>(load: () => Promise<T>): () => Loading<T> {
  let loading: Loading<T> | null = null;
  return () => loading ??= load().then((value) => { Object.assign(loading!, { status: 'fulfilled', value }); return value; });
}

// The loaded module, or null while it loads (the component renders again when it is there).
export function useLoaded<T>(get: () => Loading<T>): T | null {
  const loading = get();
  const [, rerender] = useState(0);
  useEffect(() => {
    if (loading.status === 'fulfilled') return;
    let live = true;
    loading.then(() => { if (live) rerender((n) => n + 1); }, () => { /* a file of the app that cannot load: it stays as loading */ });
    return () => { live = false; };
  }, [loading]);
  return loading.status === 'fulfilled' ? loading.value! : null;
}
