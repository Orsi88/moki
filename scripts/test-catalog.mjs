// Writes docs/test-catalog.md (and docs/pt-BR/test-catalog.md): one row per automated test scenario, read from the test files
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
  'activities.test.ts': [[/^service:|^launching:/, 'Activities', I], [/./, 'Activities', U]],
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
const ORDER = ['Projects', 'Files and confinement', 'Open with', 'PDF (PdfCraft)', 'Notes', 'Rendering', 'Search', 'Workspaces', 'Tags', 'Launching AI tools', 'Finding the AI tools', 'Activities', 'Activities and runs', 'Agents', 'Multi-agent operations', 'Skills and set up', 'Linked folder', 'MCP servers', 'App bridge (IPC)', 'Installer', 'Status bar usage', 'Translations', 'IDE: panel API', 'IDE: context and MCP server', 'IDE icon', 'Framework', 'Documentation'];
const rank = (a) => { const i = ORDER.indexOf(a); return i < 0 ? ORDER.length : i; };

// The texts of the page in each language; the scenarios stay as the test titles (English, as in the code).
const TEXT = {
  en: {
    out: 'docs/test-catalog.md', up: '../', title: 'Test catalog',
    intro: (n) => `Every automated test scenario of Moki, one row each: ${n} scenarios. The scenario is the test's title, which says the behaviour it checks. How the suites run and how tests are written: [Automated tests](testing.md).`,
    generated: '> Generated by `npm run test-catalog` from the test files; do not edit by hand. Run it again after adding or renaming a test.',
    totals: 'Totals', kind: 'Kind', scenarios: 'Scenarios', area: 'Area', scenario: 'Scenario', where: 'Where',
    kinds: { Unit: 'Unit', Integration: 'Integration', Interface: 'Interface' },
    code: 'Unit and integration tests', codeRun: 'Run with `npm test`.',
    ui: 'Interface tests', uiRun: 'Run with `npm run test:ui`. Each area is a block of `tests/ui/app.spec.ts`; its scenarios run in order on the same window.',
    skip: { skipped: 'skipped', 'skipped on Windows': 'skipped on Windows' },
    areas: {},
  },
  pt: {
    out: 'docs/pt-BR/test-catalog.md', up: '../../', title: 'Catálogo de testes',
    intro: (n) => `Todos os cenários de teste automatizado do Moki, um por linha: ${n} cenários. O cenário é o título do teste, que diz o comportamento verificado; os títulos vêm de \`docs/pt-BR/test-scenarios.json\` (o original, em inglês, está no código). Como as suítes rodam e como os testes são escritos: [Testes automatizados](testing.md).`,
    generated: '> Gerado pelo `npm run test-catalog` a partir dos arquivos de teste; não edite à mão. Rode de novo depois de criar ou renomear um teste.',
    totals: 'Totais', kind: 'Tipo', scenarios: 'Cenários', area: 'Área', scenario: 'Cenário', where: 'Onde',
    kinds: { Unit: 'Unidade', Integration: 'Integração', Interface: 'Interface' },
    code: 'Testes de unidade e de integração', codeRun: 'Rodam com `npm test`.',
    ui: 'Testes de interface', uiRun: 'Rodam com `npm run test:ui`. Cada área é um bloco de `tests/ui/app.spec.ts`; os cenários dela rodam em ordem, na mesma janela.',
    skip: { skipped: 'pulado', 'skipped on Windows': 'pulado no Windows' },
    areas: {
      Projects: 'Projetos', 'Files and confinement': 'Arquivos e confinamento', 'Open with': 'Abrir com', 'PDF (PdfCraft)': 'PDF (PdfCraft)',
      Notes: 'Notas', Rendering: 'Renderização', Search: 'Busca', Workspaces: 'Workspaces', Tags: 'Tags', 'Launching AI tools': 'Abrir as ferramentas de IA',
      'Activities and runs': 'Atividades e execuções', Agents: 'Agentes', 'Multi-agent operations': 'Operações multiagente', 'Skills and set up': 'Skills e configuração',
      'Linked folder': 'Pasta vinculada', 'MCP servers': 'Servidores MCP', 'App bridge (IPC)': 'Ponte do app (IPC)', Installer: 'Instalador',
      'Status bar usage': 'Uso na barra de status', Translations: 'Traduções', 'IDE: panel API': 'IDE: API do painel', 'IDE: context and MCP server': 'IDE: contexto e servidor MCP',
      'IDE icon': 'Ícone da IDE', Framework: 'Framework', Documentation: 'Documentação',
      'Settings (UI)': 'Configurações (UI)', 'Tags (UI)': 'Tags (UI)', 'Workspaces (UI)': 'Workspaces (UI)', 'Project tree (UI)': 'Árvore do projeto (UI)',
      'Operations in a project (UI)': 'Operações num projeto (UI)', 'Terminals outlive the project screen (UI)': 'Terminais que continuam fora do projeto (UI)',
      'MCP servers list (UI)': 'Lista de servidores MCP (UI)', 'PDF comments (UI)': 'Comentários em PDF (UI)',
      'Finding the AI tools': 'Encontrar as ferramentas de IA', Activities: 'Atividades', 'Activities (UI)': 'Atividades (UI)',
    },
  },
};

