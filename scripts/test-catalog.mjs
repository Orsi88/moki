// Writes docs/test-catalog.md: one row per automated test scenario, read from the test files
// themselves (the test titles say the behaviour), with its kind, its area and where it is.
// The rules below classify each test; a test no rule classifies stops the script, so a new
// test is never put in a wrong area silently. Run it after adding or renaming tests.
//
// Usage: node scripts/test-catalog.mjs   (npm run test-catalog)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TITLE = /^\s*test(\.skip)?\((['"`])((?:\\.|(?!\2).)*)\2(.*)$/;
const DESCRIBE = /^\s*test\.describe(?:\.serial)?\((['"`])((?:\\.|(?!\1).)*)\1/;

// [file, area, kind] rules, first match wins: area and kind of the tests whose title matches.
const U = 'Unit';
const I = 'Integration';
const RULES = {
  'desktop.test.ts': [
    [/^projects and project creation|^deleting a project|^tree lists/, 'Projects', I],
    [/^fs-guard/, 'Files and confinement', U],
    [/^readFile|^file access|^editing is limited|^files dropped|^open folder|^new files and folders|^where an item is/, 'Files and confinement', I],
    [/^gio mime/, 'Open with', U],
    [/^"open with"/, 'Open with', I],
    [/^pdfcraft-cli|^a selection on drawn pages|^the comment cards beside a PDF/, 'PDF (PdfCraft)', U],
    [/^PdfCraft|^PDF/, 'PDF (PdfCraft)', I],
    [/^notes:|^note windows/, 'Notes', I],
    [/^MCPs:/, 'MCP servers', I],
    [/^run details/, 'Activities and runs', I],
    [/^launcher keeps user text/, 'Launching AI tools', U],
    [/^launch |^non-ASCII|^app plugins|^plugins per project|^terminal tabs/, 'Launching AI tools', I],
    [/^tags /, 'Tags', I],
    [/^operations/, 'Multi-agent operations', I],
    [/^agent library|^agents in operations|^agents per project|^agents created/, 'Agents', I],
    [/^skill registry|^create skill|^global tab|^set up:|^blank project/, 'Skills and set up', I],
    [/^linked folder|^repository tab/, 'Linked folder', I],
    [/^markdown|^docx extraction|^spreadsheet number/, 'Rendering', U],
    [/^installer|^installed copies/, 'Installer', I],
    [/^UI requests/, 'App bridge (IPC)', I],
    [/^workspaces/, 'Workspaces', I],
    [/^search/, 'Search', I],
  ],
  'framework.test.mjs': [
    [/^real repository|^fixture passes|^qa assistant/, 'Framework', I],
    [/./, 'Framework', U],
  ],
  'mcp.test.ts': [
    [/^Claude Code started|^Cursor started|^sync with Cursor|^service:|^an operation run|^the IDE Companion|^probe/, 'MCP servers', I],
    [/./, 'MCP servers', U],
  ],
  'companion.test.ts': [[/./, 'IDE: context and MCP server', I]],
  'companion-api.test.ts': [[/./, 'IDE: panel API', I]],
  'tags.test.ts': [[/./, 'Tags', U]],
  'tool-path.test.ts': [[/./, 'Finding the AI tools', U]],
  'md-comments.test.ts': [[/./, 'Rendering', U]],
  'pdf-local.test.ts': [[/./, 'PDF (PdfCraft)', U]],
  'usage.test.ts': [[/./, 'Status bar usage', U]],
  'i18n.test.ts': [[/./, 'Translations', U]],
  'icon-font.test.mjs': [[/./, 'IDE icon', U]],
  'wiki.test.mjs': [[/./, 'Documentation', U]],
};

const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1');
const cell = (s) => s.replace(/\|/g, '\\|');

function scan(rel) {
  const lines = readFileSync(join(root, rel), 'utf8').split('\n');
  const out = [];
  let block = '';
  lines.forEach((line, i) => {
    const d = line.match(DESCRIBE);
    if (d) { block = unescape(d[2]); return; }
    const m = line.match(TITLE);
    if (!m) return;
    const skip = m[1] ? 'skipped' : /skip:\s*process\.platform === 'win32'/.test(m[4]) ? 'skipped on Windows' : '';
    out.push({ title: unescape(m[3]), line: i + 1, block, skip });
  });
  return out;
}

const rows = [];
for (const file of readdirSync(join(root, 'tests')).filter((f) => /\.test\.(ts|mjs)$/.test(f)).sort()) {
  const rules = RULES[file];
  if (!rules) throw new Error(`tests/${file}: add its rules to scripts/test-catalog.mjs`);
  for (const t of scan(`tests/${file}`)) {
    const rule = rules.find(([re]) => re.test(t.title));
    if (!rule) throw new Error(`tests/${file}:${t.line}: no rule classifies "${t.title}"`);
    rows.push({ ...t, file: `tests/${file}`, area: rule[1], kind: rule[2] });
  }
}
// Interface tests: their area is their describe block ("Moki settings" -> "Settings (UI)"), so it never shares a name with a code area.
const blockName = (b) => { const n = b.replace(/^Moki /, ''); return `${n.charAt(0).toUpperCase()}${n.slice(1)} (UI)`; };
for (const t of scan('tests/ui/app.spec.ts')) rows.push({ ...t, file: 'tests/ui/app.spec.ts', area: blockName(t.block), kind: 'Interface' });

// Areas in reading order: the app's main objects first, then the IDE, then the framework and tooling.
const ORDER = ['Projects', 'Files and confinement', 'Open with', 'PDF (PdfCraft)', 'Notes', 'Rendering', 'Search', 'Workspaces', 'Tags', 'Launching AI tools', 'Activities and runs', 'Agents', 'Multi-agent operations', 'Skills and set up', 'Linked folder', 'MCP servers', 'App bridge (IPC)', 'Installer', 'Status bar usage', 'Translations', 'IDE: panel API', 'IDE: context and MCP server', 'IDE icon', 'Framework', 'Documentation'];
const rank = (a) => { const i = ORDER.indexOf(a); return i < 0 ? ORDER.length : i; };

const count = (key) => Object.entries(rows.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] ?? 0) + 1 }), {}));
const link = (r) => `[${r.file.replace('tests/', '')}:${r.line}](../${r.file}#L${r.line})`;
const table = (list) => ['| # | Scenario | Kind | Where |', '|---|---|---|---|',
  ...list.map((r, i) => `| ${i + 1} | ${cell(r.title)}${r.skip ? ` *(${r.skip})*` : ''} | ${r.kind} | ${link(r)} |`)].join('\n');

