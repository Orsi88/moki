// PDF comments and page edits through PdfCraft (pdfcraft-cli), the only writer of PDF bytes in the app.
// One `run --script` per action (open, change, save, list), confined to the project folder
// by --root on top of resolveInside. The script is a temporary file: the CLI does not read
// it from stdin. Arguments go as an array, never through a shell; the user's text only
// travels inside the script's JSON.

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { which } from '../scripts/lib/core.ts';

export interface PdfStep { tool: string; args: Record<string, unknown> }
export interface PdfComment { id: string; page: number; type: string; author: string | null; contents: string | null; color: string | null; replies: PdfComment[] }
export interface PdfMark { page: number; quads: number[][] } // quads: 8 numbers each, points from the page's top-left
export type PdfChange =
  | { op: 'highlight'; page: number; find: string; all: boolean; contents?: string; color: string }
  | { op: 'highlight'; marks: PdfMark[]; contents?: string; color: string }
  | { op: 'reply'; id: string; text: string }
  | { op: 'edit'; id: string; contents: string }
  | { op: 'delete'; id: string }
  | { op: 'rotate-pages'; pages: number[]; degrees: 90 | 180 | 270 }
  | { op: 'delete-pages'; pages: number[] }
  | { op: 'move-page'; page: number; to: number } // one page: page_move with several gives surprising orders
  | { op: 'insert-blank'; at: number }
  | { op: 'set-info'; title: string; author: string };

// Changes to the document itself (not its comments): never saved over the file they came from.
export const isPageEdit = (c: PdfChange): boolean => ['rotate-pages', 'delete-pages', 'move-page', 'insert-blank', 'set-info'].includes(c.op);
export type PdfRunner = (steps: PdfStep[], root: string) => Promise<unknown[]>; // each step's result

export const PDF_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'red', 'purple'];

// open → change → save (in place, or to saveAs) → list; without a change: open → list. Pure.
export function pdfScript(file: string, change: PdfChange | null, author: string, saveAs?: string): PdfStep[] {
  const doc = 1;
  const steps: PdfStep[] = [{ tool: 'doc_open', args: { path: file } }];
  if (change?.op === 'highlight') {
    const base = { doc, type: 'highlight', color: change.color, author, ...(change.contents ? { contents: change.contents } : {}) };
    if ('marks' in change) for (const m of change.marks) steps.push({ tool: 'comment_add', args: { ...base, page: m.page, quads: m.quads } });
    else steps.push({ tool: 'comment_add', args: { ...base, page: change.page, find: change.find, all: change.all } });
  } else if (change?.op === 'reply') steps.push({ tool: 'comment_reply', args: { doc, id: change.id, text: change.text, author } });
  else if (change?.op === 'edit') steps.push({ tool: 'comment_edit', args: { doc, id: change.id, contents: change.contents } });
  else if (change?.op === 'delete') steps.push({ tool: 'comment_delete', args: { doc, id: change.id } });
  else if (change?.op === 'rotate-pages') steps.push({ tool: 'page_rotate', args: { doc, pages: change.pages, degrees: change.degrees } });
  else if (change?.op === 'delete-pages') steps.push({ tool: 'page_delete', args: { doc, pages: change.pages } });
  else if (change?.op === 'move-page') steps.push({ tool: 'page_move', args: { doc, pages: [change.page], to: change.to } });
  else if (change?.op === 'insert-blank') steps.push({ tool: 'page_insert_blank', args: { doc, at: change.at } });
  else if (change?.op === 'set-info') steps.push(
    { tool: 'doc_set_info', args: { doc, key: 'Title', value: change.title } },
    { tool: 'doc_set_info', args: { doc, key: 'Author', value: change.author } });
  if (change) steps.push({ tool: 'doc_save', args: saveAs ? { doc, path: saveAs } : { doc } });
  steps.push({ tool: 'comment_list', args: { doc } });
  return steps;
}

const text = (v: unknown, what: string, min: number, max: number): string => {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) throw new Error(`Invalid ${what}.`);
  return v;
};
const page = (v: unknown): number => {
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 100000) throw new Error('Invalid page.');
  return v as number;
};

const pages = (v: unknown): number[] => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 1000) throw new Error('Invalid pages.');
  const list = v.map(page);
  if (new Set(list).size !== list.length) throw new Error('Invalid pages.');
  return list;
};

