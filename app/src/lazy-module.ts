// Heavy modules (pdf.js with its inline worker, TipTap) are loaded the first time something needs them, not with the
// workspace: until a PDF tab or a visual note editor is shown, their code is never evaluated, so it holds no memory.
// The trade-off is honest: the first PDF/note opened pays the evaluation of its module (the saving is the same cost
// moved to that moment); every later one is instant, the module stays cached. Nothing here preloads in idle time,
// that would evaluate the modules anyway and give back no memory. The cheap shortcut is `warm()`: a caller that
// knows an open is about to happen (pointer over the "edit" button) starts the import a moment early.
// Pure (no React): tested by node --test. The hook that renders from it is components/useLoaded.ts.

// Decision to confirm by measurement: false starts every import() as soon as the module that declares it is evaluated
// (the workspace), which approaches loading them statically while keeping the same code path.
export const LAZY_HEAVY_MODULES = true;

export interface Lazy<T> {
  load: () => Promise<T>;
  warm: () => void; // starts the import, ignores a failure (a later load() retries)
  peek: () => T | undefined; // the module when it has already loaded, so a remount renders without a placeholder
}

// One import() shared by every caller; a rejection forgets it, so the next load() tries again (a failed fetch is not permanent).
export function loadOnce<T>(importer: () => Promise<T>): Lazy<T> {
  let pending: Promise<T> | undefined;
  let loaded: { module: T } | undefined;
  const load = () => {
    if (!pending) {
      const attempt: Promise<T> = importer().then(
        (module) => { loaded = { module }; return module; },
        (error: unknown) => { if (pending === attempt) pending = undefined; throw error; },
      );
      pending = attempt;
    }
    return pending;
  };
  return { load, warm: () => { load().catch(() => {}); }, peek: () => loaded?.module };
}

export function lazyHeavy<T>(importer: () => Promise<T>, eager = !LAZY_HEAVY_MODULES): Lazy<T> {
  const lazy = loadOnce(importer);
  if (eager) lazy.warm();
  return lazy;
}
