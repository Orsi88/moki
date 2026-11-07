// Search in the active workspace (the magnifier on the icon rail): projects by
// name and description, and the text files of every project by name and
// content, optionally limited to some tags. The rail search is async so it does
// not block the main process. The expanded search (its own window) also reads
// Word, PDF and spreadsheets, and every file name.

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { IO_LIMIT, fileTags, listProjects, listProjectsAsync, mapLimit, projectSummary, projectSummaryAsync, projectsDir, type ProjectSummary } from '../scripts/lib/core.ts';
import { workspaceDir } from '../scripts/lib/repo.mjs';
import { docxToMarkdown } from '../scripts/lib/docx.ts';
import { xlsxSheets } from '../scripts/xlsx.mjs';

export interface FileHit { project: string; projectName: string; path: string; snippet: string; line: number; tags: string[] }
export interface SearchResult { projects: ProjectSummary[]; files: FileHit[]; truncated: boolean }

const TEXT = new Set(['.md', '.txt', '.json', '.csv', '.log', '.yaml', '.yml', '.xml']);
const SKIP = new Set(['node_modules', '.git', 'backups', 'temporary']); // .extracted/ is kept: the text of Word files
const FILE_LIMIT = 1_000_000; // bytes read per file
const HIT_LIMIT = 200;
const PROJECTS_AT_ONCE = 8;
const READ_BATCH = 16; // files read at once inside a project
const SLICE_MS = 8; // continuous work before the event loop gets a turn

const skipped = (name: string) => SKIP.has(name) || (name.startsWith('.') && name !== '.extracted');

// Gives the event loop a turn (terminals, IPC, windows) after `sliceMs` of continuous work.
export function yielder(sliceMs = SLICE_MS): () => Promise<void> {
  let from = performance.now();
  return async () => {
    if (performance.now() - from < sliceMs) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    from = performance.now();
  };
}

