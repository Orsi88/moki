// Document style: how the PDF, Word and Excel files that activities and agents
// generate look (font, colours, background, header, footer, logo, watermark).
// Templates (Settings > Templates): a list of named styles of the workspace, each with
// tags saying which projects it applies to (scripts/lib/tags.mjs: none = every project).
// A project uses the template chosen as its default (project.json "template") when it
// still applies, else the one without tags, else the first that applies. The scripts that
// write deliverables read it, so every AI tool gets the same result. No dependencies.
//
// Files:  <workspace>/templates/<id>.json  {name, tags, style}
//         Before templates: <workspace>/document-style.json (all projects) and
//         <workspace>/projects/<id>/document-style.json (one project); the first listing
//         turns them into templates ("Default", and one per project, its default).
// Header and footer texts can use {project}, {title}, {date}, {page} and {pages}.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { ROOT, workspaceDir } from './repo.mjs';
import { appliesTo, cleanTags, projectTag } from './tags.mjs';

export const STYLE_FILE = 'document-style.json';

// The look the deliverables had before styles existed: nothing changes until the user sets one.
export const DEFAULT_STYLE = Object.freeze({
  font: { family: 'Calibri', size: 10.5, color: '#1A1A1A' },
  accent: '#1F4E78', // titles and rules
  table: { header: '#1F4E78', headerText: '#FFFFFF', border: '#BFBFBF' },
  background: '#FFFFFF',
  header: { left: '', center: '', right: '', logo: '', logoSide: 'left' },
  footer: { left: '', center: '', right: '' },
  watermark: { text: '', color: '#808080', opacity: 0.12 },
});

export const FONTS = ['Calibri', 'Arial', 'Segoe UI', 'Helvetica', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Cambria', 'Garamond', 'Consolas'];
const LOGO_MAX = 700 * 1024; // characters of the data: URL

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v, fallback) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toUpperCase() : fallback);
const text = (v, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '');
const number = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback);
const logo = (v) => (typeof v === 'string' && v.length <= LOGO_MAX && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '');

// Any input (a file, the app's form) becomes a complete, safe style. Unknown keys are dropped.
export function normalizeStyle(input, base = DEFAULT_STYLE) {
  const s = input && typeof input === 'object' ? input : {};
  const f = s.font ?? {}; const tb = s.table ?? {}; const h = s.header ?? {}; const ft = s.footer ?? {}; const w = s.watermark ?? {};
  return {
    font: {
      family: typeof f.family === 'string' && FONTS.includes(f.family) ? f.family : base.font.family,
      size: number(f.size, 8, 16, base.font.size),
      color: color(f.color, base.font.color),
    },
    accent: color(s.accent, base.accent),
    table: { header: color(tb.header, base.table.header), headerText: color(tb.headerText, base.table.headerText), border: color(tb.border, base.table.border) },
    background: color(s.background, base.background),
    header: {
      left: 'left' in h ? text(h.left) : base.header.left,
      center: 'center' in h ? text(h.center) : base.header.center,
      right: 'right' in h ? text(h.right) : base.header.right,
      logo: 'logo' in h ? logo(h.logo) : base.header.logo,
      logoSide: h.logoSide === 'right' ? 'right' : h.logoSide === 'left' ? 'left' : base.header.logoSide,
    },
    footer: {
      left: 'left' in ft ? text(ft.left) : base.footer.left,
      center: 'center' in ft ? text(ft.center) : base.footer.center,
      right: 'right' in ft ? text(ft.right) : base.footer.right,
    },
    watermark: { text: 'text' in w ? text(w.text, 40) : base.watermark.text, color: color(w.color, base.watermark.color), opacity: number(w.opacity, 0.03, 0.5, base.watermark.opacity) },
  };
}

const readJson = (file) => { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; } };

// The project a file is written for, from its path (<workspace>/projects/<id>/…).
export function projectOf(path, root = ROOT) {
  const projects = resolve(workspaceDir(root), 'projects') + sep;
  const full = resolve(path);
  if (!full.startsWith(projects)) return null;
  const id = full.slice(projects.length).split(sep)[0];
  return id && /^[\w.-]+$/.test(id) ? id : null;
}

// ---------------------------------------------------------------- templates

const templatesDir = (root) => join(workspaceDir(root), 'templates');
const projectsDir = (root) => join(workspaceDir(root), 'projects');
const projectFile = (project, root) => join(projectsDir(root), project, 'project.json');
const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const slug = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const projectIds = (root) => (existsSync(projectsDir(root)) ? readdirSync(projectsDir(root)).filter((d) => existsSync(projectFile(d, root))).sort() : []);

function readTemplates(root) {
  const dir = templatesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const t = readJson(join(dir, f));
    if (!t || typeof t.name !== 'string') return [];
    return [{ id: f.slice(0, -5), name: t.name.slice(0, 80), tags: cleanTags(t.tags), style: normalizeStyle(t.style) }];
  }).sort((a, b) => Number(a.tags.length > 0) - Number(b.tags.length > 0) || a.name.localeCompare(b.name));
}

