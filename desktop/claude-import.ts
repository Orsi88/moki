// Upload of skills and agents from a .claude folder, a project that contains one, a skills/ or agents/
// folder, a single skill, or the same inside a .zip. Pure reading and checking: nothing here writes to
// the install folders (the service does, after the user confirms). Everything read is untrusted: names are
// validated, files are limited, symbolic links are not followed and secrets block the item. Blocking
// reasons are codes; the app translates them.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzip } from '../scripts/lib/zip.mjs';
import { PATTERNS } from '../scripts/lib/secret-patterns.mjs';

export const LIMITS = { maxFiles: 1000, maxFileBytes: 5 * 1024 * 1024, maxTotalBytes: 50 * 1024 * 1024 };

export type ImportKind = 'skill' | 'agent';
// Why an item cannot be installed. 'installed' is added by the service (it knows the destination).
export type BlockReason = 'invalid-name' | 'no-skill-md' | 'no-description' | 'secret' | 'moki-name' | 'installed';
export interface Blocked { reason: BlockReason; detail?: string; file?: string } // secret: its kind (detail) and file, never its value
export interface ImportFile { path: string; data: Buffer }
export interface ImportEntry {
  kind: ImportKind; name: string; description: string;
  files: ImportFile[]; // what would be written (agents: one file)
  discarded: string[]; // files left out of a skill (.env*, *.pem, *.key, settings.local.json)
  blocked?: Blocked;
}
export type IgnoredReason = 'config' | 'symlink' | 'other';
export interface Scan { entries: ImportEntry[]; ignored: { path: string; reason: IgnoredReason }[] }

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Settings, hooks, commands and MCP files can run commands or change the AI tool: listed, never imported.
const CONFIG = new Set(['settings.json', 'settings.local.json', 'hooks', 'commands', 'CLAUDE.md', '.mcp.json']);
const SENSITIVE_FILE = /(^|\/)(\.env(\..*)?|settings\.local\.json|[^/]+\.(pem|key))$/i;
const TEXT_SCAN_BYTES = 2 * 1024 * 1024;

type Files = Map<string, Buffer>;
interface Read { files: Files; ignored: Scan['ignored'] }

class Limit { files = 0; bytes = 0 }

// ---------------------------------------------------------------- reading the source

function walk(abs: string, rel: string, out: Read, used: Limit): void {
  for (const name of readdirSync(abs)) {
    const path = join(abs, name);
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(path); // lstat: a symbolic link is listed, not followed
    if (st.isSymbolicLink()) { out.ignored.push({ path: r, reason: 'symlink' }); continue; }
    if (st.isDirectory()) { walk(path, r, out, used); continue; }
    if (!st.isFile()) continue;
    if (++used.files > LIMITS.maxFiles) throw new Error(`The folder has more than ${LIMITS.maxFiles} files.`);
    if (st.size > LIMITS.maxFileBytes) throw new Error(`${r} is larger than ${LIMITS.maxFileBytes / 1048576} MB.`);
    used.bytes += st.size;
    if (used.bytes > LIMITS.maxTotalBytes) throw new Error(`The folder is larger than ${LIMITS.maxTotalBytes / 1048576} MB.`);
    out.files.set(r, readFileSync(path));
  }
}

// Reads only the parts that can hold skills or agents, so a project folder with node_modules is not walked.
export function readFolder(dir: string): Read {
  const out: Read = { files: new Map(), ignored: [] };
  const used = new Limit();
  const kind = (p: string) => { try { return lstatSync(join(dir, p)); } catch { return null; } };
  const has = (p: string) => kind(p) !== null;
  if (kind('.claude')?.isDirectory()) {
    walk(join(dir, '.claude'), '.claude', out, used);
    for (const f of ['CLAUDE.md', '.mcp.json']) if (has(f)) out.ignored.push({ path: f, reason: 'config' });
  } else if (kind('skills')?.isDirectory() || kind('agents')?.isDirectory()) {
    for (const part of ['skills', 'agents']) if (kind(part)?.isDirectory()) walk(join(dir, part), part, out, used);
    for (const f of CONFIG) if (has(f)) out.ignored.push({ path: f, reason: 'config' });
  } else if (has('SKILL.md')) walk(dir, '', out, used);
  else throw new Error('No .claude folder, skills/, agents/ or SKILL.md found in this folder.');
  return out;
}

