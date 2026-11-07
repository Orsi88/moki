import { forwardRef, useEffect, useImperativeHandle, useRef, type ComponentPropsWithoutRef } from 'react';
import { lazyHeavy } from '../lazy-module';
import { t } from '../i18n';
import type { TipTapEditor, TipTapHandle } from './TipTapEditor';
import { useLoaded } from './useLoaded';

// TipTap (and its extensions) is loaded when an editor is first shown; see lazy-module.ts for the trade-off.
const tiptap = lazyHeavy(() => import('./TipTapEditor'));
export const warmTipTap = () => tiptap.warm();

// Same props and the same imperative handle as TipTapEditor. Until the editor exists the placeholder takes its space
// (the wrapper and the ProseMirror min-height), and what the handle is asked meanwhile (insert images, a command) runs
// as soon as the editor is there, so nothing is dropped. There is nothing to flush before it loads: no edit exists yet.
export const LazyTipTap = forwardRef<TipTapHandle, ComponentPropsWithoutRef<typeof TipTapEditor>>(function LazyTipTap(props, ref) {
  const { mod, failed, retry } = useLoaded(tiptap);
  const inner = useRef<TipTapHandle>(null);
  const queued = useRef<((handle: TipTapHandle) => void)[]>([]);
  useImperativeHandle(ref, () => {
    const run = (job: (handle: TipTapHandle) => void) => { if (inner.current) job(inner.current); else queued.current.push(job); };
    return {
      addImages: (files) => run((h) => h.addImages(files)),
      codeBlock: () => run((h) => h.codeBlock()),
      command: (name) => run((h) => h.command(name)),
    };
  }, []);
  useEffect(() => {
    const handle = inner.current;
    if (mod && handle) for (const job of queued.current.splice(0)) job(handle);
  }, [mod]);

  if (mod) return <mod.TipTapEditor ref={inner} {...props} />;
  if (failed) {
    return (
      <div className="tiptap-wrap">
        <p className="notice-bar">{t('Something went wrong')} <button type="button" className="btn btn-sm" onClick={retry}>{t('Try again')}</button></p>
      </div>
    );
  }
  return <div className="tiptap-wrap"><div className="ProseMirror" /></div>;
});
