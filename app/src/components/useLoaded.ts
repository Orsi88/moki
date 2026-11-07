import { useCallback, useEffect, useState } from 'react';
import type { Lazy } from '../lazy-module';

// The module of a Lazy once it has loaded (undefined until then), and `failed` when its import() was rejected:
// the caller shows a message or a fallback, never an empty screen. `retry` tries the import again.
export function useLoaded<T>(lazy: Lazy<T>): { mod: T | undefined; failed: boolean; retry: () => void } {
  const [mod, setMod] = useState<T | undefined>(() => lazy.peek());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (mod) return undefined;
    let gone = false;
    lazy.load().then((m) => { if (!gone) { setMod(m); setFailed(false); } }, () => { if (!gone) setFailed(true); });
    return () => { gone = true; };
  }, [lazy, mod, attempt]);
  const retry = useCallback(() => { setFailed(false); setAttempt((n) => n + 1); }, []);
  return { mod, failed, retry };
}