// The first FILE_LIMIT bytes of a file, or null when it is larger: no stat, and a huge file is never loaded whole.
async function readLimited(full: string): Promise<Buffer | null> {
  const handle = await open(full, 'r');
  try {
    const { size } = await handle.stat(); // the buffer fits the file: 20k small files must not take 1 MB each
    if (size > FILE_LIMIT) return null;
    const buffer = Buffer.allocUnsafe(size + 1); // one more byte: a file that grew meanwhile is seen as too large
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead > FILE_LIMIT ? null : buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

function readLimitedSync(full: string): Buffer | null {
  const fd = openSync(full, 'r');
  try {
    const { size } = fstatSync(fd);
    if (size > FILE_LIMIT) return null;
    const buffer = Buffer.allocUnsafe(size + 1);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    return bytesRead > FILE_LIMIT ? null : buffer.subarray(0, bytesRead);
  } finally { closeSync(fd); }
}

// Text files of a folder tree, relative paths in name order (folders and files interleaved).
// A size is read (stat) only for symbolic links (the file size limit of a regular file is applied when it is read). `all` (the expanded search): every
// regular file whatever its type or size, and symbolic links are not followed.
async function walkText(base: string, rel = '', all = false): Promise<string[]> {
  const entries = await readdir(join(base, rel), { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const nested = await mapLimit(entries, IO_LIMIT, async (e): Promise<string[]> => {
    const path = rel ? `${rel}/${e.name}` : e.name;
    if (all) return e.isDirectory() ? (skipped(e.name) ? [] : walkText(base, path, true)) : e.isFile() ? [path] : [];
    let dir = e.isDirectory();
    let size = 0;
    if (e.isSymbolicLink()) {
      try { const st = await stat(join(base, path)); dir = st.isDirectory(); size = st.size; } catch { return []; }
    } else if (!dir && !TEXT.has(extname(e.name).toLowerCase())) return [];
    if (dir) return skipped(e.name) ? [] : walkText(base, path);
    return TEXT.has(extname(e.name).toLowerCase()) && size <= FILE_LIMIT ? [path] : [];
  });
  return nested.flat();
}

async function fileText(full: string, extension: string): Promise<string> {
  const data = readLimitedSync(full);
  if (!data) return '';
  if (TEXT.has(extension)) return data.toString('utf8');
  if (extension === '.docx') return docxToMarkdown(Buffer.from(data));
  if (extension === '.xlsx') return xlsxSheets(Buffer.from(data)).map((sheet: { name: string; rows: unknown[][] }) => `${sheet.name}\n${sheet.rows.map((row) => row.join(' ')).join('\n')}`).join('\n');
  if (extension === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'); // loaded on first PDF only
    const task = getDocument({ data: new Uint8Array(data), useSystemFonts: false, verbosity: 0 });
    const doc = await task.promise;
    try {
      const pages: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const content = await (await doc.getPage(n)).getTextContent();
        pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
      }
      return pages.join('\n');
    } finally { await task.destroy(); }
  }
  return '';
}

export async function searchWorkspaceExpanded(root: string, query: string, tags: string[] = [], project?: string): Promise<SearchResult> {
  const initialWorkspace = workspaceDir(root);
  const prefix = query.trim().match(/^(projeto|project|arquivo|file|conteudo|conteúdo|content):\s*/i);
  const kind = prefix?.[1].toLowerCase() ?? '';
  const q = query.trim().slice(prefix?.[0].length ?? 0).trim().toLowerCase().slice(0, 200);
  const onlyProjects = kind === 'projeto' || kind === 'project';
  const onlyFiles = kind === 'arquivo' || kind === 'file';
  const onlyContent = kind === 'conteudo' || kind === 'conteúdo' || kind === 'content';
  const result: SearchResult = { projects: [], files: [], truncated: false };
  if (!q && !tags.length) return result;
  const hasTags = (ids: string[]) => tags.every((t) => ids.includes(t));
  for (const id of listProjects(root)) {
    if (workspaceDir(root) !== initialWorkspace) return { projects: [], files: [], truncated: false };
    if (project && id !== project) continue;
    const p = projectSummary(id, root);
    if (!onlyFiles && !onlyContent && (!tags.length || hasTags(p.tags)) && (!q || `${p.name}\n${p.description}\n${p.id}`.toLowerCase().includes(q))) result.projects.push(p);
    if (onlyProjects) continue;
    const marks = fileTags(id, root);
    const dir = join(projectsDir(root), id);
    const turn = yielder();
    for (const path of await walkText(dir, '', true)) {
      await turn();
      if (workspaceDir(root) !== initialWorkspace) return { projects: [], files: [], truncated: false };
      if (path.split('/').includes('.extracted')) continue;
      if (result.files.length >= HIT_LIMIT) { result.truncated = true; return result; }
      const own = marks[path] ?? [];
      if (tags.length && !hasTags(own) && !hasTags(p.tags)) continue;
      if (!q && !hasTags(own)) continue;
      const inName = !!q && path.toLowerCase().includes(q);
      let text = '';
      if (!onlyFiles && q) { try { text = await fileText(join(dir, ...path.split('/')), extname(path).toLowerCase()); } catch { /* unreadable files can still match by name */ } }
      if (q && !(inName && !onlyContent) && !text.toLowerCase().includes(q)) continue;
      result.files.push({ project: id, projectName: p.name, path, tags: own, ...snippet(text, q) });
    }
  }
  return result;
}

// The line with the first match, cut around it.
function snippet(text: string, q: string): { snippet: string; line: number } {
  const lower = text.toLowerCase();
  const at = lower.indexOf(q);
  if (at < 0) return { snippet: text.split('\n').find((l) => l.trim())?.trim().slice(0, 140) ?? '', line: 0 };
  const line = text.slice(0, at).split('\n').length;
  const start = text.lastIndexOf('\n', at) + 1;
  const end = text.indexOf('\n', at);
  const full = text.slice(start, end < 0 ? undefined : end).trim();
  const pos = full.toLowerCase().indexOf(q);
  const from = Math.max(0, pos - 60);
  return { snippet: `${from > 0 ? '…' : ''}${full.slice(from, pos + q.length + 80)}${pos + q.length + 80 < full.length ? '…' : ''}`, line };
}

interface Hit { at: number; hit: FileHit } // at: position of the file in the walk

export async function searchWorkspace(root: string, query: string, tags: string[] = []): Promise<SearchResult> {
  const q = query.trim().toLowerCase().slice(0, 200);
  const result: SearchResult = { projects: [], files: [], truncated: false };
  if (!q && !tags.length) return result;
  const hasTags = (ids: string[]) => tags.every((t) => ids.includes(t));
  // Projects are searched a few at a time; the merge below applies the project order and HIT_LIMIT as a one-by-one search would.
  // Once the projects before one already hold HIT_LIMIT hits, its files are walked but not read: they cannot make the result.
  const ids = await listProjectsAsync(root);
  const done: ({ hits: Hit[] } | undefined)[] = new Array(ids.length);
  const full = (upTo: number): boolean => {
    let n = 0;
    for (let k = 0; k < upTo; k++) { if (!done[k]) return false; n += done[k]!.hits.length; }
    return n >= HIT_LIMIT;
  };
  const found = await mapLimit(ids, PROJECTS_AT_ONCE, async (id, index) => {
    const p = await projectSummaryAsync(id, root);
    const projectTagged = tags.length > 0 && hasTags(p.tags);
    const projectMatch = (!tags.length || projectTagged) && (!q || `${p.name}\n${p.description}\n${p.id}`.toLowerCase().includes(q));
    const marks = fileTags(id, root);
    const dir = join(projectsDir(root), id);
    const paths = await walkText(dir);
    const hits: Hit[] = [];
    const turn = yielder();
    for (let from = 0; from < paths.length && hits.length < HIT_LIMIT && !full(index); from += READ_BATCH) {
      await turn();
      const batch = await Promise.all(paths.slice(from, from + READ_BATCH).map(async (path, i): Promise<Hit | null> => {
        const own = marks[path] ?? [];
        // With tags: the files tagged with them, or every file of a project tagged with them.
        if (tags.length && !hasTags(own) && !projectTagged) return null;
        if (!q) {
          if (!hasTags(own)) return null; // tags only: the files tagged themselves, not a whole project
          try { if ((await stat(join(dir, ...path.split('/')))).size > FILE_LIMIT) return null; } catch { return null; }
          return { at: from + i, hit: { project: id, projectName: p.name, path, tags: own, ...snippet('', '') } };
        }
        let text = '';
        try { const data = await readLimited(join(dir, ...path.split('/'))); if (!data) return null; text = data.toString('utf8'); } catch { return null; }
        if (!path.toLowerCase().includes(q) && !text.toLowerCase().includes(q)) return null;
        return { at: from + i, hit: { project: id, projectName: p.name, path, tags: own, ...snippet(text, q) } };
      }));
      hits.push(...batch.filter((h): h is Hit => h !== null));
    }
    done[index] = { hits };
    return { p, projectMatch, hits, walked: paths.length };
  });
  for (const { p, projectMatch, hits, walked } of found) {
    if (projectMatch) result.projects.push(p);
    if (result.files.length >= HIT_LIMIT) { if (walked) result.truncated = true; continue; }
    const taken = hits.slice(0, HIT_LIMIT - result.files.length);
    result.files.push(...taken.map((h) => h.hit));
    // truncated: a file of the walk is left after the limit was reached
    if (hits.length > taken.length || (result.files.length >= HIT_LIMIT && taken[taken.length - 1].at < walked - 1)) result.truncated = true;
  }
  return result;
}
