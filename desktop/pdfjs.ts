// pdf.js for the main process, with its worker module on this thread (no worker file to load).
// Loaded only when a PDF is read (desktop/pdf-local.ts, desktop/search.ts): pdf.js and its worker
// are most of the main bundle and take ~200 ms and ~20 MB to load, so the app does not pay for
// them at startup (scripts/build-desktop.mjs splits them into their own chunk).

import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

export { getDocument, type PDFPageProxy, type PageViewport } from 'pdfjs-dist/legacy/build/pdf.mjs';
