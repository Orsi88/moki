// Builds the GitHub wiki from docs/: docs/ is the source (versioned, reviewed, validated,
// read by the framework's agents) and the wiki is a published copy. docs/wiki.json lists
// the sections and pages (and their pt-BR versions). Each page gets a note that it is
// edited in docs/; links to other pages become wiki links, links to the rest of the
// repository point to GitHub at the published ref, and a link to a missing file stops
// the build. Also writes Home, _Sidebar and _Footer.
//
// Usage: node scripts/build-wiki.mjs [--out release/wiki] [--ref main] [--sha <commit>]
// (.github/workflows/wiki.yml runs it and pushes the result to <repo>.wiki.git)

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const posix = (p) => p.split('\\').join('/');
export const pageName = (title) => title.trim().replace(/\s+/g, '-');

// Every page of the manifest: { file (relative to docs/), page, lang, other (the same page in the other language) }.
export function wikiPages(manifest) {
  const pages = [];
  for (const section of manifest.sections) {
    for (const p of section.pages) {
      pages.push({ file: p.file, page: p.page, lang: 'en', section: section.title, other: p.pt?.page });
      if (p.pt) pages.push({ file: p.pt.file, page: p.pt.page, lang: 'pt', section: section.title, other: p.page });
    }
  }
  return pages;
}

// Rewrites the Markdown links of one page (fenced code is left as it is).
function rewrite(text, from, ctx) {
  return text.split(/(```[\s\S]*?```)/g).map((part) => (part.startsWith('```') ? part : part.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (all, bang, label, target, title) => {
    if (/^(https?:|mailto:|#)/.test(target)) return all;
    const [path, anchor] = target.split('#');
    const abs = resolve(dirname(from), decodeURI(path));
    const rel = posix(relative(ctx.root, abs));
    if (!existsSync(abs)) throw new Error(`${posix(relative(ctx.root, from))}: broken link "${target}"`);
    const page = ctx.byFile.get(rel);
    const hash = anchor ? `#${anchor}` : '';
    if (page && !bang) return `[${label}](${pageName(page)}${hash})${title}`;
    const kind = bang ? null : statSync(abs).isDirectory() ? 'tree' : 'blob';
    const url = bang ? `https://raw.githubusercontent.com/${ctx.repo}/${ctx.ref}/${rel}` : `https://github.com/${ctx.repo}/${kind}/${ctx.ref}/${rel}${hash}`;
    return `${bang}[${label}](${url})${title}`;
  }))).join('');
}

// { '<Page-Name>.md': text } for the whole wiki.
export function buildWiki(root, { ref = 'main', sha = '' } = {}) {
  const manifest = JSON.parse(readFileSync(join(root, 'docs', 'wiki.json'), 'utf8'));
  const pages = wikiPages(manifest);
  const ctx = { root, repo: manifest.repo, ref, byFile: new Map(pages.map((p) => [`docs/${p.file}`, p.page])) };
  const source = (file) => `https://github.com/${manifest.repo}/blob/${ref}/docs/${file}`;
  const out = {};
  for (const p of pages) {
    const file = join(root, 'docs', p.file);
    if (!existsSync(file)) throw new Error(`docs/wiki.json: docs/${p.file} does not exist`);
    const note = p.lang === 'pt'
      ? `> Página gerada a partir de [docs/${p.file}](${source(p.file)}): edite lá, porque mudanças feitas na wiki são substituídas.${p.other ? ` In English: [${p.other}](${pageName(p.other)}).` : ''}`
      : `> Generated from [docs/${p.file}](${source(p.file)}): edit it there, changes made in the wiki are replaced.${p.other ? ` Em português: [${p.other}](${pageName(p.other)}).` : ''}`;
    const dev = ref === 'main' ? '' : p.lang === 'pt'
      ? `\n>\n> **Versão em desenvolvimento:** publicada da branch \`${ref}\`; parte do que está aqui ainda não está numa versão publicada.`
      : `\n>\n> **In development:** published from the branch \`${ref}\`; some of it is not in a release yet.`;
    out[`${pageName(p.page)}.md`] = `${note}${dev}\n\n${rewrite(readFileSync(file, 'utf8'), file, ctx).trim()}\n`;
  }
  const link = (title) => `[${title}](${pageName(title)})`;
  const en = manifest.sections.map((s) => `### ${s.title}\n\n${s.pages.map((p) => `- ${link(p.page)}${p.pt ? ` · ${link(p.pt.page)} (pt-BR)` : ''}`).join('\n')}`);
  const pt = pages.filter((p) => p.lang === 'pt').map((p) => `- ${link(p.page)}`);
  out['Home.md'] = `# Moki\n\n${rewrite(manifest.intro, join(root, 'docs', 'wiki.json'), ctx)}\n\n${en.join('\n\n')}\n\n## Em português\n\n${manifest.introPt}\n\n${pt.join('\n')}\n`;
  out['_Sidebar.md'] = `**[Home](Home)**\n\n${manifest.sections.map((s) => `**${s.title}**\n\n${s.pages.map((p) => `- ${link(p.page)}`).join('\n')}`).join('\n\n')}\n\n**Português**\n\n${pt.join('\n')}\n`;
  out['_Footer.md'] = `Generated from [docs/](https://github.com/${manifest.repo}/tree/${ref}/docs) of ${manifest.repo} at \`${ref}\`${sha ? ` (${sha.slice(0, 7)})` : ''}. Edit the files there; changes made in the wiki are replaced.\n`;
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = resolve(opt('out', join(root, 'release', 'wiki')));
  const pages = buildWiki(root, { ref: opt('ref', 'main'), sha: opt('sha', '') });
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith('.md')) rmSync(join(outDir, f)); // a page taken out of the manifest leaves the wiki
  for (const [name, text] of Object.entries(pages)) writeFileSync(join(outDir, name), text);
  console.log(`Wiki: ${Object.keys(pages).length} pages in ${outDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
}