// The Portuguese titles of the scenarios (title in the code -> translation); one missing shows in English, with a warning.
const PT = JSON.parse(readFileSync(join(root, 'docs', 'pt-BR', 'test-scenarios.json'), 'utf8'));
const missing = rows.filter((r) => !PT[r.title]).map((r) => r.title);

// GitHub's heading anchors: lower case, letters (accented too), digits, spaces as hyphens.
const anchor = (a) => a.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-');
const areasOf = (ui) => [...new Set(rows.filter((r) => (r.kind === 'Interface') === ui).map((r) => r.area))].sort((a, b) => rank(a) - rank(b));
const areas = [...areasOf(false), ...areasOf(true)];

function render(lang) {
  const tx = TEXT[lang];
  const name = (a) => tx.areas[a] ?? a;
  const scenario = (title) => (lang === 'pt' ? PT[title] ?? title : title);
  const link = (r) => `[${r.file.replace('tests/', '')}:${r.line}](${tx.up}${r.file}#L${r.line})`;
  const table = (list) => [`| # | ${tx.scenario} | ${tx.kind} | ${tx.where} |`, '|---|---|---|---|',
    ...list.map((r, i) => `| ${i + 1} | ${cell(scenario(r.title))}${r.skip ? ` *(${tx.skip[r.skip] ?? r.skip})*` : ''} | ${tx.kinds[r.kind]} | ${link(r)} |`)].join('\n');
  const section = (a) => [`### ${name(a)}`, '', table(rows.filter((r) => r.area === a)), ''];
  const kinds = ['Unit', 'Integration', 'Interface'];
  return [
    `# ${tx.title}`, '',
    tx.intro(rows.length), '',
    tx.generated, '',
    `## ${tx.totals}`, '',
    `| ${tx.kind} | ${tx.scenarios} |`, '|---|---|', ...kinds.map((k) => `| ${tx.kinds[k]} | ${rows.filter((r) => r.kind === k).length} |`), '',
    `| ${tx.area} | ${kinds.map((k) => tx.kinds[k]).join(' | ')} |`, '|---|---|---|---|',
    ...areas.map((a) => `| [${name(a)}](#${anchor(name(a))}) | ${kinds.map((k) => rows.filter((r) => r.area === a && r.kind === k).length || '').join(' | ')} |`), '',
    `## ${tx.code}`, '', tx.codeRun, '',
    ...areasOf(false).flatMap(section),
    `## ${tx.ui}`, '', tx.uiRun, '',
    ...areasOf(true).flatMap(section),
  ].join('\n');
}

if (missing.length) console.warn(`Translate in docs/pt-BR/test-scenarios.json (shown in English meanwhile):\n${missing.map((t) => `  ${t}`).join('\n')}`);
for (const lang of Object.keys(TEXT)) writeFileSync(join(root, TEXT[lang].out), render(lang));
console.log(`docs/test-catalog.md and docs/pt-BR/test-catalog.md: ${rows.length} scenarios in ${areas.length} areas`);