// The styles saved before templates existed become templates, once.
function migrate(root) {
  const dir = templatesDir(root);
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  const global = normalizeStyle(readJson(join(workspaceDir(root), STYLE_FILE)));
  writeJson(join(dir, 'default.json'), { name: 'Default', tags: [], style: global });
  const taken = new Set(['default']);
  for (const project of projectIds(root)) {
    const own = readJson(join(projectsDir(root), project, STYLE_FILE));
    if (!own) continue;
    const data = readJson(projectFile(project, root)) ?? {};
    const base = slug(data.name ?? project) || project;
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    taken.add(id);
    writeJson(join(dir, `${id}.json`), { name: String(data.name ?? project), tags: [projectTag(project)], style: normalizeStyle(own, global) });
    writeJson(projectFile(project, root), { ...data, template: id });
  }
}

export function listTemplates(root = ROOT) {
  migrate(root);
  return readTemplates(root);
}

export function saveTemplate(raw, root = ROOT) {
  migrate(root);
  const r = raw && typeof raw === 'object' ? raw : {};
  const name = String(r.name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
  if (!name) throw new Error('Give the template a name.');
  const list = readTemplates(root);
  let id = typeof r.id === 'string' && list.some((t) => t.id === r.id) ? r.id : '';
  if (!id) {
    const base = slug(name) || 'template';
    id = base;
    for (let i = 2; list.some((t) => t.id === id); i++) id = `${base}-${i}`;
  }
  const template = { id, name, tags: cleanTags(r.tags), style: normalizeStyle(r.style) };
  writeJson(join(templatesDir(root), `${id}.json`), { name, tags: template.tags, style: template.style });
  return template;
}

// The last template stays: without one there is nothing to edit (deliverables would still use the defaults).
export function removeTemplate(id, root = ROOT) {
  const list = listTemplates(root);
  if (!list.some((t) => t.id === id)) throw new Error('Unknown template.');
  if (list.length === 1) throw new Error('Keep at least one template.');
  rmSync(join(templatesDir(root), `${id}.json`));
  for (const project of projectIds(root)) {
    const data = readJson(projectFile(project, root));
    if (data?.template === id) { delete data.template; writeJson(projectFile(project, root), data); }
  }
}

// The template a project uses as its default (null: the automatic choice).
export function setProjectTemplate(project, id, root = ROOT) {
  const data = readJson(projectFile(project, root));
  if (!data) throw new Error('Unknown project.');
  if (id) {
    const t = listTemplates(root).find((x) => x.id === id);
    if (!t) throw new Error('Unknown template.');
    if (!appliesTo(t.tags, project, root)) throw new Error("This template does not apply to the project: give it the project's tag first.");
    data.template = id;
  } else delete data.template;
  writeJson(projectFile(project, root), data);
}

// The template a project uses: its default when it still applies, else the one without tags, else the first that applies.
export function templateFor(project, root = ROOT) {
  const fits = readTemplates(root).filter((t) => appliesTo(t.tags, project, root));
  const chosen = readJson(projectFile(project, root))?.template;
  return fits.find((t) => t.id === chosen) ?? fits.find((t) => !t.tags.length) ?? fits[0] ?? null;
}

// The style for a file: --style file > its project's template > the template without tags > defaults
// (before templates existed: its project's style > the style for all projects). Also the values for {project} and {title}.
export function styleFor(outPath, { root = ROOT, styleFile, title = '' } = {}) {
  const project = outPath ? projectOf(outPath, root) : null;
  const global = normalizeStyle(readJson(join(workspaceDir(root), STYLE_FILE)));
  let style;
  if (existsSync(templatesDir(root))) {
    const general = readTemplates(root).find((t) => !t.tags.length)?.style ?? normalizeStyle({});
    style = project ? templateFor(project, root)?.style ?? general : general;
  } else style = project ? normalizeStyle(readJson(join(workspaceDir(root), 'projects', project, STYLE_FILE)), global) : global;
  if (styleFile) style = normalizeStyle(readJson(resolve(styleFile)), style);
  const name = project ? String(readJson(join(workspaceDir(root), 'projects', project, 'project.json'))?.name ?? project) : '';
  return { style, vars: { project: name, title, date: new Date().toLocaleDateString('pt-BR') } };
}

// {project}, {title}, {date}; {page} and {pages} are left for each format to fill.
export const fillVars = (value, vars) => String(value ?? '').replace(/\{(project|title|date)\}/g, (_, k) => vars[k] ?? '');

export const hasHeader = (s) => Boolean(s.header.left || s.header.center || s.header.right || s.header.logo);
export const hasFooter = (s) => Boolean(s.footer.left || s.footer.center || s.footer.right);
