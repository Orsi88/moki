// The heavy parse of a Word or spreadsheet file for the preview, in one place: the worker
// (desktop/parse-worker.ts) runs it off the main process, and desktop/parse-pool.ts falls back
// to it inline when the worker cannot be used. Pure: bytes in, plain structured data out.
// A sheet is cut to the rows and columns the app shows here, so the worker sends back only that.

import { docxToMarkdown } from '../scripts/lib/docx.ts';
import { markdownToHtml } from '../scripts/lib/markdown.mjs';
import { xlsxSheets } from '../scripts/xlsx.mjs';

export type OfficeKind = 'docx' | 'xlsx';
// sheets: the service's Sheet[] (kept loose here so this module does not depend on the service).
export type OfficeParsed = { kind: 'docx'; html: string } | { kind: 'xlsx'; sheets: unknown[] };

const SHEET_ROWS = 2000; // rows and columns per sheet shown in the app; the rest only in the spreadsheet program
const SHEET_COLS = 200;

interface RawSheet {
  rows: unknown[][]; merges: number[][]; widths: number[]; hiddenRows: number[]; hiddenCols: number[];
  align: object;
}

// Everything is cut to the rows and columns shown.
function cutSheet(s: RawSheet) {
  const shown = Math.min(s.rows.length, SHEET_ROWS);
  const inside = (r: number, c: number) => r < shown && c < SHEET_COLS;
  return {
    ...s,
    rows: s.rows.slice(0, SHEET_ROWS).map((r) => r.slice(0, SHEET_COLS)),
    truncated: s.rows.length > SHEET_ROWS || s.rows.some((r) => r.length > SHEET_COLS),
    merges: s.merges.filter(([r, c]) => inside(r, c)).map(([r, c, r2, c2]) => [r, c, Math.min(r2, shown - 1), Math.min(c2, SHEET_COLS - 1)]),
    widths: s.widths.slice(0, SHEET_COLS),
    hiddenRows: s.hiddenRows.filter((r) => r < shown),
    hiddenCols: s.hiddenCols.filter((c) => c < SHEET_COLS),
    align: Object.fromEntries(Object.entries(s.align).filter(([key]) => inside(...(key.split(':').map(Number) as [number, number])))),
  };
}

export function parseOffice(kind: OfficeKind, data: Uint8Array): OfficeParsed {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (kind === 'docx') return { kind, html: markdownToHtml(docxToMarkdown(buffer, { preview: true })) };
  if (kind === 'xlsx') return { kind, sheets: (xlsxSheets(buffer, { display: true }) as RawSheet[]).map(cutSheet) };
  throw new Error('Unknown file kind.');
}
