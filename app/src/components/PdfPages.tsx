import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PDFWorker, TextLayer, getDocument, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';
import { selectionMarks, type DrawnPage } from '../pdf-quads';
import type { PdfMark } from '../api';

const CSS_UNITS = 96 / 72; // pdf.js: one PDF point at zoom 1 is drawn as 96/72 CSS pixels

// One worker for the whole app, bundled into the page and started from a blob: URL: nothing is
// fetched from disk or the network (connect-src stays 'none'). It is passed to getDocument so
// that destroying a document never destroys it: pdf.js destroys a worker it created itself, and
// a new document opened meanwhile (after a save) would throw "the worker is being destroyed".
let worker: PDFWorker | null = null;

// A page is drawn (canvas and selectable text) only once it comes near the screen.
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
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
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
      const ratio = window.devicePixelRatio || 1;
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
export function PdfPages({ data, zoom, onSelection, onError, onLoad, pageTools }: {
  data: string; zoom: number; onSelection: (marks: PdfMark[] | null) => void; onError: () => void;
  onLoad?: (info: { pages: number; title: string; author: string }) => void; pageTools?: (n: number, total: number) => ReactNode;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (!worker) worker = PDFWorker.create({ port: new PdfWorker() });
    } catch { onError(); return; }
    let gone = false;
    const task = getDocument({ data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), worker });
    task.promise.then((d) => {
      if (gone) return;
      setDoc(d);
      void d.getMetadata().then(({ info }) => {
        const i = info as { Title?: unknown; Author?: unknown };
        if (!gone) onLoad?.({ pages: d.numPages, title: typeof i.Title === 'string' ? i.Title : '', author: typeof i.Author === 'string' ? i.Author : '' });
      }, () => { if (!gone) onLoad?.({ pages: d.numPages, title: '', author: '' }); });
    }, () => { if (!gone) onError(); });
    return () => { gone = true; setDoc(null); void task.destroy(); };
  }, [data, onError, onLoad]);

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
      {doc && Array.from({ length: doc.numPages }, (_, i) => (
        <div key={i} className="pdf-page-wrap">
          <Page doc={doc} n={i + 1} scale={zoom} />
          {pageTools?.(i + 1, doc.numPages)}
        </div>
      ))}
    </div>
  );
}