export function readZip(buf: Buffer): Read {
  const skipped: string[] = [];
  let all: Files;
  try { all = unzip(buf, { ...LIMITS, skipped }) as Files; } catch (e) {
    throw new Error(e instanceof RangeError ? `A file in the ZIP is larger than ${LIMITS.maxFileBytes / 1048576} MB.` : `Could not read the ZIP: ${e instanceof Error ? e.message : String(e)}`);
  }
  const files: Files = new Map([...all].filter(([name]) => !name.endsWith('/')));
  // A zip of a folder keeps the folder's name as its only top-level entry.
  const tops = new Set([...files.keys()].map((k) => k.split('/')[0]));
  const [only] = [...tops];
  const wrapped = tops.size === 1 && ![...files.keys()].includes(only) && !['.claude', 'skills', 'agents'].includes(only);
  const out: Read = { files: wrapped ? new Map([...files].map(([k, v]) => [k.slice(only.length + 1), v])) : files, ignored: skipped.map((path) => ({ path, reason: 'symlink' as const })) };
  if (![...out.files.keys()].some((k) => /^(\.claude\/|skills\/|agents\/|SKILL\.md$)/.test(k))) throw new Error('No .claude folder, skills/, agents/ or SKILL.md found in this ZIP.');
  return out;
}

// ---------------------------------------------------------------- recognizing items

function describe(text: string): string {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ''))?.[1];
  if (!block) return '';
  const lines = block.split(/\r?\n/);
  const i = lines.findIndex((l) => /^description:/.test(l));
  if (i < 0) return '';
  const first = lines[i].slice('description:'.length).trim();
  const rest: string[] = [];
  for (const l of lines.slice(i + 1)) { if (/^\s+\S/.test(l)) rest.push(l.trim()); else break; }
  const value = /^[>|][+-]?$/.test(first) || first === '' ? rest.join(' ') : first;
  return value.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
}

// The first secret-looking line of a text file: its label only, never the value.
function secretIn(files: ImportFile[]): { detail: string; file: string } | undefined {
  for (const f of files) {
    if (f.data.length > TEXT_SCAN_BYTES || f.data.includes(0)) continue;
    const hit = f.data.toString('utf8').split('\n').map((line) => (PATTERNS as [string, RegExp][]).find(([, re]) => re.test(line))).find(Boolean);
    if (hit) return { detail: hit[0] as string, file: f.path };
  }
  return undefined;
}

// `reserved`: names of Moki's own skills and agents, which an upload may not take over.
export function scan(read: Read, reserved: { skills: Set<string>; agents: Set<string> }): Scan {
  const hasBase = [...read.files.keys()].some((k) => k.startsWith('.claude/'));
  const ignored = [...read.ignored];
  const listed = new Set<string>();
  const skip = (top: string) => { if (!listed.has(top)) { listed.add(top); ignored.push({ path: top, reason: CONFIG.has(top) ? 'config' : 'other' }); } };

  // rel: the paths seen from inside the .claude (or from the picked skills/agents folder).
  const rel: Files = new Map();
  for (const [k, v] of read.files) {
    if (!hasBase) rel.set(k, v);
    else if (k.startsWith('.claude/')) rel.set(k.slice('.claude/'.length), v);
    else skip(k.split('/')[0]);
  }

  const entries: ImportEntry[] = [];
  const skills = new Map<string, ImportFile[]>();
  const keys = [...rel.keys()];
  const singleSkill = rel.has('SKILL.md') && !keys.some((k) => /^(skills|agents)\//.test(k));
  if (singleSkill) skills.set('', keys.map((k) => ({ path: k, data: rel.get(k) as Buffer })));
  else {
    for (const [path, data] of rel) {
      const parts = path.split('/');
      if (parts[0] === 'skills' && parts.length >= 3) skills.set(parts[1], [...(skills.get(parts[1]) ?? []), { path: parts.slice(2).join('/'), data }]);
      else if (parts[0] === 'agents' && parts.length === 2 && parts[1].endsWith('.md')) {
        entries.push(check({ kind: 'agent', name: parts[1].slice(0, -3), description: describe(data.toString('utf8')), files: [{ path: parts[1], data }], discarded: [] }, reserved.agents));
      } else skip(parts[0]);
    }
  }

  for (const [dir, list] of skills) {
    const keep = list.filter((f) => !SENSITIVE_FILE.test(f.path));
    const text = keep.find((f) => f.path === 'SKILL.md')?.data.toString('utf8');
    // A single skill has no folder name: it is named by its frontmatter.
    const name = dir || (/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '')?.[1] ?? '')?.[1] ?? '');
    const e: ImportEntry = { kind: 'skill', name, description: text ? describe(text) : '', files: keep, discarded: list.filter((f) => SENSITIVE_FILE.test(f.path)).map((f) => f.path) };
    entries.push(text === undefined ? { ...e, blocked: { reason: 'no-skill-md' } } : check(e, reserved.skills));
  }
  return { entries, ignored };
}

// The first reason an item cannot be installed, in a fixed order.
function check(e: ImportEntry, reserved: Set<string>): ImportEntry {
  if (!NAME.test(e.name)) return { ...e, blocked: { reason: 'invalid-name' } };
  if (reserved.has(e.name)) return { ...e, blocked: { reason: 'moki-name' } };
  if (!e.description) return { ...e, blocked: { reason: 'no-description' } };
  const secret = secretIn(e.files);
  return secret ? { ...e, blocked: { reason: 'secret', ...secret } } : e;
}
