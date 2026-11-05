// Display titles for project notes, stored separately so links to note files stay valid.
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { resolveInside } from './fs-guard.ts';

export interface NoteTitle { path: string; title: string }
const FILE = '.moki-note-titles.json';
export function noteTitles(dir: string): NoteTitle[] {
  const file = resolveInside(dir, FILE);
  if (!existsSync(file)) return [];
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(data) || data.some((item: NoteTitle) => !item || typeof item.path !== 'string' || typeof item.title !== 'string')) throw new Error('Invalid note titles.');
  return data as NoteTitle[];
}
export function setNoteTitle(dir: string, path: string, title: string): void {
  const entries = noteTitles(dir).filter((item) => item.path !== path);
  if (title) entries.push({ path, title });
  const file = resolveInside(dir, FILE);
  const temp = join(dir, `${FILE}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(entries, null, 2)}\n`, { flag: 'wx' });
    renameSync(temp, file);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}
