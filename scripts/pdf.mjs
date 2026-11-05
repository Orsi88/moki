// Renders a Markdown report to PDF using a locally installed Chromium-based
// browser (Edge ships with Windows; Chrome/Chromium elsewhere). No dependencies.
//
// Usage: node scripts/pdf.mjs <report.md> <report.pdf> [--style <document-style.json>]
// The look comes from the document style of the project the PDF is written for
// (scripts/lib/doc-style.mjs); --style overrides it.
// Browser override: set QA_AGENTS_BROWSER to the browser executable path.
// Exit code 2 = no browser found; the HTML is still written next to the PDF path.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markdownToHtml, escHtml } from './lib/markdown.mjs';
import { applyDiagramImages, diagramSources, photographDiagrams } from './lib/diagram-images.mjs';
import { DEFAULT_STYLE, fillVars, hasFooter, hasHeader, styleFor } from './lib/doc-style.mjs';

export { markdownToHtml };

// The document style (Settings › Documents) sets fonts, colours, background, header,
// footer and watermark. Without one the report looks as it always did.
const cssString = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3C ')}"`;
// "Página {page} de {pages}" -> "Página " counter(page) " de " counter(pages)
const marginContent = (value, vars) => fillVars(value, vars).split(/(\{page\}|\{pages\})/)
  .filter(Boolean).map((part) => (part === '{page}' ? 'counter(page)' : part === '{pages}' ? 'counter(pages)' : cssString(part))).join(' ');

export function styleCss(style = DEFAULT_STYLE, vars = {}) {
  const s = style;
  const font = `"${s.font.family}", "Segoe UI", Calibri, Arial, sans-serif`;
  const small = `${Math.max(7, s.font.size - 2)}pt ${font}`;
  const box = (side, value, extra = '') => (value || extra ? `@${side} { content: ${value ? marginContent(value, vars) : '""'}; font: ${small}; color: #595959; ${extra} }` : '');
  const logo = s.header.logo ? `background: url("${s.header.logo}") no-repeat ${s.header.logoSide} center / auto 10mm; ${s.header.logoSide === 'left' ? 'padding-left' : 'padding-right'}: 14mm;` : '';
  const header = hasHeader(s);
  const footer = hasFooter(s);
  return `
@page { size: A4; margin: ${header ? '24mm' : '18mm'} 16mm ${footer ? '20mm' : '18mm'}; background: ${s.background};
  ${box('top-left', s.header.left, s.header.logoSide === 'left' ? logo : '')}
  ${box('top-center', s.header.center)}
  ${box('top-right', s.header.right, s.header.logoSide === 'right' ? logo : '')}
  ${box('bottom-left', s.footer.left)}
  ${box('bottom-center', s.footer.center)}
  ${box('bottom-right', s.footer.right)}
}
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: ${s.background}; }
body { font-family: ${font}; font-size: ${s.font.size}pt; color: ${s.font.color}; line-height: 1.45; }
h1 { font-size: ${s.font.size + 9.5}pt; color: ${s.accent}; border-bottom: 2px solid ${s.accent}; padding-bottom: 4px; }
h2 { font-size: ${s.font.size + 3.5}pt; color: ${s.accent}; margin-top: 18pt; page-break-after: avoid; }
h3 { font-size: ${s.font.size + 1}pt; margin-top: 12pt; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; page-break-inside: auto; }
th { background: ${s.table.header}; color: ${s.table.headerText}; text-align: left; }
th, td { border: 1px solid ${s.table.border}; padding: 4px 6px; vertical-align: top; }
tr { page-break-inside: avoid; }
code { background: #f2f2f2; padding: 0 3px; }
blockquote { border-left: 3px solid ${s.accent}; margin: 6pt 0; padding: 2pt 8pt; color: #333; }
img.diagram { display: block; max-width: 100%; height: auto; margin: 8pt 0; }
.watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 10; }
.watermark span { transform: rotate(-35deg); font: 700 80pt ${font}; color: ${s.watermark.color}; opacity: ${s.watermark.opacity}; white-space: nowrap; }
`;
}

export async function renderHtml(md, title, { style = DEFAULT_STYLE, vars = {}, browser = null } = {}) {
  const v = { title, ...vars };
  const mark = style.watermark.text ? `<div class="watermark"><span>${escHtml(fillVars(style.watermark.text, v))}</span></div>` : '';
  let body = markdownToHtml(md);
  const diagrams = diagramSources(body);
  // Each diagram becomes one picture. A failure leaves that block as code.
  if (browser && diagrams.length) body = applyDiagramImages(body, await photographDiagrams(diagrams, browser));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${styleCss(style, v)}</style></head><body>${mark}${body}</body></html>`;
}

function findBrowser() {
  if (process.env.QA_AGENTS_BROWSER) return process.env.QA_AGENTS_BROWSER;
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (found) return found;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch { /* next */ }
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--style');
  const styleFile = at === -1 ? undefined : argv[at + 1];
  const [input, output] = at === -1 ? argv : argv.filter((_, i) => i !== at && i !== at + 1);
  if (!input || !output) { console.error('Usage: node scripts/pdf.mjs <report.md> <report.pdf> [--style <document-style.json>]'); process.exit(1); }
  const md = readFileSync(input, 'utf8');
  const title = (md.match(/^#\s+(.+)$/m) || [, 'Report'])[1];
  const pdfPath = resolve(output);
  const htmlPath = pdfPath.replace(/\.pdf$/i, '') + '.html';
  mkdirSync(dirname(pdfPath), { recursive: true });
  const { style, vars } = styleFor(pdfPath, { styleFile, title });
  const browser = findBrowser();
  writeFileSync(htmlPath, await renderHtml(md, title, { style, vars, browser }));
  if (!browser) {
    console.error(`No Edge/Chrome/Chromium found. HTML written to ${htmlPath}; open it and print to PDF, or set QA_AGENTS_BROWSER.`);
    process.exit(2);
  }
  const profile = join(tmpdir(), `qa-agents-pdf-${process.pid}`);
  try {
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: 'ignore', timeout: 120000 });
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  if (!existsSync(pdfPath)) { console.error(`Browser did not produce ${pdfPath}. HTML is at ${htmlPath}.`); process.exit(1); }
  console.log(`Wrote ${pdfPath} (source HTML: ${htmlPath})`);
}