const areasOf = (kind) => [...new Set(rows.filter((r) => (kind === 'Interface') === (r.kind === 'Interface')).map((r) => r.area))].sort((a, b) => rank(a) - rank(b));
const areas = [...areasOf('code'), ...areasOf('Interface')];
const anchor = (a) => a.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
const section = (a) => [`### ${a}`, '', table(rows.filter((r) => r.area === a)), ''];
const doc = [
  '# Test catalog',
  '',
  `Every automated test scenario of Moki, one row each: ${rows.length} scenarios. The scenario is the test's title, which says the behaviour it checks. How the suites run and how tests are written: [Automated tests](testing.md).`,
  '',
  '> Generated by `npm run test-catalog` from the test files; do not edit by hand. Run it again after adding or renaming a test.',
  '',
  '## Totals',
  '',
  '| Kind | Scenarios |', '|---|---|', ...count('kind').map(([k, n]) => `| ${k} | ${n} |`),
  '',
  '| Area | Unit | Integration | Interface |', '|---|---|---|---|', ...areas.map((a) => `| [${a}](#${anchor(a)}) | ${['Unit', 'Integration', 'Interface'].map((k) => rows.filter((r) => r.area === a && r.kind === k).length || '').join(' | ')} |`),
  '',
  '## Unit and integration tests', '', 'Run with `npm test`.', '',
  ...areasOf('code').flatMap(section),
  '## Interface tests', '', 'Run with `npm run test:ui`. Each area is a block of `tests/ui/app.spec.ts`; its scenarios run in order on the same window.', '',
  ...areasOf('Interface').flatMap(section),
].join('\n');

writeFileSync(join(root, 'docs', 'test-catalog.md'), doc);
console.log(`docs/test-catalog.md: ${rows.length} scenarios in ${areas.length} areas`);