// Everything the UI sends is unknown until checked here. Page ranges are checked by PdfCraft (the
// main process does not count pages); its error reaches the UI as is.
export function parsePdfChange(raw: unknown): PdfChange {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const contents = r.contents == null || r.contents === '' ? undefined : text(r.contents, 'comment', 0, 4000);
  switch (r.op) {
    case 'highlight': {
      const color = PDF_COLORS.includes(r.color as string) ? r.color as string : 'yellow';
      if (r.marks === undefined) return { op: 'highlight', page: page(r.page), find: text(r.find, 'text', 1, 500), all: r.all === true, contents, color };
      if (!Array.isArray(r.marks) || r.marks.length < 1 || r.marks.length > 50) throw new Error('Invalid selection.');
      const marks = r.marks.map((m: unknown) => {
        const { page: p, quads } = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
        if (!Array.isArray(quads) || quads.length < 1 || quads.length > 500
          || !quads.every((q) => Array.isArray(q) && q.length === 8 && q.every((n) => typeof n === 'number' && Number.isFinite(n)))) throw new Error('Invalid selection.');
        return { page: page(p), quads: quads as number[][] };
      });
      return { op: 'highlight', marks, contents, color };
    }
    case 'reply': return { op: 'reply', id: text(r.id, 'comment id', 1, 200), text: text(r.text, 'reply', 1, 4000) };
    case 'edit': return { op: 'edit', id: text(r.id, 'comment id', 1, 200), contents: text(r.contents, 'comment', 0, 4000) };
    case 'delete': return { op: 'delete', id: text(r.id, 'comment id', 1, 200) };
    case 'rotate-pages': {
      if (r.degrees !== 90 && r.degrees !== 180 && r.degrees !== 270) throw new Error('Invalid rotation.');
      return { op: 'rotate-pages', pages: pages(r.pages), degrees: r.degrees };
    }
    case 'delete-pages': return { op: 'delete-pages', pages: pages(r.pages) };
    case 'move-page': return { op: 'move-page', page: page(r.page), to: page(r.to) };
    case 'insert-blank': return { op: 'insert-blank', at: page(r.at) };
    case 'set-info': return { op: 'set-info', title: text(r.title, 'title', 0, 1000), author: text(r.author, 'author', 0, 1000) };
    default: throw new Error('Unknown change.');
  }
}

// comment_list output → PdfComment[], unknown fields dropped. Pure.
export function toComments(listResult: unknown): PdfComment[] {
  const items = Array.isArray(listResult) ? listResult : (listResult as { comments?: unknown })?.comments;
  if (!Array.isArray(items)) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return items.filter((c) => c && typeof c === 'object' && typeof c.id === 'string').map((c) => ({
    id: c.id, page: Number(c.page) || 0, type: str(c.type) ?? '', author: str(c.author), contents: str(c.contents), color: str(c.color),
    replies: toComments(c.replies),
  }));
}

// Where pdfcraft-cli is when it is not on PATH. Windows: beside pdfcraft.exe in the install folder
// (ArtCraft Launcher's, or the PdfCraft MSI's, for one user or for everyone), which the MSI does not add
// to PATH. macOS and Linux: an app started from the Finder or the menu gets a short PATH, without the
// folders where the CLI is usually put (the macOS DMG has no CLI; it is a separate zip). Pure.
export function pdfcraftCandidates(platform: string, env: Record<string, string | undefined>, home: string): string[] {
  if (platform === 'win32') {
    const bases = [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']].filter((b): b is string => Boolean(b));
    return bases.flatMap((b) => [join(b, 'ArtCraft', 'PdfCraft', 'pdfcraft-cli.exe'), join(b, 'PdfCraft', 'pdfcraft-cli.exe')]);
  }
  return ['/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'), join(home, 'bin')].map((d) => join(d, 'pdfcraft-cli'));
}

const findPdfcraft = (): string | null => which('pdfcraft-cli') ?? pdfcraftCandidates(process.platform, process.env, homedir()).find((f) => existsSync(f)) ?? null;

export const pdfcraftAvailable = (): boolean => Boolean(findPdfcraft());

export const runPdfcraft: PdfRunner = (steps, root) => new Promise((done, fail) => {
  const bin = findPdfcraft();
  if (!bin) { fail(new Error('PdfCraft (pdfcraft-cli) is not installed.')); return; }
  const dir = mkdtempSync(join(tmpdir(), 'moki-pdf-'));
  const script = join(dir, 'steps.json');
  writeFileSync(script, JSON.stringify(steps), { mode: 0o600 });
  execFile(bin, ['run', '--script', script, '--root', root, '--report'], { cwd: root, timeout: 60_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
    rmSync(dir, { recursive: true, force: true });
    let report: { ok?: boolean; steps?: { status: string; error?: string; result?: unknown }[] } | null = null;
    try { report = JSON.parse(stdout); } catch { /* no report: the CLI stopped before running a step (reason on stderr) */ }
    if (report?.ok && !err) { done((report.steps ?? []).map((s) => (Array.isArray(s.result) ? s.result[0] : s.result))); return; }
    const failed = report?.steps?.find((s) => s.status !== 'ok')?.error;
    fail(new Error((failed ?? (stderr.trim() || err?.message || 'PdfCraft failed.')).replace(/^step \d+ \([a-z_]+\): /, '')));
  });
});
