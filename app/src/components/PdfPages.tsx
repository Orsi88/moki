import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PDFWorker, TextLayer, getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';
import { selectionMarks, type DrawnPage } from '../pdf-quads';
import type { PdfMark } from '../api';

const CSS_UNITS = 96 / 72; // pdf.js: one PDF point at zoom 1 is drawn as 96/72 CSS pixels

// One worker for the whole app, bundled into the page and started from a blob: URL: no script is fetched
// from disk or the network (connect-src allows only moki-file:, the PDFs). It is passed to getDocument so
// that destroying a document never destroys it: pdf.js destroys a worker it created itself, and
// a new document opened meanwhile (after a save) would throw "the worker is being destroyed".
let worker: PDFWorker | null = null;

// A page is drawn (canvas and selectable text) while it is near the screen, and released when it is far:
// a canvas is ~3.4 MB (x4 on a 2x screen), so a long PDF must not keep them all until the tab closes.
const DRAW_MARGIN = 800; // px around the scroller: a page this close is drawn
const KEEP_MARGIN = 2400; // px: a drawn page beyond this is released (wider than the draw margin, so it does not flicker at the edge)
const MAX_RATIO = 2; // a canvas never above 2x: a 3x screen would cost 2.25x the memory for little sharpness

// The scrolling ancestor: the observers need it as their root, or rootMargin does not reach past its clipping.
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  return null;
}

// Frees what a drawn page holds: the canvas pixels (width 0 releases the backing store) and the text layer.
function release(el: HTMLElement) {
  const canvas = el.querySelector('canvas');
  if (canvas) { canvas.width = 0; canvas.height = 0; }
  el.replaceChildren();
}

function Page({ doc, n, scale }: { doc: PDFDocumentProxy; n: number; scale: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let gone = false;
    doc.getPage(n).then((p) => { const v = p.getViewport({ scale: 1 }); if (!gone) setSize({ w: v.width, h: v.height }); }).catch(() => { /* broken page: stays empty */ });
    return () => { gone = true; };
  }, [doc, n]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = scrollParent(el);
    const near = new IntersectionObserver((es) => { if (es.at(-1)?.isIntersecting) setVisible(true); }, { root, rootMargin: `${DRAW_MARGIN}px` });
    const far = new IntersectionObserver((es) => { if (es.at(-1)?.isIntersecting === false) setVisible(false); }, { root, rootMargin: `${KEEP_MARGIN}px` });
    near.observe(el);
    far.observe(el);
    return () => { near.disconnect(); far.disconnect(); };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    let gone = false;
    let task: RenderTask | null = null;
    let layer: TextLayer | null = null;
    doc.getPage(n).then(async (page) => {
      if (gone) return;
      const viewport = page.getViewport({ scale: scale * CSS_UNITS });
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const text = document.createElement('div');
      text.className = 'textLayer';
      el.replaceChildren(canvas, text);
      task = page.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise;
      if (gone) return;
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      await layer.render();
    }).catch(() => { /* cancelled, or a page pdf.js cannot draw: left blank */ });
    return () => { gone = true; task?.cancel(); layer?.cancel(); };
  }, [doc, n, scale, visible]);

  // Left the keep margin: the render was cancelled above; free the canvas and the text layer, and the page's own caches.
  useEffect(() => {
    const el = ref.current;
    if (visible || !el?.firstChild) return;
    release(el);
    doc.getPage(n).then((p) => { p.cleanup(); }).catch(() => { /* document closed meanwhile */ });
  }, [doc, n, visible]);

  // The tab closes: no canvas outlives its page.
  useEffect(() => {
    const el = ref.current;
    return () => { if (el) release(el); };
  }, []);

  const px = scale * CSS_UNITS;
  return (
    <div ref={ref} className="pdf-page" data-page={n} data-width-pt={size?.w}
      style={{ width: size ? size.w * px : 612 * px, height: size ? size.h * px : 792 * px, ['--total-scale-factor' as string]: px }} />
  );
}

// The pages drawn by pdf.js with a text layer, so a selection can become a highlight.
// onError: pdf.js could not open the file (the caller falls back to Chromium's viewer).
// Quads are in the coordinates of the page as displayed (rotation applied), which is what PdfCraft expects.
// onLoad: page count, title and author once the file is open. pageTools: a bar under each page (Edit mode).
// onDoc: the open document, for searching its text.
// url: the file's moki-file:// URL, read by pdf.js with Range, so the bytes are never held here or sent over the IPC.
// renew: a fresh URL, asked once when the one it has is refused (its grant ended).
export function PdfPages({ url, renew, zoom, onSelection, onError, onLoad, onDoc, pageTools, afterPage }: {
  url: string; renew: () => Promise<string>; zoom: number; onSelection: (marks: PdfMark[] | null) => void; onError: () => void;
  onLoad?: (info: { pages: number; title: string; author: string }) => void; onDoc?: (doc: PDFDocumentProxy | null) => void; pageTools?: (n: number, total: number) => ReactNode; afterPage?: (n: number, total: number) => ReactNode;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let shared: PDFWorker;
    try {
      worker ??= PDFWorker.create({ port: new PdfWorker() });
      shared = worker;
    } catch { onError(); return; }
    let gone = false;
    let task: PDFDocumentLoadingTask | undefined;
    const open = async () => {
      // disableAutoFetch: only the ranges the visible pages need are read, not the whole file in the background.
      const load = (from: string) => { task = getDocument({ url: from, worker: shared, disableAutoFetch: true }); return task.promise; };
      const d = await load(url).catch((e: unknown) => { if (gone) throw e; return renew().then(load); });
      if (gone) return;
      setDoc(d);
      onDoc?.(d);
      void d.getMetadata().then(({ info }) => {
        const i = info as { Title?: unknown; Author?: unknown };
        if (!gone) onLoad?.({ pages: d.numPages, title: typeof i.Title === 'string' ? i.Title : '', author: typeof i.Author === 'string' ? i.Author : '' });
      }, () => { if (!gone) onLoad?.({ pages: d.numPages, title: '', author: '' }); });
    };
    open().catch(() => { if (!gone) onError(); });
    return () => { gone = true; setDoc(null); onDoc?.(null); void task?.destroy(); };
  }, [url, renew, onError, onLoad, onDoc]);

  const onMouseUp = () => {
    const sel = window.getSelection();
    const box = ref.current;
    if (!box || !sel || sel.isCollapsed || !sel.rangeCount || !box.contains(sel.getRangeAt(0).commonAncestorContainer)) { onSelection(null); return; }
    const pages: DrawnPage[] = [...box.querySelectorAll<HTMLElement>('.pdf-page')]
      .filter((el) => Number(el.dataset.widthPt) > 0)
      .map((el) => ({ page: Number(el.dataset.page), box: el.getBoundingClientRect(), widthPt: Number(el.dataset.widthPt) }));
    const marks = selectionMarks([...sel.getRangeAt(0).getClientRects()], pages);
    onSelection(marks.length ? marks : null);
  };

  return (
    <div ref={ref} className="pdf-pages" onMouseUp={onMouseUp}>
      {doc && afterPage?.(0, doc.numPages)}
      {doc && Array.from({ length: doc.numPages }, (_, i) => (
        <div key={i} className="pdf-page-wrap">
          <Page doc={doc} n={i + 1} scale={zoom} />
          {pageTools?.(i + 1, doc.numPages)}
          {afterPage?.(i + 1, doc.numPages)}
        </div>
      ))}
    </div>
  );
}
