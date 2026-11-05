import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, symlinkSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { spawnSync } from 'node:child_process';
import { callService, createService, ServiceError, type FileContent, type TreeNode } from '../desktop/service.ts';
import { PathError, resolveInside, isEditable, isOpenable } from '../desktop/fs-guard.ts';
import { launchInTerminal, pluginArgs, scriptFor, windowsStartArgs, type LaunchResult } from '../desktop/launcher.ts';
import type { TermSpec } from '../desktop/terminals.ts';
import { parseGioMime } from '../desktop/open-with.ts';
import { parsePdfChange, pdfcraftCandidates, pdfScript, toComments, type PdfChange, type PdfStep } from '../desktop/pdfcraft.ts';
import { selectionMarks, selectionNote, stackCards } from '../app/src/pdf-quads.ts';
import { docxToMarkdown, readableInputs } from '../scripts/lib/docx.ts';
import { frameworkTarget, syncFramework } from '../desktop/framework.ts';
import { noteKey, noteQuery, parseNoteRequest } from '../desktop/notes.ts';
import { remapPdfNotes, type PdfNote } from '../desktop/pdf-notes.ts';
import { markdownToHtml } from '../scripts/lib/markdown.mjs';
import { formatNumber } from '../scripts/lib/numfmt.mjs';
import { zip } from '../scripts/lib/zip.mjs';
import { buildXlsx } from '../scripts/xlsx.mjs';
import { ROOT } from '../scripts/lib/repo.mjs';
import { CRAFT_APPS, craftAssetEndings, createProject, installPlan, linuxPackageFamily, pickCraftAssets, slugify, TOOLS, windowsSafePrompt, type ToolKey } from '../scripts/lib/core.ts';

// Fixture: a framework root with a few skills, the project template and one project.
const root = mkdtempSync(join(tmpdir(), 'qa-desktop-'));
const RUN = '20261020-0900-failure-analysis-x';
const launched: { tool: ToolKey; prompt: string; plugins?: string[] }[] = [];
const folders: string[] = [];
const opened: string[] = [];
let service: ReturnType<typeof createService>;

function makeDocx(): Buffer {
  const p = (text: string, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const cell = (text: string) => `<w:tc>${p(text)}</w:tc>`;
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${p('US-1 Renovação', 'Heading1')}${p('Item A', 'ListBullet')}`
    + `<w:tbl><w:tr>${cell('AC')}${cell('Rule')}</w:tr><w:tr>${cell('AC1')}${cell('a | b &amp; c')}</w:tr></w:tbl>${p('Fim')}`
    + '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>na caixa</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r>'
    + '<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>na caixa</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback><w:r><w:t>depois</w:t></w:r></w:p></w:body></w:document>';
  return zip([['word/document.xml', xml]]);
}

before(() => {
  for (const s of ['failure-analysis', 'automation', 'project-context', 'requirements-review']) {
    cpSync(join(ROOT, 'skills', s), join(root, 'skills', s), { recursive: true });
  }
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  cpSync(join(ROOT, 'activities'), join(root, 'activities'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
  createProject('acme', 'Acme', root);
  const project = join(root, 'workspace', 'projects', 'acme');
  mkdirSync(join(project, 'runs', RUN, 'outputs'), { recursive: true });
  writeFileSync(join(project, 'runs', RUN, 'state.json'), JSON.stringify({ status: 'awaiting-approval', currentStep: 'interview', skill: 'failure-analysis' }));
  writeFileSync(join(project, 'runs', RUN, 'outputs', 'report.md'), '# Report\n\nSee [the story](../../../inbox/us-1.md).');
  writeFileSync(join(project, 'inbox', 'us-1.md'), '# US-1');
  writeFileSync(join(project, 'inbox', 'report.pdf'), '%PDF-1.4');
  writeFileSync(join(project, 'inbox', 'page.html'), '<h1>Page</h1>');
  writeFileSync(join(project, 'inbox', 'us-2.docx'), makeDocx());
  writeFileSync(join(project, 'inbox', 'cases.xlsx'), zip([
    ['xl/workbook.xml', '<workbook><sheets><sheet name="Cases" r:id="rId1"/><sheet name="Empty" state="hidden" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>'],
    // Prefixed elements (as some .NET tools write), a phonetic guide and an escaped line break.
    ['xl/sharedStrings.xml', '<x:sst><x:si><x:t>Id</x:t><x:rPh><x:t>ID</x:t></x:rPh></x:si><x:si><x:r><x:t>Renova</x:t></x:r><x:r><x:t>&amp;ção_x000D_</x:t></x:r></x:si></x:sst>'],
    ['xl/styles.xml', '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="10"/><xf numFmtId="0"><alignment horizontal="centerContinuous" vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>'],
    // An empty hidden row written as <row/> must not take the next row's cells.
    ['xl/worksheets/sheet1.xml', '<cols><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="9" hidden="1"/></cols>'
      + '<sheetData><row r="1"><c r="A1" s="3" t="s"><v>0</v></c><c r="F1" s="1"/></row><row r="2" hidden="1"/><row r="3"><c r="B3" t="s"><v>1</v></c><c r="C3"><v>42</v></c>'
      + '<c r="E3" t="inlineStr"><is><t>00123</t></is></c><c r="D3" t="b"><v>1</v></c><c r="F3" s="1"><v>46319</v></c><c r="G3" s="2"><v>0.875</v></c><c r="H3"><f>SUM(C3:C3)</f></c></row>'
      + '<row r="1048576"><c r="A1048576" s="1"/></row></sheetData><mergeCells><mergeCell ref="A1:B2"/><mergeCell ref="A5000:C5001"/></mergeCells><drawing r:id="rId9"/>'],
    ['xl/worksheets/sheet2.xml', '<sheetData/>'],
  ]));
  writeFileSync(join(project, 'inbox', 'tool.exe'), 'MZ');
  writeFileSync(join(root, 'secret.txt'), 'outside');
  service = createService(root, {
    launch: (tool, prompt, _root, plugins): LaunchResult => { launched.push({ tool, prompt, plugins }); return { opened: true, message: 'fake' }; },
    openFolder: (f) => { folders.push(f); },
    openPath: (f) => { opened.push(f); },
  });
});

after(() => rmSync(root, { recursive: true, force: true }));

const flatten = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);

test('projects and project creation', () => {
  assert.deepEqual(service.projects().map((p) => p.id), ['acme']);
  const created = service.createProject('Billing Portal — Fase 2');
  assert.equal(created.id, 'billing-portal-fase-2');
  assert.equal(created.name, 'Billing Portal — Fase 2');
  assert.ok(existsSync(join(root, 'workspace', 'projects', 'billing-portal-fase-2', 'context', 'index.md')));
  assert.throws(() => service.createProject('Billing Portal — Fase 2'), /already exists/);
  assert.throws(() => service.createProject('   '), ServiceError);
  assert.equal(slugify('Ação & Crítica!'), 'acao-critica');
});

test('deleting a project needs the word "delete" and removes only its folder', () => {
  const linked = mkdtempSync(join(tmpdir(), 'qa-linked-'));
  writeFileSync(join(linked, 'keep.txt'), 'x');
  service.createProject('Doomed');
  const dir = join(root, 'workspace', 'projects', 'doomed');
  const file = join(dir, 'project.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), repository: linked }));
  for (const word of ['', 'Delete', 'excluir', 'delete ']) assert.throws(() => service.deleteProject('doomed', word), /Type delete/);
  assert.ok(existsSync(dir));
  assert.throws(() => service.deleteProject('../doomed', 'delete'), /Unknown project/);
  assert.equal(service.deleteProject('doomed', 'delete'), true);
  assert.ok(!existsSync(dir));
  assert.ok(existsSync(join(linked, 'keep.txt')), 'the linked folder stays');
  assert.ok(!service.projects().some((p) => p.id === 'doomed'));
  rmSync(linked, { recursive: true, force: true });
});

test('tree lists the project, hides dot files and annotates activities', () => {
  const tree = service.tree('acme');
  assert.deepEqual(tree.slice(0, 3).map((n) => n.name), ['context', 'inbox', 'runs']);
  const all = flatten(tree);
  assert.equal(all.some((n) => n.name.startsWith('.')), false);
  const run = all.find((n) => n.path === `runs/${RUN}`);
  assert.equal(run?.run?.status, 'awaiting-approval');
  assert.throws(() => service.tree('../..'), /Unknown project/);
});

test('readFile renders each kind of file', () => {
  const md = service.readFile('acme', `runs/${RUN}/outputs/report.md`) as Extract<FileContent, { kind: 'markdown' }>;
  assert.equal(md.kind, 'markdown');
  assert.match(md.html, /<h1>Report<\/h1>/);
  assert.equal(service.readFile('acme', 'project.json').kind, 'json');
  const docx = service.readFile('acme', 'inbox/us-2.docx') as Extract<FileContent, { kind: 'docx' }>;
  assert.match(docx.html, /US-1 Renovação/);
  const xlsx = service.readFile('acme', 'inbox/cases.xlsx') as Extract<FileContent, { kind: 'xlsx' }>;
  assert.deepEqual(xlsx.sheets, [
    { name: 'Cases', hidden: false, drawing: true, merges: [[0, 0, 1, 1]], truncated: false,
      widths: [64, 140, 63, 64, 64, 64, 64, 64], hiddenRows: [1], hiddenCols: [2], align: { '0:0': { h: 'center', v: 'middle', wrap: true } }, rows: [['Id'], [], ['', 'Renova&ção\r', { n: '42' }, 'TRUE', '00123', { n: '24/10/2026' }, { n: formatNumber(0.875, '0.00%') }, '=SUM(C3:C3)']] }, // the app uses the system locale
    { name: 'Empty', hidden: true, drawing: false, merges: [], truncated: false, widths: [], hiddenRows: [], hiddenCols: [], align: {}, rows: [] },
  ]);
  assert.deepEqual(service.readFile('acme', 'inbox/report.pdf'), { kind: 'pdf', path: 'inbox/report.pdf', data: Buffer.from('%PDF-1.4').toString('base64') });
  assert.deepEqual(service.readFile('acme', 'inbox/page.html'), { kind: 'html', path: 'inbox/page.html', text: '<h1>Page</h1>' });
  const exe = service.readFile('acme', 'inbox/tool.exe') as Extract<FileContent, { kind: 'binary' }>;
  assert.equal(exe.kind, 'binary');
  assert.equal(exe.openable, false);
});

test('file access never leaves the project folder', () => {
  for (const p of ['../../../secret.txt', '..\\..\\..\\secret.txt', 'C:\\Windows\\win.ini', '/etc/passwd', 'a\0b']) {
    assert.throws(() => service.readFile('acme', p), ServiceError, p);
  }
  assert.throws(() => service.readFile('ghost', 'project.json'), /Unknown project/);
});

test('editing is limited to existing Markdown/text files', () => {
  const saved = service.writeFile('acme', 'context/glossary.md', '# Glossary\n\n| Term | Meaning |') as Extract<FileContent, { kind: 'markdown' }>;
  assert.match(saved.text, /Term/);
  assert.throws(() => service.writeFile('acme', 'project.json', '{}'), /Only Markdown and text/);
  assert.throws(() => service.writeFile('acme', 'context/new.md', 'x'), /not found/);
  assert.throws(() => service.writeFile('acme', '../../../secret.txt', 'x'), ServiceError);
});

test('notes: the section is always listed and new notes get unique names', () => {
  assert.ok(service.tree('acme').some((n) => n.path === 'notes' && n.type === 'dir'));
  assert.equal(service.createNote('acme', 'Ideias de teste', 'a'), 'notes/ideias-de-teste.md');
  assert.equal(service.createNote('acme', 'Ideias de teste', 'b'), 'notes/ideias-de-teste-2.md');
  assert.equal((service.readFile('acme', 'notes/ideias-de-teste-2.md') as Extract<FileContent, { kind: 'markdown' }>).text, 'b');
  assert.throws(() => service.createNote('acme', '../..', 'x'), /title/);
});

test('PDF note associations stay in the project, follow pages and reject invalid paths', () => {
  const note = service.createNote('acme', 'Nota intercalada', 'original');
  const entry: PdfNote = { id: 'a1111111-1111-4111-8111-111111111111', after: 2, note: { path: note } };
  assert.deepEqual(service.pdfNotes('acme', 'inbox/report.pdf'), []);
  service.setPdfNotes('acme', 'inbox/report.pdf', [entry]);
  assert.deepEqual(service.pdfNotes('acme', 'inbox/report.pdf'), [entry]);
  const colored = { ...entry, color: 'green' };
  service.setPdfNotes('acme', 'inbox/report.pdf', [colored]);
  assert.deepEqual(service.pdfNotes('acme', 'inbox/report.pdf'), [colored]);
  assert.equal(remapPdfNotes([colored], { op: 'move-page', page: 2, to: 1 })[0].color, 'green');
  assert.throws(() => service.setPdfNotes('acme', 'inbox/report.pdf', [{ ...entry, color: 'invalid' }]), /Invalid/);
  assert.equal(remapPdfNotes([entry], { op: 'insert-blank', at: 1 })[0].after, 3);
  assert.equal(remapPdfNotes([entry], { op: 'move-page', page: 2, to: 1 })[0].after, 1);
  assert.equal(remapPdfNotes([entry], { op: 'delete-pages', pages: [1, 2] })[0].after, 0);
  assert.throws(() => service.setPdfNotes('acme', 'inbox/report.pdf', [{ ...entry, note: { path: 'notes/../../secret.md' } }]), /Invalid/);
  assert.throws(() => service.pdfNotes('acme', '../../secret.txt'), ServiceError);
  assert.equal(service.writeNoteIfUnchanged('acme', note, 'first editor', 'original'), true);
  assert.equal(service.writeNoteIfUnchanged('acme', note, 'stale editor', 'original'), false);
  assert.equal((service.readFile('acme', note) as Extract<FileContent, { kind: 'markdown' }>).text, 'first editor');
  assert.equal(service.setNoteTitle('acme', note, 'Nota revisada'), true);
  assert.deepEqual(service.noteTitles('acme').find((item) => item.path === note), { path: note, title: 'Nota revisada' });
  assert.equal((service.readFile('acme', note) as Extract<FileContent, { kind: 'markdown' }>).text, 'first editor');
  assert.throws(() => service.setNoteTitle('acme', '../secret.txt', 'bad'), ServiceError);
  assert.throws(() => service.writeNoteIfUnchanged('acme', '../secret.txt', 'x', 'y'), ServiceError);
});

test('notes: one is deleted from the start screen; nothing outside notes/ is', async () => {
  const rel = service.createNote('acme', 'Para apagar', 'x');
  assert.equal(await service.deleteNote('acme', rel), true);
  assert.ok(!existsSync(join(root, 'workspace', 'projects', 'acme', rel)));
  await assert.rejects(service.deleteNote('acme', rel), /no longer exists/);
  await assert.rejects(service.deleteNote('acme', 'project.json'), /Only notes/);
  await assert.rejects(service.deleteNote('acme', 'notes/../project.json'), /Only notes|outside/i);
});

test('notes: a selection of a PDF becomes a note titled by file and page, with its source', () => {
  const n = selectionNote('inbox/Relatório final.pdf', [{ page: 3, quads: [[10, 20, 50, 20, 10, 30, 50, 30], [12, 32, 40, 32, 12, 42, 40, 42]] }, { page: 4, quads: [[1, 1, 2, 1, 1, 2, 2, 2]] }], 'linha um\nlinha dois');
  assert.equal(n.title, 'Relatório final p3');
  assert.equal(slugify(n.title), 'relatorio-final-p3');
  assert.equal(n.text, '> linha um\n> linha dois\n\nSource: [@Relatório final.pdf](inbox/Relatório final.pdf) · page 3 · rect [10, 20, 50, 42] pt\n');
  assert.equal(service.createNote('acme', n.title, n.text), 'notes/relatorio-final-p3.md');
});

test('notes: exported as md, txt and pdf to the file the save dialog returns; nothing else is exported', async (t) => {
  const rel = service.createNote('acme', 'Exportar', '# Exportar\n\n![foto](data:image/png;base64,AAAA) fim');
  const out = mkdtempSync(join(tmpdir(), 'moki-export-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  let name = '', ext = '', answer: string | null = null;
  const exporter = createService(root, { launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {}, saveFile: async (n, e) => { name = n; ext = e; return answer; } });
  answer = join(out, 'a');
  assert.equal(await exporter.exportNote('acme', rel, 'md'), join(out, 'a.md'));
  assert.deepEqual([name, ext], ['exportar', 'md']);
  assert.match(readFileSync(join(out, 'a.md'), 'utf8'), /data:image\/png/);
  answer = join(out, 'b.txt');
  await exporter.exportNote('acme', rel, 'txt');
  assert.equal(readFileSync(join(out, 'b.txt'), 'utf8'), '# Exportar\n\n[foto] fim');
  answer = null;
  assert.equal(await exporter.exportNote('acme', rel, 'md'), null, 'cancelled dialog');
  await assert.rejects(exporter.exportNote('acme', 'project.json', 'md'), /Only notes/);
  await assert.rejects(exporter.exportNote('acme', 'notes/../project.json', 'md'), /Only notes/);
  await assert.rejects(exporter.exportNote('acme', 'notes/a/b.md', 'md'), /Only notes/);
  await assert.rejects(exporter.exportNote('acme', rel, 'docx'), /PDF, Markdown/);
  await assert.rejects(service.exportNote('acme', rel, 'md'), /not available here/);
  assert.deepEqual(readdirSync(join(root, 'workspace', 'projects', 'acme', 'notes')).filter((f) => !f.endsWith('.md')), [], 'no export lands in notes/');
  if (process.platform === 'win32') return;
  // pdf: a fake browser writes the file --print-to-pdf asks for; without a browser the error says so
  const saved = process.env.QA_AGENTS_BROWSER, path = process.env.PATH;
  t.after(() => { if (saved === undefined) delete process.env.QA_AGENTS_BROWSER; else process.env.QA_AGENTS_BROWSER = saved; process.env.PATH = path; });
  if (!existsSync(join(root, 'scripts'))) cpSync(join(ROOT, 'scripts'), join(root, 'scripts'), { recursive: true }); // the framework folder has scripts/pdf.mjs
  const fake = join(out, 'fake-browser.sh');
  writeFileSync(fake, '#!/bin/sh\nfor a in "$@"; do case "$a" in --print-to-pdf=*) printf %s %PDF-fake > "${a#--print-to-pdf=}";; esac; done\n');
  chmodSync(fake, 0o755);
  process.env.QA_AGENTS_BROWSER = fake;
  answer = join(out, 'c.pdf');
  assert.equal(await exporter.exportNote('acme', rel, 'pdf'), join(out, 'c.pdf'));
  assert.equal(readFileSync(join(out, 'c.pdf'), 'utf8'), '%PDF-fake');
  assert.deepEqual(readdirSync(out).filter((f) => f.endsWith('.html')), [], 'no html next to the pdf');
  delete process.env.QA_AGENTS_BROWSER;
  process.env.PATH = '';
  if (!existsSync('/Applications/Google Chrome.app')) await assert.rejects(exporter.exportNote('acme', rel, 'pdf'), /No Edge, Chrome or Chromium/);
});

test('MCPs: the last section lists the servers configured where the AI tools start', () => {
  writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { jira: {}, playwright: {} } }));
  mkdirSync(join(root, '.codex'), { recursive: true });
  writeFileSync(join(root, '.codex', 'config.toml'), '[mcp_servers.github]\ncommand = "x"\n');
  const mcps = service.tree('acme').at(-1);
  assert.equal(mcps?.name, 'MCPs');
  assert.deepEqual(mcps?.children?.filter((c) => c.mcp === '.mcp.json').map((c) => c.name), ['jira', 'playwright']);
  assert.deepEqual(mcps?.children?.filter((c) => c.mcp === '.codex/config.toml').map((c) => c.name), ['github']);
  rmSync(join(root, '.mcp.json'));
  rmSync(join(root, '.codex'), { recursive: true });
});

test('files dropped on the workspace are copied into the inbox and stay there', () => {
  const outside = join(root, 'dropped-story.md');
  writeFileSync(outside, '# dropped');
  const folder = join(root, 'dropped-folder');
  mkdirSync(folder, { recursive: true });
  const first = service.importFiles('acme', [outside, folder, 'relative.md', join(root, 'missing.txt')]);
  assert.deepEqual(first.saved, ['inbox/dropped-story.md']);
  assert.deepEqual(first.skipped.sort(), ['dropped-folder', 'missing.txt', 'relative.md']);
  assert.equal(readFileSync(join(root, 'workspace', 'projects', 'acme', 'inbox', 'dropped-story.md'), 'utf8'), '# dropped');
  assert.ok(service.tree('acme').some((n) => n.path === 'inbox' && n.children?.some((c) => c.path === 'inbox/dropped-story.md')));
  const again = service.importFiles('acme', [outside]);
  assert.deepEqual(again.saved, ['inbox/dropped-story-1.md']);
  assert.equal(readFileSync(join(root, 'workspace', 'projects', 'acme', 'inbox', 'dropped-story-1.md'), 'utf8'), '# dropped');
  assert.throws(() => service.importFiles('acme', []), /Drop files/);
  assert.throws(() => service.importFiles('nope', [outside]), /Unknown project/);
  assert.throws(() => service.importFiles('acme', [outside, 1]), /Drop files/);
});

test('open folder / open with default program are confined and filtered', () => {
  service.openFolder('acme', 'inbox');
  assert.ok(folders[0].endsWith(join('acme', 'inbox')));
  assert.throws(() => service.openFolder('acme', '../..'), ServiceError);
  service.openExternal('acme', 'inbox/us-1.md');
  assert.equal(opened.length, 1);
  assert.throws(() => service.openExternal('acme', 'inbox/tool.exe'), /not opened from the app/);
});

test('new files and folders: Markdown, text, empty spreadsheet and Word files, safe names, never inside activities', () => {
  const project = join(root, 'workspace', 'projects', 'acme');
  assert.equal(service.createEntry('acme', 'inbox', 'cenarios login', 'file'), 'inbox/cenarios login.md');
  assert.equal(readFileSync(join(project, 'inbox', 'cenarios login.md'), 'utf8'), '');
  assert.equal(service.createEntry('acme', 'inbox', 'notas.txt', 'file'), 'inbox/notas.txt');
  assert.equal(service.createEntry('acme', '', 'sprint-12', 'folder'), 'sprint-12');
  assert.equal(service.createEntry('acme', 'sprint-12', 'casos', 'file'), 'sprint-12/casos.md');
  assert.ok(existsSync(join(project, 'sprint-12', 'casos.md')));
  assert.throws(() => service.createEntry('acme', 'inbox', 'cenarios login.md', 'file'), /already exists/);
  // Spreadsheets and Word documents are created empty and valid: the app reads them back.
  assert.equal(service.createEntry('acme', 'inbox', 'planilha.xlsx', 'file'), 'inbox/planilha.xlsx');
  const sheet = service.readFile('acme', 'inbox/planilha.xlsx');
  assert.equal(sheet.kind, 'xlsx');
  if (sheet.kind === 'xlsx') assert.deepEqual(sheet.sheets.map((x) => [x.name, x.rows.length]), [['Sheet1', 0]]);
  assert.equal(service.createEntry('acme', 'inbox', 'relatorio.docx', 'file'), 'inbox/relatorio.docx');
  assert.equal(service.readFile('acme', 'inbox/relatorio.docx').kind, 'docx');
  rmSync(join(project, 'inbox', 'planilha.xlsx')); rmSync(join(project, 'inbox', 'relatorio.docx'));
  assert.throws(() => service.createEntry('acme', 'inbox', 'imagem.png', 'file'), /Only Markdown/);
  for (const bad of ['', '../fora', 'a/b', 'a\\b', '.oculto', 'nome.', 'con', 'x:y', 'a*b']) {
    assert.throws(() => service.createEntry('acme', 'inbox', bad, 'file'), ServiceError, bad);
  }
  assert.throws(() => service.createEntry('acme', 'runs', 'x', 'folder'), /Activities/);
  assert.throws(() => service.createEntry('acme', `runs/${RUN}`, 'x', 'file'), /Activities/);
  assert.throws(() => service.createEntry('acme', '../..', 'x', 'folder'), ServiceError);
  assert.throws(() => service.createEntry('acme', 'inbox/us-1.md', 'x', 'folder'), /Folder not found/);
  assert.throws(() => service.createEntry('acme', 'inbox', 'x', 'link'), /Unknown kind/);
  rmSync(join(project, 'sprint-12'), { recursive: true });
  rmSync(join(project, 'inbox', 'cenarios login.md'));
  rmSync(join(project, 'inbox', 'notas.txt'));
});

test('where an item is on this computer: shown in its folder or its full path, inside the project only', () => {
  const project = join(root, 'workspace', 'projects', 'acme');
  const copied: string[] = [];
  const svc = createService(root, { ...noLaunch, copy: (text) => { copied.push(text); } });
  assert.equal(svc.copyPath('acme', 'inbox/us-1.md'), join(project, 'inbox', 'us-1.md'));
  assert.equal(svc.copyPath('acme', 'runs'), join(project, 'runs'));
  assert.deepEqual(copied, [join(project, 'inbox', 'us-1.md'), join(project, 'runs')]);
  assert.throws(() => service.copyPath('acme', 'runs'), /not available/);
  service.revealPath('acme', 'inbox/us-1.md');
  assert.equal(folders.at(-1), join(project, 'inbox'), 'without a file manager it opens the folder that holds the file');
  service.revealPath('acme', 'context');
  assert.equal(folders.at(-1), join(project, 'context'));
  for (const bad of ['../../secret.txt', 'inbox/missing.md']) {
    assert.throws(() => svc.copyPath('acme', bad), ServiceError);
    assert.throws(() => service.revealPath('acme', bad), ServiceError);
  }
  assert.throws(() => svc.copyPath('nope', 'inbox'), /Unknown project/);
});

test('"open with" lists the system programs and opens only with one of them', async () => {
  const opened: string[] = [];
  const calc = { id: 'calc.desktop', name: 'Calc', isDefault: true };
  const svc = createService(root, {
    launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {},
    appChooser: { dialog: false, apps: async () => [calc], open: async (_file, app) => { opened.push(app); } },
  });
  writeFileSync(join(root, 'workspace', 'projects', 'acme', 'inbox', 'sheet.xlsx'), 'x');
  assert.deepEqual(await svc.openWithApps('acme', 'inbox/sheet.xlsx'), { dialog: false, apps: [calc] });
  assert.equal(await svc.openWith('acme', 'inbox/sheet.xlsx', 'calc.desktop'), true);
  assert.deepEqual(opened, ['calc.desktop']);
  await assert.rejects(svc.openWith('acme', 'inbox/sheet.xlsx', '/usr/bin/sh'), /not offered/);
  await assert.rejects(svc.openWith('acme', 'inbox/sheet.xlsx', ''), /not offered/, 'no system dialog here');
  await assert.rejects(svc.openWithApps('acme', 'inbox/us-1.md'), /only for Excel, Word and PDF/);
  await assert.rejects(svc.openWithApps('acme', '../../sheet.xlsx'), ServiceError);
  await assert.rejects(service.openWithApps('acme', 'inbox/sheet.xlsx'), /not available/, 'no chooser given');
  assert.deepEqual(opened, ['calc.desktop']);
});

test('gio mime output: the default program, then the recommended ones', () => {
  const out = 'Default application for “application/vnd.ms-excel”: calc.desktop\nRegistered applications:\n\tcalc.desktop\n\torg.gnome.Nautilus.desktop\nRecommended applications:\n\tgrid.desktop\n\tcalc.desktop\n';
  assert.deepEqual(parseGioMime(out), { def: 'calc.desktop', ids: ['calc.desktop', 'grid.desktop'] });
  assert.deepEqual(parseGioMime('No default applications for “x”\nNo registered applications\nNo recommended applications\n'), { def: '', ids: [] });
  // Nothing recommended (seen for application/pdf): the registered ones.
  const pdf = 'Default application for “application/pdf”: papers.desktop\nRegistered applications:\n\tpdfcraft.desktop\n\tpapers.desktop\nRecommended applications:\n';
  assert.deepEqual(parseGioMime(pdf), { def: 'papers.desktop', ids: ['papers.desktop', 'pdfcraft.desktop'] });
});

test('PdfCraft scripts: open, change, save in place or to a copy, list', () => {
  const quad = [1, 2, 3, 2, 1, 4, 3, 4];
  assert.deepEqual(pdfScript('a.pdf', null, 'ana').map((s) => s.tool), ['doc_open', 'comment_list']);
  const find = pdfScript('a.pdf', { op: 'highlight', page: 2, find: 'prazo', all: true, contents: 'ver', color: 'green' }, 'ana');
  assert.deepEqual(find.map((s) => s.tool), ['doc_open', 'comment_add', 'doc_save', 'comment_list']);
  assert.deepEqual(find[1].args, { doc: 1, type: 'highlight', color: 'green', author: 'ana', contents: 'ver', page: 2, find: 'prazo', all: true });
  assert.deepEqual(find[2].args, { doc: 1 }, 'in place');
  const marks = pdfScript('a.pdf', { op: 'highlight', marks: [{ page: 1, quads: [quad] }, { page: 3, quads: [quad, quad] }], color: 'yellow' }, 'ana', 'inbox/a-edited.pdf');
  assert.deepEqual(marks.filter((s) => s.tool === 'comment_add').map((s) => [s.args.page, (s.args.quads as number[][]).length, 'contents' in s.args]), [[1, 1, false], [3, 2, false]]);
  assert.deepEqual(marks.at(-2)?.args, { doc: 1, path: 'inbox/a-edited.pdf' });
  assert.deepEqual(pdfScript('a.pdf', { op: 'reply', id: 'x', text: 'ok' }, 'ana')[1], { tool: 'comment_reply', args: { doc: 1, id: 'x', text: 'ok', author: 'ana' } });
  assert.deepEqual(pdfScript('a.pdf', { op: 'edit', id: 'x', contents: '' }, 'ana')[1], { tool: 'comment_edit', args: { doc: 1, id: 'x', contents: '' } });
  assert.deepEqual(pdfScript('a.pdf', { op: 'delete', id: 'x' }, 'ana')[1], { tool: 'comment_delete', args: { doc: 1, id: 'x' } });
  // Page edits: the same open → change → save → list.
  const edits: [PdfChange, PdfStep[]][] = [
    [{ op: 'rotate-pages', pages: [2], degrees: 90 }, [{ tool: 'page_rotate', args: { doc: 1, pages: [2], degrees: 90 } }]],
    [{ op: 'delete-pages', pages: [1, 3] }, [{ tool: 'page_delete', args: { doc: 1, pages: [1, 3] } }]],
    [{ op: 'move-page', page: 2, to: 1 }, [{ tool: 'page_move', args: { doc: 1, pages: [2], to: 1 } }]],
    [{ op: 'insert-blank', at: 4 }, [{ tool: 'page_insert_blank', args: { doc: 1, at: 4 } }]],
    [{ op: 'set-info', title: 'Título', author: '' }, [{ tool: 'doc_set_info', args: { doc: 1, key: 'Title', value: 'Título' } }, { tool: 'doc_set_info', args: { doc: 1, key: 'Author', value: '' } }]],
  ];
  for (const [change, middle] of edits) {
    const steps = pdfScript('a.pdf', change, 'ana');
    assert.deepEqual(steps.slice(1, -2), middle, change.op);
    assert.deepEqual(steps.slice(-2).map((x) => x.tool), ['doc_save', 'comment_list']);
  }
});

test('pdfcraft-cli off PATH: install folders on Windows, usual bin folders elsewhere', () => {
  const win = pdfcraftCandidates('win32', { LOCALAPPDATA: 'L', ProgramFiles: 'P' }, 'H');
  assert.deepEqual(win, [join('L', 'Programs', 'ArtCraft', 'PdfCraft', 'pdfcraft-cli.exe'), join('L', 'Programs', 'PdfCraft', 'pdfcraft-cli.exe'),
    join('P', 'ArtCraft', 'PdfCraft', 'pdfcraft-cli.exe'), join('P', 'PdfCraft', 'pdfcraft-cli.exe')]);
  assert.ok(pdfcraftCandidates('darwin', {}, 'H').includes(join('/opt/homebrew/bin', 'pdfcraft-cli')));
  assert.ok(pdfcraftCandidates('linux', {}, 'H').includes(join('H', '.local', 'bin', 'pdfcraft-cli')));
});

test('PDF changes from the UI are checked', () => {
  const quad = [1, 2, 3, 2, 1, 4, 3, 4];
  assert.deepEqual(parsePdfChange({ op: 'highlight', page: 1, find: 'a', color: 'teal' }), { op: 'highlight', page: 1, find: 'a', all: false, contents: undefined, color: 'yellow' });
  assert.equal((parsePdfChange({ op: 'highlight', marks: [{ page: 1, quads: [quad] }] }) as { marks: unknown[] }).marks.length, 1);
  for (const bad of [
    { op: 'highlight', page: 0, find: 'a' }, { op: 'highlight', page: 1.5, find: 'a' }, { op: 'highlight', page: 1, find: '  ' },
    { op: 'highlight', page: 1, find: 'x'.repeat(501) }, { op: 'highlight', marks: [{ page: 1, quads: [quad.slice(1)] }] },
    { op: 'highlight', marks: [{ page: 1, quads: [[...quad.slice(1), Number.NaN]] }] }, { op: 'highlight', marks: [] },
    { op: 'reply', id: 'x', text: '' }, { op: 'edit', id: '', contents: 'a' }, { op: 'delete' }, { op: 'render' }, null,
    { op: 'rotate-pages', pages: [1], degrees: 45 }, { op: 'rotate-pages', pages: [1], degrees: -90 }, { op: 'rotate-pages', pages: [], degrees: 90 },
    { op: 'delete-pages', pages: [1, 1] }, { op: 'delete-pages', pages: [0] }, { op: 'delete-pages', pages: Array.from({ length: 1001 }, (_, i) => i + 1) },
    { op: 'move-page', page: 1, to: 0 }, { op: 'insert-blank', at: 1.5 }, { op: 'set-info', title: 1, author: '' }, { op: 'set-info', title: 'x'.repeat(1001), author: '' },
  ]) assert.throws(() => parsePdfChange(bad), Error, JSON.stringify(bad));
  assert.deepEqual(parsePdfChange({ op: 'rotate-pages', pages: [3, 1], degrees: 270 }), { op: 'rotate-pages', pages: [3, 1], degrees: 270 });
  assert.deepEqual(parsePdfChange({ op: 'set-info', title: '', author: 'Ana' }), { op: 'set-info', title: '', author: 'Ana' });
  assert.deepEqual(toComments({ comments: [{ id: 'c', page: 2, type: 'highlight', author: 'ana', contents: 'x', color: '#ff0', rect: [10, 20, 110, 32], extra: 1, replies: [{ id: 'r', page: 2, contents: 'ok', rect: [1, 'x'] }] }, { no: 'id' }] }),
    [{ id: 'c', page: 2, type: 'highlight', author: 'ana', contents: 'x', color: '#ff0', rect: [10, 20, 110, 32], replies: [{ id: 'r', page: 2, type: '', author: null, contents: 'ok', color: null, rect: null, replies: [] }] }]);
});

test('the comment cards beside a PDF: each at its place, pushed down when it would overlap the one above', () => {
  assert.deepEqual(stackCards([{ id: 'b', top: 100, height: 80 }, { id: 'a', top: 40, height: 50 }, { id: 'c', top: 150, height: 30 }], 8),
    { a: 40, b: 100, c: 188 });
  assert.deepEqual(stackCards([{ id: 'a', top: 10, height: 100 }, { id: 'b', top: 20, height: 10 }], 8), { a: 10, b: 118 });
});

test('a selection on drawn pages becomes quads in points', () => {
  // Two pages 612pt wide drawn at 918px (zoom 1.5), the second 1200px lower.
  const pages = [{ page: 1, box: { left: 100, top: 0, right: 1018, bottom: 1188 }, widthPt: 612 }, { page: 2, box: { left: 100, top: 1200, right: 1018, bottom: 2388 }, widthPt: 612 }];
  const line = { left: 250, top: 150, right: 400, bottom: 165 };
  assert.deepEqual(selectionMarks([line, line, { left: 100, top: 1230, right: 160, bottom: 1245 }, { left: 0, top: 0, right: 50, bottom: 20 }, { left: 300, top: 300, right: 300.5, bottom: 310 }, pages[0].box], pages), [
    { page: 1, quads: [[100, 100, 200, 100, 100, 110, 200, 110]] },
    { page: 2, quads: [[0, 20, 40, 20, 0, 30, 40, 30]] },
  ]);
});

test('PDF comments go through PdfCraft, inside the project, never changing the inbox file', async () => {
  const project = join(root, 'workspace', 'projects', 'acme');
  writeFileSync(join(project, 'inbox', 'doc.pdf'), '%PDF-1.7\n');
  mkdirSync(join(project, 'runs', 'out'), { recursive: true });
  writeFileSync(join(project, 'runs', 'out', 'r.pdf'), '%PDF-1.7\n');
  const calls: { steps: PdfStep[]; root: string }[] = [];
  let failWith = '';
  const svc = createService(root, { ...noLaunch, pdfcraft: { available: () => true, run: async (steps, dir) => {
    calls.push({ steps, root: dir });
    if (failWith) throw new Error(failWith);
    return steps.map((s) => (s.tool === 'comment_list' ? { comments: [{ id: 'c1', page: 1, replies: [] }] } : {}));
  } } });
  assert.deepEqual(svc.pdfcraftStatus(), { available: true, platform: process.platform });
  assert.deepEqual(service.pdfcraftStatus(), { available: false, platform: process.platform });
  assert.deepEqual((await svc.pdfComments('acme', 'inbox/doc.pdf')).map((c) => c.id), ['c1']);
  assert.equal(calls[0].root, realpathSync(project));
  assert.equal(calls[0].steps[0].args.path, 'inbox/doc.pdf');
  const linked = { id: 'b1111111-1111-4111-8111-111111111111', after: 1, note: { path: svc.createNote('acme', 'PDF linked note', 'content') } };
  svc.setPdfNotes('acme', 'inbox/doc.pdf', [linked]);
  svc.setPdfNotes('acme', 'runs/out/r.pdf', [linked]);
  const change = { op: 'highlight', page: 1, find: 'a', color: 'yellow' };
  assert.equal((await svc.pdfChange('acme', 'inbox/doc.pdf', change)).path, 'inbox/doc-edited.pdf');
  assert.deepEqual(calls.at(-1)?.steps.find((s) => s.tool === 'doc_save')?.args, { doc: 1, path: 'inbox/doc-edited.pdf' });
  writeFileSync(join(project, 'inbox', 'doc-edited.pdf'), '%PDF-1.7\n');
  assert.deepEqual(svc.pdfNotes('acme', 'inbox/doc-edited.pdf'), [linked]);
  assert.equal((await svc.pdfChange('acme', 'inbox/doc.pdf', change)).path, 'inbox/doc-edited-2.pdf');
  assert.equal((await svc.pdfChange('acme', 'inbox/doc-edited.pdf', change)).path, 'inbox/doc-edited.pdf', 'the copy saves in place');
  assert.equal((await svc.pdfChange('acme', 'runs/out/r.pdf', change)).path, 'runs/out/r.pdf');
  assert.deepEqual(calls.at(-1)?.steps.find((s) => s.tool === 'doc_save')?.args, { doc: 1 });
  // Page edits never save over the file, inside the inbox or not; the -edited copy then saves in place.
  const del = { op: 'delete-pages', pages: [1] };
  assert.equal((await svc.pdfChange('acme', 'runs/out/r.pdf', del)).path, 'runs/out/r-edited.pdf');
  assert.deepEqual(calls.at(-1)?.steps.find((s) => s.tool === 'page_delete')?.args, { doc: 1, pages: [1] });
  writeFileSync(join(project, 'runs', 'out', 'r-edited.pdf'), '%PDF-1.7\n');
  assert.equal(svc.pdfNotes('acme', 'runs/out/r-edited.pdf')[0].after, 0);
  assert.equal((await svc.pdfChange('acme', 'runs/out/r-edited.pdf', del)).path, 'runs/out/r-edited.pdf');
  await assert.rejects(svc.pdfChange('acme', 'inbox/doc.pdf', { op: 'render' }), ServiceError);
  await assert.rejects(svc.pdfComments('acme', 'inbox/us-1.md'), /PDF not found/);
  await assert.rejects(svc.pdfComments('acme', '../../x.pdf'), ServiceError);
  await assert.rejects(svc.pdfComments('nope', 'inbox/doc.pdf'), /Unknown project/);
  await assert.rejects(service.pdfComments('acme', 'inbox/doc.pdf'), /not available/);
  failWith = '"zzz" was not found on page 1';
  await assert.rejects(svc.pdfChange('acme', 'runs/out/r.pdf', change), (e: Error) => e instanceof ServiceError && /not found on page 1/.test(e.message));
  for (const f of ['doc.pdf', 'doc-edited.pdf']) rmSync(join(project, 'inbox', f));
  rmSync(join(project, 'runs', 'out'), { recursive: true });
});

test('run details and open activities', () => {
  assert.equal(service.run('acme', RUN).currentStep, 'interview');
  assert.throws(() => service.run('acme', 'nope'), /Unknown activity/);
  assert.throws(() => service.run('../..', RUN), /Unknown project/);
  assert.deepEqual(service.openRuns('acme').map((r) => r.id), [RUN]);
});

test('launch validates every choice against fixed lists', () => {
  const base = { project: 'acme', activity: 'review', tool: 'claude', files: ['us-1.md'], language: 'English', note: '' };
  assert.throws(() => service.launch({ ...base, project: '../acme' }), /Unknown project/);
  assert.throws(() => service.launch({ ...base, activity: 'rm -rf' }), /Unknown activity/);
  assert.throws(() => service.launch({ ...base, tool: 'powershell' }), /Unknown tool/);
  assert.throws(() => service.launch({ ...base, files: ['../../secret.txt'] }), /Not in the project inbox/);
  assert.throws(() => service.launch({ ...base, files: [] }), /needs at least one file/);
  assert.throws(() => service.launch({ ...base, activity: 'automation' }), /not available yet/);
  assert.throws(() => service.launch({ ...base, activity: 'resume', run: 'x' }), /open activity/);
  assert.equal(launched.length, 0);
});

test('project name and description updates preserve all other project settings', () => {
  const before = service.projects().find((p) => p.id === 'acme')!;
  const file = join(root, 'workspace', 'projects', 'acme', 'project.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  assert.throws(() => service.setProjectName('acme', '   '), /name/);
  assert.throws(() => service.setProjectName('../acme', 'Wrong'), /Unknown project/);
  assert.throws(() => service.setProjectDescription('acme', 'x'.repeat(2001)), /2000/);
  const renamed = service.setProjectName('acme', '  New title  ');
  assert.equal(renamed.id, 'acme');
  assert.equal(renamed.name, 'New title');
  assert.equal(renamed.description, before.description);
  const described = service.setProjectDescription('acme', 'First line\nSecond line');
  assert.equal(described.name, 'New title');
  assert.equal(described.description, 'First line\nSecond line');
  const after = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  assert.deepEqual({ ...after, name: data.name, description: data.description }, data);
  service.setProjectName('acme', before.name);
  service.setProjectDescription('acme', before.description);
});

test('activity tracking is optional, validated and never creates a run', () => {
  const base = { project: 'acme', activity: 'review', tool: 'print', files: ['us-1.md'], language: 'English', note: '' };
  const token = 'a'.repeat(32);
  const runs = service.activityRuns('acme');
  const result = service.launch({ ...base, trackingId: token });
  assert.match(result.prompt, new RegExp(`use the slug moki-${token}`));
  assert.match(result.prompt, /Do not create a run solely for tracking/);
  assert.deepEqual(service.activityRuns('acme'), runs);
  assert.throws(() => service.launch({ ...base, trackingId: '../bad' }), /Invalid activity tracking identifier/);
  assert.throws(() => service.launch({ ...base, activity: 'resume', trackingId: token }), /Invalid activity tracking identifier/);
  assert.doesNotMatch(service.launch(base).prompt, /solely for tracking/);
});

test('launch builds the request; Word files are extracted', () => {
  const r = service.launch({ project: 'acme', activity: 'review', tool: 'claude', files: ['us-1.md', 'us-2.docx'], language: 'Portuguese (pt-BR)', note: 'line1\nline2' });
  assert.equal(r.opened, true);
  assert.equal(launched.length, 1);
  assert.match(r.prompt, /requirements-review skill .*inbox\/us-1\.md.*\.extracted\/us-2\.docx\.md/);
  assert.match(r.prompt, /Additional instructions: line1 line2\. Talk to me in Portuguese \(pt-BR\)\.$/);
  const chat = service.launch({ project: 'acme', activity: 'resume', run: RUN, tool: 'chat', files: [], language: 'English', note: '' });
  assert.equal(chat.opened, false);
  assert.ok((chat as { upload: string[] }).upload.some((u) => u.endsWith('state.json')));
  assert.equal(launched.length, 1, 'chat does not launch anything');
});

test('tags share context between projects; launch lists it and applies exclusions', () => {
  const projects = join(root, 'workspace', 'projects');
  try {
    const a = service.saveTag({ name: 'Pagamentos' });
    assert.equal(a.id, 'pagamentos');
    assert.equal(service.saveTag({ name: 'Pagamentos' }).id, a.id, 'same name returns the existing tag');
    assert.throws(() => service.saveTag({ name: '  ' }), /name is required/);
    const other = service.createProject('Docs', 'qa', null, [a.id, 'unknown']);
    assert.deepEqual(other.tags, [a.id], 'unknown ids are dropped');
    service.createProject('Plain');
    writeFileSync(join(projects, 'docs', 'context', 'rules.md'), '# Rules');
    writeFileSync(join(projects, 'docs', 'inbox', 'secret.md'), 'not shared');
    writeFileSync(join(projects, 'plain', 'inbox', 'flow.md'), '# Flow');
    assert.deepEqual(service.setFileTags('plain', 'inbox/flow.md', [a.id]), [a.id]);
    assert.throws(() => service.setFileTags('plain', '../docs/inbox/secret.md', [a.id]), ServiceError);
    assert.throws(() => service.setFileTags('plain', 'inbox/missing.md', [a.id]), /not found/);
    assert.throws(() => service.setFileTags('plain', 'project.json', [a.id]), /cannot be tagged/);

    assert.deepEqual(service.contextChoice('acme').shared, [], 'acme has no tags yet');
    service.setProjectTags('acme', [a.id]);
    const choice = service.contextChoice('acme');
    assert.ok(choice.own.includes('workspace/projects/acme/context/index.md'));
    const sources = choice.shared[0].sources;
    assert.deepEqual(sources.map((s) => [s.project, s.whole]), [['docs', true], ['plain', false]]);
    assert.ok(sources[0].paths.includes('workspace/projects/docs/context/rules.md'));
    assert.ok(!sources[0].paths.some((p) => p.includes('/inbox/')), 'the inbox of a tagged project is not shared');
    assert.deepEqual(sources[1].paths, ['workspace/projects/plain/inbox/flow.md']);

    const base = { project: 'acme', activity: 'open', tool: 'print', files: [], language: 'English', note: '' };
    assert.throws(() => service.launch({ ...base, exclude: ['workspace/projects/docs/inbox/secret.md'] }), /Not in this project's context/);
    const r = service.launch({ ...base, exclude: ['workspace/projects/docs/context/rules.md', 'workspace/projects/acme/context/index.md'] });
    assert.match(r.prompt, /Shared context I authorize .*tag Pagamentos, project docs: [^;]*workspace\/projects\/docs\/context\/index\.md[^;]*; tag Pagamentos, project plain: workspace\/projects\/plain\/inbox\/flow\.md\./);
    assert.doesNotMatch(r.prompt, /docs\/context\/rules\.md|secret\.md/);
    assert.match(r.prompt, /Do not use these files of this project in this activity: workspace\/projects\/acme\/context\/index\.md\./);

    service.removeTag(a.id);
    assert.deepEqual(service.tags(), []);
    assert.deepEqual(service.projects().find((p) => p.id === 'acme')?.tags, []);
    assert.deepEqual(service.fileTags('plain'), {});
    assert.doesNotMatch(service.launch(base).prompt, /Shared context/);
  } finally {
    for (const p of ['docs', 'plain']) rmSync(join(projects, p), { recursive: true, force: true });
    rmSync(join(root, 'workspace', 'tags.json'), { force: true });
  }
});

test('agent library: built-in agents are read-only, copies are editable and validated', () => {
  const names = service.agents().map((a) => a.name);
  assert.ok(names.includes('requirements-analyst') && names.includes('automation-engineer'));
  assert.equal(service.agents().find((a) => a.name === 'automation-engineer')?.usable, false);
  assert.ok(service.categories().some((c) => c.id === 'quality'));
  assert.throws(() => service.saveAgent('requirements-analyst', 'x'), /cannot be edited/);
  assert.throws(() => service.deleteAgent('requirements-analyst'), /cannot be deleted/);
  assert.throws(() => service.agent('../secret'), /Unknown agent/);

  const copy = service.duplicateAgent('requirements-analyst');
  assert.equal(copy.name, 'requirements-analyst-custom');
  assert.equal(copy.source, 'custom');
  assert.equal(copy.basedOn, 'requirements-analyst');
  const file = join(root, 'workspace', 'library', 'agents', 'quality', 'requirements-analyst-custom.md');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /^# Requirements Analyst \(custom\)$/m);

  assert.throws(() => service.saveAgent(copy.name, text.replace('name: requirements-analyst-custom', 'name: other')), /must match the file name/);
  assert.throws(() => service.saveAgent(copy.name, text.replace('skills: requirements-review', 'skills: made-up')), /unknown skill "made-up"/);
  assert.throws(() => service.saveAgent(copy.name, text.replace('access: project-write', 'access: root')), /access must be one of/);
  assert.equal(service.saveAgent(copy.name, text.replace('## Boundaries', '## Boundaries\n\nAlways cite the rule id.')), true);
  assert.match(service.agent(copy.name).html, /Always cite the rule id/);
  assert.match(readFileSync(join(root, 'agents', 'quality', 'requirements-analyst.md'), 'utf8'), /^# Requirements Analyst$/m, 'the original never changes');

  assert.equal(service.deleteAgent(copy.name), true);
  assert.ok(!existsSync(file));
});

test('agents in operations: inputs, outputs, MCP servers and AI are read, validated and saved', () => {
  const builtin = service.agent('requirements-analyst');
  assert.deepEqual(builtin.inputs, ['User stories']);
  assert.deepEqual(builtin.outputs, ['review-matrix.json', '*.xlsx', '*.pdf']);
  assert.deepEqual(builtin.mcps, []);
  assert.equal(builtin.ai, '');
  assert.throws(() => service.saveAgentContract('requirements-analyst', { inputs: [] }), /cannot be edited/);

  const copy = service.duplicateAgent('requirements-analyst');
  const contract = { inputs: ['User stories', 'Business rules'], outputs: ['matriz.xlsx'], mcps: [{ name: 'jira', mode: 'read' }, { name: 'azure-devops', mode: 'execute' }], ai: 'codex' };
  assert.equal(service.saveAgentContract(copy.name, contract), true);
  const saved = service.agent(copy.name);
  assert.deepEqual({ inputs: saved.inputs, outputs: saved.outputs, mcps: saved.mcps, ai: saved.ai }, contract);
  const file = join(root, 'workspace', 'library', 'agents', 'quality', `${copy.name}.md`);
  const text = readFileSync(file, 'utf8');
  assert.match(text, /^mcps:\n {2}jira: read\n {2}azure-devops: execute\nai: codex\nmetadata:$/m, 'written before metadata, in the file format');
  assert.match(text, /^# Requirements Analyst \(custom\)$/m, 'the body stays');

  // Saved again: replaced, never duplicated; an empty contract removes the keys.
  service.saveAgentContract(copy.name, { ...contract, mcps: [{ name: 'jira', mode: 'read' }], ai: '' });
  assert.equal(readFileSync(file, 'utf8').match(/^mcps:/gm)?.length, 1);
  assert.doesNotMatch(readFileSync(file, 'utf8'), /azure-devops|^ai:/m);
  service.saveAgentContract(copy.name, { inputs: [], outputs: [], mcps: [], ai: '' });
  assert.doesNotMatch(readFileSync(file, 'utf8'), /^(inputs|outputs|mcps|ai):/m);

  for (const [bad, why] of [
    [{ outputs: ['folder/file.md'] }, /must be a file name/],
    [{ outputs: ['no-extension'] }, /must be a file name/],
    [{ inputs: ['A', 'a'] }, /listed twice/],
    [{ inputs: ['one, two'] }, /no commas/],
    [{ mcps: [{ name: 'jira', mode: 'write' }] }, /mode must be read or execute/],
    [{ mcps: [{ name: '../x', mode: 'read' }] }, /invalid MCP server name/],
    [{ ai: 'chat' }, /ai must be one of/],
  ] as const) assert.throws(() => service.saveAgentContract(copy.name, bad), why);

  // Reading only means writing nothing.
  writeFileSync(file, readFileSync(file, 'utf8').replace('access: project-write', 'access: read-only'));
  assert.throws(() => service.saveAgentContract(copy.name, { outputs: ['x.md'] }), /read-only agent writes nothing/);
  assert.throws(() => service.saveAgentContract(copy.name, { mcps: [{ name: 'jira', mode: 'execute' }] }), /cannot execute/);
  assert.equal(service.saveAgentContract(copy.name, { inputs: ['Log'], mcps: [{ name: 'jira', mode: 'read' }] }), true);
  service.deleteAgent(copy.name);

  // The page of one of your agents saves description, instructions, skills and contract at once.
  const mine = service.duplicateAgent('test-designer');
  const page = service.agent(mine.name);
  assert.throws(() => service.saveAgentProfile('test-designer', { description: 'x', body: page.body, skills: page.skills, contract: {} }), /cannot be edited/);
  const body = `${page.body.trim()}\n\nExtra line.\n`;
  assert.equal(service.saveAgentProfile(mine.name, { description: '"Quoted" start', body, skills: ['project-context', 'requirements-review'], contract: { inputs: ['Stories'], outputs: ['cases.json'], mcps: [], ai: '' } }), true);
  const after = service.agent(mine.name);
  assert.equal(after.description, '"Quoted" start');
  assert.deepEqual(after.skills, ['project-context', 'requirements-review']);
  assert.deepEqual(after.inputs, ['Stories']);
  assert.match(after.body, /Extra line\.\n$/);
  assert.match(after.text, /^---\nname: test-designer-custom\ndescription: "\"Quoted\" start"\n/);
  assert.throws(() => service.saveAgentProfile(mine.name, { description: 'x', body: '# No sections', skills: ['project-context'], contract: {} }), /missing section "## Role"/);
  assert.throws(() => service.saveAgentProfile(mine.name, { description: ' ', body, skills: ['project-context'], contract: {} }), /Write a description/);
  assert.throws(() => service.saveAgentProfile(mine.name, { description: 'x', body, skills: ['nope'], contract: {} }), /Unknown skills: nope/);
  service.deleteAgent(mine.name);

  // Agents created for a project carry the same fields in their file.
  mkdirSync(join(root, 'workspace', 'projects', 'acme', 'skills', 'my-skill'), { recursive: true });
  writeFileSync(join(root, 'workspace', 'projects', 'acme', 'skills', 'my-skill', 'SKILL.md'), '---\nname: my-skill\ndescription: x\n---\n');
  const created = service.createScopeAgent('acme', { name: 'api-tester', description: 'Tests APIs.', skills: ['my-skill'], scope: 'project', contract: { inputs: ['Contract'], outputs: ['report.md'], mcps: [{ name: 'jira', mode: 'read' }], ai: 'claude' } });
  assert.match(readFileSync(created.file, 'utf8'), /^description: "Tests APIs\."\ninputs: Contract\noutputs: report\.md\nmcps:\n {2}jira: read\nai: claude\n---$/m);
  assert.deepEqual(service.projectItems('acme').agents.find((a) => a.name === 'api-tester')?.contract, { inputs: ['Contract'], outputs: ['report.md'], mcps: [{ name: 'jira', mode: 'read' }], ai: 'claude' });
  assert.throws(() => service.createScopeAgent('acme', { name: 'bad', description: 'x', skills: ['my-skill'], scope: 'project', contract: { outputs: ['a/b.md'] } as never }), /Not created: output "a\/b\.md"/);
  rmSync(created.file);
  rmSync(join(root, 'workspace', 'projects', 'acme', 'skills'), { recursive: true });
});

test('operations: a line of agents; arrows pass outputs, the rest goes to the initial form; saved in the library', () => {
  const keys = service.operationAgents().map((a) => a.key);
  assert.ok(keys.includes('library:requirements-analyst') && keys.includes('library:test-designer'));
  assert.ok(!keys.includes('library:automation-engineer'), 'agents not usable yet are left out');

  const ra = 'library:requirements-analyst';
  const td = 'library:test-designer';
  const fa = 'library:failure-analyst';
  const base = { name: 'Revisão e testes', description: '', steps: [{ id: 's1', agent: ra, x: 20, y: 40 }, { id: 's2', agent: td, x: 300, y: 40.6 }] };
  const saved = service.saveOperation({ ...base, links: [{ from: 's1', to: 's2', gate: 'approval', map: { 'Business rules': 'review-matrix.json' } }] });
  assert.equal(saved.id, 'revisao-e-testes');
  assert.equal(saved.steps[1].y, 41, 'positions are whole pixels');
  assert.deepEqual(saved.check.order, ['s1', 's2']);
  assert.deepEqual(saved.check.initialInputs.map((i) => `${i.step}:${i.input}`), ['s1:User stories', 's2:User stories', 's2:Acceptance criteria']);
  assert.deepEqual(saved.check.approvals, ['s2']);
  assert.deepEqual(saved.check.errors, []);
  const file = join(root, 'workspace', 'library', 'operations', 'revisao-e-testes.json');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).links[0].map['Business rules'], 'review-matrix.json');
  assert.equal(service.operations().length, 1);

  // Renamed: same id. A second one with the same name is refused; another name gets its own id.
  assert.equal(service.saveOperation({ ...saved, name: 'Revisão completa' }).id, 'revisao-e-testes');
  assert.throws(() => service.saveOperation({ ...base, name: 'revisão completa', links: [] }), /already an operation named/);
  assert.equal(service.saveOperation({ ...base, name: 'Outra', links: [] }).id, 'outra');

  // Lanes: coloured bands of the board, kept as drawn (width within limits); a bad colour is refused.
  const lanes = [{ id: 'l1', name: 'Análise', color: '#7FB2E5', width: 90 }, { id: 'l2', name: 'Testes', color: '#8fbf7f', width: 320 }];
  assert.deepEqual(service.saveOperation({ ...base, id: 'outra', name: 'Outra', lanes, links: [] }).lanes,
    [{ id: 'l1', name: 'Análise', color: '#7fb2e5', width: 160 }, { id: 'l2', name: 'Testes', color: '#8fbf7f', width: 320 }]);
  assert.throws(() => service.saveOperation({ ...base, id: 'outra', name: 'Outra', lanes: [{ id: 'l1', name: 'X', color: 'red', width: 200 }], links: [] }), /Invalid lane "X"/);

  const fill = (m: { text: string; params: Record<string, string> }) => m.text.replace(/\{(\w+)\}/g, (_, k: string) => m.params[k]);
  const check = (links: unknown[], steps = base.steps) => {
    const c = service.checkOperation({ ...base, steps, links });
    return { ...c, errors: c.errors.map(fill), warnings: c.warnings.map(fill) };
  };
  const three = [...base.steps, { id: 's3', agent: fa, x: 600, y: 40 }];
  assert.match(check([{ from: 's1', to: 's2', gate: 'auto', map: {} }, { from: 's1', to: 's3', gate: 'auto', map: {} }], three).errors.join(), /two steps/);
  assert.match(check([{ from: 's1', to: 's2', gate: 'auto', map: {} }, { from: 's2', to: 's1', gate: 'auto', map: {} }]).errors.join(), /loop/);
  assert.match(check([{ from: 's1', to: 's2', gate: 'auto', map: { 'User stories': 'made-up.md' } }]).errors.join(), /not an output of requirements-analyst/);
  assert.match(check([{ from: 's1', to: 's2', gate: 'auto', map: { Nope: 'review-matrix.json' } }]).errors.join(), /not an input of test-designer/);
  assert.match(check([{ from: 's1', to: 's2', gate: 'later', map: {} }]).errors.join(), /unknown kind/);
  assert.match(check([], [{ id: 's1', agent: 'library:gone', x: 0, y: 0 }]).errors.join(), /not available/);
  assert.match(check([]).warnings.join(), /not linked to the others: test-designer/);
  // The failure analyst delivers no file: in the middle, the next step would receive nothing.
  const middle = check([{ from: 's3', to: 's1', gate: 'auto', map: {} }, { from: 's1', to: 's2', gate: 'auto', map: {} }], three);
  assert.deepEqual(middle.order, ['s3', 's1', 's2']);
  assert.match(middle.warnings.join(), /failure-analyst delivers no files/);
  assert.deepEqual(middle.approvals, [], 'auto arrows and no MCP that executes: nothing waits');
  assert.throws(() => service.saveOperation({ ...base, name: 'Loop', links: [{ from: 's1', to: 's2', gate: 'auto', map: {} }, { from: 's2', to: 's1', gate: 'auto', map: {} }] }), /Not saved: .*loop/);
  assert.throws(() => service.saveOperation({ ...base, name: '  ', links: [] }), /Give the operation a name/);

  assert.equal(service.deleteOperation('outra'), true);
  assert.equal(service.deleteOperation('revisao-e-testes'), true);
  assert.deepEqual(service.operations(), []);
  assert.throws(() => service.deleteOperation('../x'), /Unknown operation/);
});

test('operations in a project: linked, started with the initial form, run step by step through files', async () => {
  const { validateSchema } = await import('../scripts/lib/schema.mjs');
  const runSchema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'execution-state.schema.json'), 'utf8'));
  const started: { tool: string; prompt: string }[] = [];
  const svc = createService(root, {
    ...noLaunch,
    launch: (tool, prompt) => { started.push({ tool, prompt }); return { opened: true, message: '', terminal: { id: `t${started.length}`, title: tool } }; },
    detectTools: () => ({ claude: true, codex: true, 'cursor-agent': false, gemini: false, antigravity: false }) as never,
  });
  const op = svc.saveOperation({
    name: 'Fluxo QA', description: '', lanes: [{ id: 'l1', name: 'Análise', color: '#7fb2e5', width: 300 }],
    steps: [{ id: 's1', agent: 'library:requirements-analyst', x: 20, y: 60 }, { id: 's2', agent: 'library:test-designer', x: 320, y: 60 }],
    links: [{ from: 's1', to: 's2', gate: 'approval', map: { 'Business rules': 'review-matrix.json' } }],
  });
  assert.throws(() => svc.operationPlan('acme', op.id), /not linked to the project/);
  assert.deepEqual(svc.setProjectOperations('acme', [op.id, 'made-up']), [op.id]);
  assert.deepEqual(svc.projectOperations('acme').map((o) => o.id), [op.id]);
  const plan = svc.operationPlan('acme', op.id);
  assert.deepEqual(plan.steps.map((s) => s.agent), ['requirements-analyst', 'test-designer']);
  assert.ok('claude' in plan.mcpsByTool && plan.mcpsByTool.antigravity === null);

  assert.throws(() => svc.startOperation('acme', op.id, { tools: { s1: 'claude' } }), /Choose an AI tool for every step/);
  assert.throws(() => svc.startOperation('acme', op.id, { tools: { s1: 'claude', s2: 'gemini' } }), /not installed/);
  assert.throws(() => svc.startOperation('acme', op.id, { tools: { s1: 'claude', s2: 'codex' }, answers: [{ step: 's1', input: 'User stories', files: ['inbox/nope.md'] }] }), /Not in the project inbox/);
  const run = svc.startOperation('acme', op.id, {
    tools: { s1: 'claude', s2: 'codex' }, context: 'Revisar o login',
    answers: [{ step: 's1', input: 'User stories', text: 'US-1 login', files: ['inbox/us-1.md'] }, { step: 'x', input: 'ignored', text: 'x', files: [] }],
  });
  const dir = join(root, 'workspace', 'projects', 'acme', 'runs', run.id);
  assert.match(run.id, /^\d{8}-\d{4}-op-fluxo-qa$/);
  assert.deepEqual(run.steps.map((s) => [s.id, s.ai, s.lane]), [['s1', 'claude', 'Análise'], ['s2', 'codex', '']]);
  assert.deepEqual(run.visits.map((v) => [v.slot, v.status]), [['s1', 'ready']]);
  const request = readFileSync(join(dir, 'inputs', 'request.md'), 'utf8');
  assert.match(request, /Revisar o login/);
  assert.match(request, /### User stories\n\nUS-1 login\n\n- File: `workspace\/projects\/acme\/inbox\/us-1\.md`/);
  assert.doesNotMatch(request, /ignored/);

  // Step 1: started by the app, done when its handoff and every declared output are there.
  assert.deepEqual(svc.advanceOperations('acme'), [{ run: run.id, step: 's1' }]);
  const first = svc.startOperationStep('acme', run.id, 's1', 'Portuguese (pt-BR)');
  assert.equal(started[0].tool, 'claude');
  assert.match(first.prompt, /Act as the requirements-analyst agent: read agents\/quality\/requirements-analyst\.md/);
  assert.match(first.prompt, /multi-agent operation "Fluxo QA"/);
  assert.match(first.prompt, new RegExp(`write workspace/projects/acme/runs/${run.id}/handoff/s1\\.md`));
  assert.match(first.prompt, new RegExp(`write the question in workspace/projects/acme/runs/${run.id}/waiting/s1\\.md`));
  assert.doesNotMatch(first.prompt, /outcome:/, 'no results declared: no outcome asked');
  assert.throws(() => svc.startOperationStep('acme', run.id, 's1', 'English'), /cannot start now/, 'never twice');
  assert.equal(svc.operationRun('acme', run.id).visits[0].terminal, 't1');

  // The agent stops to ask something: the run waits for the user, with the question.
  writeFileSync(join(dir, 'waiting', 's1.md'), 'Qual ambiente devo considerar?');
  svc.advanceOperations('acme');
  let state = svc.operationRun('acme', run.id);
  assert.equal(state.status, 'awaiting-input');
  assert.equal(state.visits[0].question, 'Qual ambiente devo considerar?');
  assert.deepEqual(state.pending.map((p) => p.description), ['Qual ambiente devo considerar?']);
  rmSync(join(dir, 'waiting', 's1.md'));
  svc.advanceOperations('acme');
  assert.equal(svc.operationRun('acme', run.id).status, 'in-progress', 'answered: back to work');

  mkdirSync(join(dir, 'outputs', 's1'), { recursive: true });
  writeFileSync(join(dir, 'outputs', 's1', 'review-matrix.json'), '{}');
  writeFileSync(join(dir, 'outputs', 's1', 'Matriz.xlsx'), 'x');
  writeFileSync(join(dir, 'handoff', 's1.md'), 'Revisei.');
  assert.deepEqual(svc.advanceOperations('acme'), []);
  assert.deepEqual(svc.operationRun('acme', run.id).visits[0].missing, ['*.pdf']);
  writeFileSync(join(dir, 'outputs', 's1', 'Relatório.pdf'), 'x');
  assert.deepEqual(svc.advanceOperations('acme'), [], 'an approval arrow: nothing starts on its own');
  state = svc.operationRun('acme', run.id);
  assert.equal(state.status, 'awaiting-approval');
  assert.deepEqual(state.visits.map((v) => [v.slot, v.status]), [['s1', 'done'], ['s2', 'awaiting-approval']]);
  assert.ok(!svc.openRuns('acme').some((r) => r.id === run.id), 'not resumed as a single activity: Moki runs it');

  // Paused: approving does not start it; resuming does.
  assert.equal(svc.pauseOperation('acme', run.id, true).status, 'paused');
  assert.equal(svc.approveOperationStep('acme', run.id), 's2');
  assert.deepEqual(svc.advanceOperations('acme'), []);
  svc.pauseOperation('acme', run.id, false);
  assert.deepEqual(svc.advanceOperations('acme'), [{ run: run.id, step: 's2' }]);
  const second = svc.startOperationStep('acme', run.id, 's2', 'English');
  assert.equal(started[1].tool, 'codex');
  assert.match(second.prompt, new RegExp(`delivered its files in workspace/projects/acme/runs/${run.id}/outputs/s1/`));
  assert.match(second.prompt, /"Business rules" is review-matrix\.json/);
  assert.match(second.prompt, /answered in the request: "User stories", "Acceptance criteria"/);

  mkdirSync(join(dir, 'outputs', 's2', 'export'), { recursive: true });
  for (const f of ['mapping.md', 'test-cases.json', 'export/Casos.xlsx']) writeFileSync(join(dir, 'outputs', 's2', f), 'x');
  writeFileSync(join(dir, 'handoff', 's2.md'), 'Casos prontos.');
  svc.advanceOperations('acme');
  state = svc.operationRun('acme', run.id);
  assert.equal(state.status, 'completed');
  assert.ok(state.artifacts.includes(`workspace/projects/acme/runs/${run.id}/outputs/s2/export/Casos.xlsx`));
  assert.deepEqual(state.approvals.map((a) => [a.step, a.decision]), [['s2', 'approved']]);
  assert.deepEqual(validateSchema(runSchema, JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))), [], 'a valid run for the framework');
  assert.match(readFileSync(join(root, 'workspace', 'projects', 'acme', 'activity-log.md'), 'utf8'), new RegExp(`operation: Fluxo QA \\| ${run.id}`));

  const other = svc.startOperation('acme', op.id, { tools: { s1: 'claude', s2: 'claude' } });
  assert.equal(svc.cancelOperation('acme', other.id).status, 'cancelled');
  assert.deepEqual(svc.advanceOperations('acme'), []);
  assert.throws(() => svc.pauseOperation('acme', other.id, true), /has ended/);
  assert.deepEqual(svc.operationRuns('acme').map((r) => r.status).sort(), ['cancelled', 'completed']);

  svc.setProjectOperations('acme', []);
  svc.deleteOperation(op.id);
  rmSync(join(root, 'workspace', 'projects', 'acme', 'runs', run.id), { recursive: true });
  rmSync(join(root, 'workspace', 'projects', 'acme', 'runs', other.id), { recursive: true });
});

test('operations branch on the result of an agent, loop back up to a limit, and ask the user when nothing fits', () => {
  const svc = createService(root, {
    ...noLaunch,
    launch: () => ({ opened: true, message: '' }),
    detectTools: () => ({ claude: true }) as never,
  });
  // A reviewer that ends "approved" or "rejected", and a fixer: rejected → fix → review again; approved → test design.
  const reviewer = service.duplicateAgent('requirements-analyst');
  service.saveAgentContract(reviewer.name, { inputs: ['User stories'], outputs: ['review.md'], outcomes: ['approved', 'rejected'], mcps: [], ai: '' });
  const fixer = service.duplicateAgent('requirements-analyst');
  service.saveAgentContract(fixer.name, { inputs: [], outputs: ['fixed.md'], mcps: [], ai: '' });
  const r = `library:${reviewer.name}`;
  const base = {
    name: 'Revisa até aprovar', description: '', lanes: [],
    steps: [{ id: 's1', agent: r, x: 0, y: 0 }, { id: 's2', agent: `library:${fixer.name}`, x: 300, y: 200 }, { id: 's3', agent: 'library:test-designer', x: 600, y: 0 }],
  };
  const links = [
    { from: 's1', to: 's3', gate: 'auto', map: {}, when: 'approved' },
    { from: 's1', to: 's2', gate: 'auto', map: {}, when: 'rejected' },
    { from: 's2', to: 's1', gate: 'auto', map: {} },
  ];
  const fill = (m: { text: string; params: Record<string, string> }) => m.text.replace(/\{(\w+)\}/g, (_, k: string) => m.params[k]);
  const check = (l: unknown[], extra = {}) => { const c = svc.checkOperation({ ...base, links: l, ...extra }); return { ...c, errors: c.errors.map(fill), warnings: c.warnings.map(fill) }; };
  const ok = check(links);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.order, ['s1', 's3', 's2']);
  assert.equal(ok.start, 's1', 'the step no arrow leads to... or the one chosen');
  assert.match(check([links[0]]).warnings.join(), /If [\w-]+ ends with "rejected", the operation ends there/);
  assert.match(check([...links, { from: 's1', to: 's2', gate: 'auto', map: {}, when: 'approved' }]).errors.join(), /two arrows for the result "approved"/);
  assert.match(check([{ ...links[0], when: 'maybe' }, links[1], links[2]]).errors.join(), /"maybe" is not a result of/);
  assert.match(check([{ from: 's1', to: 's2', gate: 'auto', map: {} }, { from: 's1', to: 's3', gate: 'auto', map: {} }]).errors.join(), /without a result to choose between them/);
  assert.match(check([{ from: 's2', to: 's1', gate: 'auto', map: {} }, { from: 's1', to: 's2', gate: 'auto', map: {} }]).errors.join(), /loop with no result to leave it/);
  assert.match(check(links, { maxRounds: 0 }).errors.join(), /from 1 to 10 times/);

  const op = svc.saveOperation({ ...base, links, maxRounds: 2 });
  svc.setProjectOperations('acme', [op.id]);
  const run = svc.startOperation('acme', op.id, { tools: { s1: 'claude', s2: 'claude', s3: 'claude' } });
  const dir = join(root, 'workspace', 'projects', 'acme', 'runs', run.id);
  const finish = (slot: string, file: string, handoff: string) => {
    mkdirSync(join(dir, 'outputs', slot), { recursive: true });
    writeFileSync(join(dir, 'outputs', slot, file), 'x');
    writeFileSync(join(dir, 'handoff', `${slot}.md`), handoff);
    return svc.advanceOperations('acme');
  };
  const slots = () => svc.operationRun('acme', run.id).visits.map((v) => `${v.slot}:${v.status}${v.outcome ? `:${v.outcome}` : ''}`);

  const prompt = svc.startOperationStep('acme', run.id, 's1', 'English').prompt;
  assert.match(prompt, /first line must be "outcome: <result>", the result being exactly one of: approved, rejected/);
  assert.deepEqual(finish('s1', 'review.md', 'outcome: rejected\nFaltam regras.'), [{ run: run.id, step: 's2' }]);
  svc.startOperationStep('acme', run.id, 's2', 'English');
  assert.deepEqual(finish('s2', 'fixed.md', 'Ajustei.'), [{ run: run.id, step: 's1-2' }], 'back to the review: its second time');
  const again = svc.startOperationStep('acme', run.id, 's1-2', 'English').prompt;
  assert.match(again, /this step runs again: time 2/);
  assert.match(again, new RegExp(`Your earlier work in this run: workspace/projects/acme/runs/${run.id}/outputs/s1/`));
  assert.match(again, new RegExp(`delivered its files in workspace/projects/acme/runs/${run.id}/outputs/s2/`));

  // Rejected again: the fixer would run a second time (maxRounds 2 allows it), then the review a third time (no: the limit).
  finish('s1-2', 'review.md', '**Outcome:** Rejected');
  svc.startOperationStep('acme', run.id, 's2-2', 'English');
  assert.deepEqual(finish('s2-2', 'fixed.md', 'Ajustei de novo.'), []);
  let state = svc.operationRun('acme', run.id);
  assert.equal(state.status, 'awaiting-input');
  assert.equal(state.decision?.kind, 'limit');
  assert.deepEqual(slots(), ['s1:done:rejected', 's2:done', 's1-2:done:rejected', 's2-2:done']);
  svc.chooseOperationPath('acme', run.id, 's1');
  svc.startOperationStep('acme', run.id, 's1-3', 'English');

  // No valid result: the user picks the path.
  finish('s1-3', 'review.md', 'Acho que está bom.');
  state = svc.operationRun('acme', run.id);
  assert.equal(state.decision?.kind, 'path');
  assert.deepEqual(state.decision?.options.map((o) => `${o.to}:${o.when}`), ['s3:approved', 's2:rejected']);
  assert.throws(() => svc.chooseOperationPath('acme', run.id, 's9'), /Choose one of the steps offered/);
  svc.chooseOperationPath('acme', run.id, 's3');
  assert.deepEqual(svc.advanceOperations('acme'), [{ run: run.id, step: 's3' }]);
  svc.startOperationStep('acme', run.id, 's3', 'English');
  for (const f of ['mapping.md', 'test-cases.json']) { mkdirSync(join(dir, 'outputs', 's3'), { recursive: true }); writeFileSync(join(dir, 'outputs', 's3', f), 'x'); }
  finish('s3', 'casos.xlsx', 'Feito.');
  state = svc.operationRun('acme', run.id);
  assert.equal(state.status, 'completed');
  assert.deepEqual(state.approvals.map((a) => a.notes), [`went on to ${reviewer.name}`, 'went on to test-designer']);

  // A result with no arrow ends the operation there.
  const short = svc.saveOperation({ ...base, name: 'Só revisa', links: [links[0]] });
  svc.setProjectOperations('acme', [op.id, short.id]);
  const run2 = svc.startOperation('acme', short.id, { tools: { s1: 'claude', s3: 'claude' } });
  const dir2 = join(root, 'workspace', 'projects', 'acme', 'runs', run2.id);
  svc.startOperationStep('acme', run2.id, 's1', 'English');
  mkdirSync(join(dir2, 'outputs', 's1'), { recursive: true });
  writeFileSync(join(dir2, 'outputs', 's1', 'review.md'), 'x');
  writeFileSync(join(dir2, 'handoff', 's1.md'), 'outcome: rejected');
  svc.advanceOperations('acme');
  assert.equal(svc.operationRun('acme', run2.id).status, 'completed');

  svc.setProjectOperations('acme', []);
  for (const o of [op.id, short.id]) svc.deleteOperation(o);
  for (const d of [dir, dir2]) rmSync(d, { recursive: true });
  for (const a of [reviewer.name, fixer.name]) service.deleteAgent(a);
});

test('operations: a step whose terminal closes fails until tried again, a rejected step goes back with the reasons, cancelling closes the terminal', async () => {
  const { validateSchema } = await import('../scripts/lib/schema.mjs');
  const runSchema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'execution-state.schema.json'), 'utf8'));
  let n = 0;
  const killed: string[] = [];
  const svc = createService(root, {
    ...noLaunch,
    launch: () => ({ opened: true, message: '', terminal: { id: `t${++n}`, title: 'claude' } }),
    detectTools: () => ({ claude: true }) as never,
    killTerminal: (id) => { killed.push(id); },
  });
  const base = {
    description: '', lanes: [{ id: 'l1', name: 'Análise', color: '#7fb2e5', width: 300 }],
    steps: [{ id: 's1', agent: 'library:requirements-analyst', x: 20, y: 60 }, { id: 's2', agent: 'library:test-designer', x: 320, y: 60 }],
    links: [{ from: 's1', to: 's2', gate: 'approval', map: {} }],
  };
  const op = svc.saveOperation({ ...base, name: 'Revisa e testa' });
  const tight = svc.saveOperation({ ...base, name: 'Uma volta só', maxRounds: 1 });
  svc.setProjectOperations('acme', [op.id, tight.id]);
  const tools = { tools: { s1: 'claude', s2: 'claude' } };
  const deliver = (dir: string, slot: string) => {
    mkdirSync(join(dir, 'outputs', slot), { recursive: true });
    for (const f of ['review-matrix.json', 'Matriz.xlsx', 'Relatório.pdf']) writeFileSync(join(dir, 'outputs', slot, f), 'x');
    writeFileSync(join(dir, 'handoff', `${slot}.md`), 'Revisei.');
  };

  const run = svc.startOperation('acme', op.id, tools);
  const dir = join(root, 'workspace', 'projects', 'acme', 'runs', run.id);
  assert.deepEqual(run.steps.map((s) => [s.x, s.y]), [[20, 60], [320, 60]], 'the board as it was when the run started');
  assert.deepEqual(run.lanes?.map((l) => l.name), ['Análise']);

  // Its terminal closes before the summary: the step failed, the run is blocked, nothing starts until it is tried again.
  svc.startOperationStep('acme', run.id, 's1', 'English');
  assert.equal(svc.operationStepExited('acme', 't9'), false, 'a terminal of no step');
  assert.equal(svc.operationStepExited('acme', 't1'), true);
  let state = svc.operationRun('acme', run.id);
  assert.equal(state.status, 'blocked');
  assert.equal(state.visits[0].status, 'failed');
  assert.match(state.visits[0].error ?? '', /terminal closed before it wrote its summary/);
  assert.deepEqual(svc.advanceOperations('acme'), []);
  assert.throws(() => svc.startOperationStep('acme', run.id, 's1', 'English'), /cannot start now/);
  assert.throws(() => svc.approveOperationStep('acme', run.id), /Nothing is waiting/);
  assert.equal(svc.retryOperationStep('acme', run.id), 's1');
  assert.throws(() => svc.retryOperationStep('acme', run.id), /Nothing failed/);
  assert.deepEqual(svc.advanceOperations('acme'), [{ run: run.id, step: 's1' }]);
  svc.startOperationStep('acme', run.id, 's1', 'English');
  assert.equal(svc.operationRun('acme', run.id).visits[0].attempts, 1);

  // Its terminal closes after it delivered everything: done, and the run moves on.
  deliver(dir, 's1');
  assert.equal(svc.operationStepExited('acme', 't2'), true);
  state = svc.operationRun('acme', run.id);
  assert.equal(state.status, 'awaiting-approval');
  assert.equal(state.canRedo, true);

  // Rejected and sent back: the step before runs again with the reasons; the rejected visit stays, cancelled.
  svc.rejectOperationStep('acme', run.id, 'Falta a regra de senha.', true);
  state = svc.operationRun('acme', run.id);
  assert.deepEqual(state.visits.map((v) => `${v.slot}:${v.status}`), ['s1:done', 's2:cancelled', 's1-2:ready']);
  assert.equal(state.visits[2].notes, 'Falta a regra de senha.');
  assert.deepEqual(state.approvals.map((a) => [a.step, a.decision, a.notes]), [['s2', 'rejected', 'Falta a regra de senha.']]);
  assert.deepEqual(svc.advanceOperations('acme'), [{ run: run.id, step: 's1-2' }]);
  const again = svc.startOperationStep('acme', run.id, 's1-2', 'English').prompt;
  assert.match(again, /The user rejected what came after your earlier work and asked: Falta a regra de senha\./);
  assert.match(again, new RegExp(`Your earlier work in this run: workspace/projects/acme/runs/${run.id}/outputs/s1/`));
  assert.doesNotMatch(again, /The step before/, 'it reads what it read the first time');

  // Rejected again, without sending back: the operation ends, cancelled.
  deliver(dir, 's1-2');
  svc.advanceOperations('acme');
  const ended = svc.rejectOperationStep('acme', run.id, '', false);
  assert.equal(ended.status, 'cancelled');
  assert.equal(ended.ended, true);
  assert.deepEqual(validateSchema(runSchema, JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))), [], 'still a valid run for the framework');
  const events = svc.operationRun('acme', run.id).events ?? [];
  for (const e of ['s1 failed', 's1 tried again', 's2 rejected: s1-2 runs again', 's2-2 rejected: ended']) assert.ok(events.some((x) => x.includes(e)), e);

  // At the limit of rounds, rejecting can only end the operation.
  const short = svc.startOperation('acme', tight.id, tools);
  const shortDir = join(root, 'workspace', 'projects', 'acme', 'runs', short.id);
  svc.startOperationStep('acme', short.id, 's1', 'English');
  deliver(shortDir, 's1');
  svc.advanceOperations('acme');
  assert.equal(svc.operationRun('acme', short.id).canRedo, false);
  assert.throws(() => svc.rejectOperationStep('acme', short.id, 'x', true), /already ran as many times/);

  // Cancelling closes the terminal of the step that runs.
  const other = svc.startOperation('acme', op.id, tools);
  svc.startOperationStep('acme', other.id, 's1', 'English');
  assert.equal(svc.cancelOperation('acme', other.id).status, 'cancelled');
  assert.deepEqual(killed, [`t${n}`]);
  assert.equal(svc.operationRun('acme', other.id).visits[0].status, 'cancelled');
  assert.equal(svc.operationStepExited('acme', `t${n}`), false, 'a cancelled run is left as it is');

  svc.setProjectOperations('acme', []);
  for (const o of [op.id, tight.id]) svc.deleteOperation(o);
  for (const id of [run.id, short.id, other.id]) rmSync(join(root, 'workspace', 'projects', 'acme', 'runs', id), { recursive: true });
});

test('operations: the question of a step is answered from Moki, in its terminal or by reopening it when its terminal is gone', () => {
  let n = 0;
  const alive = new Set<string>();
  const typed: [string, string][] = [];
  const killed: string[] = [];
  const svc = createService(root, {
    ...noLaunch,
    launch: () => { const id = `t${++n}`; alive.add(id); return { opened: true, message: '', terminal: { id, title: 'claude' } }; },
    detectTools: () => ({ claude: true }) as never,
    terminalAlive: (id) => alive.has(id),
    writeTerminal: (id, data) => { typed.push([id, data]); },
    killTerminal: (id) => { killed.push(id); alive.delete(id); },
  });
  const op = svc.saveOperation({
    name: 'Pergunta e responde', description: '', lanes: [],
    steps: [{ id: 's1', agent: 'library:requirements-analyst', x: 20, y: 60 }, { id: 's2', agent: 'library:test-designer', x: 320, y: 60 }],
    links: [{ from: 's1', to: 's2', gate: 'approval', map: {} }],
  });
  svc.setProjectOperations('acme', [op.id]);
  const run = svc.startOperation('acme', op.id, { tools: { s1: 'claude', s2: 'claude' } });
  const dir = join(root, 'workspace', 'projects', 'acme', 'runs', run.id);
  assert.throws(() => svc.answerOperationStep('acme', run.id, 'x'), /No step is waiting for an answer/);

  // Its terminal is open: the answer is typed there, on one line, and the run goes on as before.
  svc.startOperationStep('acme', run.id, 's1', 'English');
  writeFileSync(join(dir, 'waiting', 's1.md'), 'Qual ambiente\ndevo considerar?');
  svc.advanceOperations('acme');
  assert.equal(svc.operationRun('acme', run.id).visits[0].live, true);
  assert.throws(() => svc.answerOperationStep('acme', run.id, '  '), /Write your answer/);
  assert.deepEqual(svc.answerOperationStep('acme', run.id, 'Homologação,\nnão produção'), { sent: 'terminal' });
  assert.deepEqual(typed, [['t1', 'Homologação, não produção\r']]);
  assert.equal(svc.operationRun('acme', run.id).visits[0].status, 'running');

  // Moki restarted: its terminal is gone. Answering reopens the step in a new terminal, with the question and the answer.
  alive.clear();
  assert.equal(svc.operationRun('acme', run.id).visits[0].live, false);
  assert.deepEqual(svc.answerOperationStep('acme', run.id, 'Produção'), { sent: 'reopened' });
  let v = svc.operationRun('acme', run.id).visits[0];
  assert.equal(v.status, 'ready');
  assert.deepEqual(v.resume, { question: 'Qual ambiente devo considerar?', answer: 'Produção' });
  assert.ok(!existsSync(join(dir, 'waiting', 's1.md')), 'the old question is answered');
  assert.equal(typed.length, 1, 'nothing typed into a terminal that is gone');
  assert.deepEqual(svc.advanceOperations('acme'), [{ run: run.id, step: 's1' }]);
  const prompt = svc.startOperationStep('acme', run.id, 's1', 'English').prompt;
  assert.match(prompt, /You were waiting for the user: Qual ambiente devo considerar\? The user's answer: Produção/);
  assert.match(prompt, new RegExp(`Continue from what you already delivered in workspace/projects/acme/runs/${run.id}/outputs/s1/`));

  // Reopening a step whose terminal is still open closes that one first.
  assert.equal(svc.reopenOperationStep('acme', run.id), 's1');
  assert.deepEqual(killed, ['t2']);
  v = svc.operationRun('acme', run.id).visits[0];
  assert.equal(v.status, 'ready');
  assert.equal(v.attempts, 2);
  assert.ok((svc.operationRun('acme', run.id).events ?? []).some((e) => e.includes('s1 reopened with your answer')));

  svc.setProjectOperations('acme', []);
  svc.deleteOperation(op.id);
  rmSync(dir, { recursive: true });
});

test('operations: a step whose AI tool cannot open fails once (no retry loop) and is tried again with another AI', () => {
  const installed = { claude: true, codex: false };
  const svc = createService(root, {
    ...noLaunch,
    // As the launcher does when the command is missing.
    launch: (tool) => (tool === 'codex' ? { opened: false, message: 'OpenAI Codex CLI is not installed on this computer (command "codex" not found).' } : { opened: true, message: '' }),
    detectTools: () => installed as never,
  });
  const op = svc.saveOperation({
    name: 'Sem codex', description: '', lanes: [],
    steps: [{ id: 's1', agent: 'library:requirements-analyst', x: 20, y: 60 }, { id: 's2', agent: 'library:test-designer', x: 320, y: 60 }],
    links: [{ from: 's1', to: 's2', gate: 'approval', map: {} }],
  });
  svc.setProjectOperations('acme', [op.id]);
  installed.codex = true; // installed when the run started, gone since
  const run = svc.startOperation('acme', op.id, { tools: { s1: 'codex', s2: 'claude' } });
  installed.codex = false;
  const dir = join(root, 'workspace', 'projects', 'acme', 'runs', run.id);

  assert.equal(svc.startOperationStep('acme', run.id, 's1', 'English').opened, false);
  let state = svc.operationRun('acme', run.id);
  assert.equal(state.visits[0].status, 'failed');
  assert.match(state.visits[0].error ?? '', /Codex CLI is not installed/);
  assert.equal(state.status, 'blocked');
  assert.deepEqual(svc.advanceOperations('acme'), [], 'a step that could not open is not started again by itself');

  assert.throws(() => svc.retryOperationStep('acme', run.id, 'codex'), /not installed on this computer/);
  assert.throws(() => svc.retryOperationStep('acme', run.id, 'made-up'), /Choose an AI tool/);
  assert.equal(svc.retryOperationStep('acme', run.id, 'claude'), 's1');
  state = svc.operationRun('acme', run.id);
  assert.equal(state.steps.find((s) => s.id === 's1')?.ai, 'claude', 'from now on in this run');
  assert.deepEqual(svc.advanceOperations('acme'), [{ run: run.id, step: 's1' }]);
  assert.equal(svc.startOperationStep('acme', run.id, 's1', 'English').opened, true);
  assert.equal(svc.operationRun('acme', run.id).visits[0].status, 'running');

  svc.setProjectOperations('acme', []);
  svc.deleteOperation(op.id);
  rmSync(dir, { recursive: true });
});

test('operations: the first time, an example in the app language; deleted, it does not come back', () => {
  const dir = join(root, 'workspace', 'library', 'operations');
  rmSync(dir, { recursive: true, force: true });
  const [example] = service.operations('pt-BR');
  assert.equal(example.name, 'Exemplo: da história às evidências');
  assert.deepEqual(example.lanes.map((l) => l.name), ['Análise', 'Testes', 'Evidências']);
  assert.deepEqual(example.check.order.map((id) => example.steps.find((s) => s.id === id)?.agent), ['library:requirements-analyst', 'library:test-designer', 'library:evidence-builder']);
  assert.deepEqual([example.check.errors, example.check.warnings], [[], []], 'a clean example');
  assert.deepEqual(example.check.approvals, ['s2', 's3']);
  service.deleteOperation(example.id);
  assert.deepEqual(service.operations('pt-BR'), []);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(service.operations('en')[0].name, 'Example: from the story to the evidence');
  rmSync(dir, { recursive: true, force: true });
});

test('agents per project: enabled list in project.json gates the launch', () => {
  const all = service.projectAgents('acme');
  assert.ok(all.includes('requirements-analyst') && !all.includes('automation-engineer'), 'absent list = every usable agent');
  assert.throws(() => service.setProjectAgents('acme', ['automation-engineer']), /Unknown or unavailable/);
  assert.deepEqual(service.setProjectAgents('acme', ['requirements-analyst']), ['requirements-analyst']);
  // Kept as tags (workspace/library/agent-tags.json): the other agents now reach every project but acme.
  const tags = (JSON.parse(readFileSync(join(root, 'workspace', 'library', 'agent-tags.json'), 'utf8')) as { agents: Record<string, string[]> }).agents;
  assert.ok(!tags['requirements-analyst'], 'still in every project: no tag');
  assert.ok(tags['failure-analyst'].every((t) => t.startsWith('project:')) && !tags['failure-analyst'].includes('project:acme'));

  const base = { project: 'acme', activity: 'review', tool: 'print', files: ['us-1.md'], language: 'English', note: '' };
  assert.throws(() => service.launch({ ...base, agent: 'failure-analyst' }), /not enabled in this project/);
  assert.throws(() => service.launch({ ...base, agent: 'automation-engineer' }), /not available yet/);
  assert.throws(() => service.launch({ ...base, agent: 'nobody' }), /Unknown agent/);
  const r = service.launch({ ...base, agent: 'requirements-analyst' });
  assert.match(r.prompt, /Act as the requirements-analyst agent: read agents\/quality\/requirements-analyst\.md and follow it\./);
  assert.doesNotMatch(service.launch(base).prompt, /Act as/);
  service.setProjectAgents('acme', all);
});

test('plugins per project: caveman is saved in project.json and reaches only that project\'s launches', () => {
  assert.deepEqual(service.projects().find((p) => p.id === 'acme')?.plugins, []);
  assert.throws(() => service.setProjectPlugins('acme', ['ponytail']), /Unknown plugin/);
  assert.deepEqual(service.setProjectPlugins('acme', ['caveman', 'caveman']).plugins, ['caveman']);
  service.launch({ project: 'acme', activity: 'open', tool: 'claude', files: [], language: 'English', note: '' });
  assert.deepEqual(launched.at(-1)?.plugins, ['caveman']);
  assert.deepEqual(service.setProjectPlugins('acme', []).plugins, []);
  service.launch({ project: 'acme', activity: 'open', tool: 'claude', files: [], language: 'English', note: '' });
  assert.deepEqual(launched.at(-1)?.plugins, []);
});

test('linked folder: linking records it and backs up its AI settings inside it', async () => {
  createProject('linked', 'Linked', root);
  const project = join(root, 'workspace', 'projects', 'linked');
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'qa-repo-')));
  mkdirSync(join(repo, '.claude', 'worktrees', 'copy'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'settings.json'), '{"a":1}');
  mkdirSync(join(repo, '.agents'));
  writeFileSync(join(repo, '.agents', 'x.md'), 'x');
  writeFileSync(join(repo, 'AGENTS.md'), '# repo');
  const prompts: string[] = [];
  const opened: string[] = [];
  let pick: string | null = null;
  const svc = createService(root, {
    launch: (_t, prompt): LaunchResult => { prompts.push(prompt); return { opened: true, message: 'fake' }; },
    openFolder: (f) => { opened.push(f); },
    openPath: () => {},
    pickFolder: async () => pick,
  });
  try {
    assert.equal(svc.projects().find((p) => p.id === 'linked')?.repository, '');
    assert.throws(() => svc.openLinkedFolder('linked'), /No folder is linked/);
    assert.equal(await svc.linkRepository('linked'), null, 'cancelled dialog');
    for (const [bad, msg] of [[join(repo, 'nope'), /not found/], [root, /outside Moki/], [join(root, 'skills'), /outside Moki/], [homedir(), /user folder/]] as const) {
      pick = bad;
      await assert.rejects(svc.linkRepository('linked'), msg);
    }
    const file = join(project, 'project.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), repositories: [{ name: 'app', localPath: repo, writeAllowed: true }] }));
    assert.equal(svc.projects().find((p) => p.id === 'linked')?.repository, '', 'a localPath alone is not the linked folder');
    pick = repo;
    const r = await svc.linkRepository('linked');
    assert.equal(r?.repository, repo);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).repositories, [{ name: 'app', localPath: repo, writeAllowed: true, linkedFolder: true }]);
    assert.equal(dirname(String(r?.backup)), join(repo, '.moki-backup'));
    assert.match(String(r?.backup), /[\\/]link-\d{8}-\d{6}$/);
    assert.equal(readFileSync(join(String(r?.backup), '.claude', 'settings.json'), 'utf8'), '{"a":1}');
    assert.ok(existsSync(join(String(r?.backup), '.agents', 'x.md')) && existsSync(join(String(r?.backup), 'AGENTS.md')));
    assert.ok(!existsSync(join(String(r?.backup), '.claude', 'worktrees')), 'worktrees are not copied');
    assert.deepEqual(readdirSync(repo).sort(), ['.agents', '.claude', '.moki-backup', 'AGENTS.md'], 'only the backup is added');
    assert.equal(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8'), '{"a":1}', 'the originals stay');
    assert.ok(svc.openLinkedFolder('linked') && opened[0] === repo);
    svc.launch({ project: 'linked', activity: 'open', tool: 'claude', files: [], language: 'English', note: '' });
    assert.match(prompts[0], new RegExp(`Linked folder \\(the system's repository\\): ${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`));
    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'qa-repo-')));
    pick = empty;
    const r2 = await svc.linkRepository('linked');
    assert.equal(r2?.backup, undefined, 'nothing to back up');
    const repos = JSON.parse(readFileSync(file, 'utf8')).repositories;
    assert.deepEqual(repos.map((x: { linkedFolder?: boolean }) => x.linkedFolder), [true, undefined], 'only the new folder is linked');
    rmSync(empty, { recursive: true });
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('open a folder: the name is yours, the folder shows live in the tree as @folder, and opens in an IDE', async () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'qa-open-')));
  const folder = join(repo, 'loja');
  mkdirSync(join(folder, 'docs'), { recursive: true });
  mkdirSync(join(folder, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(folder, 'docs', 'us-1.md'), '# US-1');
  writeFileSync(join(repo, 'fora.md'), 'secret');
  let pick: string | null = null;
  const ran: [string, string[]][] = [];
  const svc = createService(root, {
    launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {}, pickFolder: async () => pick,
    detectTools: () => ({ vscode: true }) as Record<string, boolean>,
    runCommand: async (cmd, args) => { ran.push([cmd, args]); return ''; },
  });
  try {
    assert.equal(await svc.pickFolder(), null, 'cancelled dialog');
    pick = folder;
    assert.deepEqual(await svc.pickFolder(), { folder, name: 'loja' }, 'a suggestion only: the UI asks the name');
    const made = svc.createProject('Loja Virtual', 'minimal', folder, []);
    assert.equal(made.id, 'loja-virtual');
    assert.equal(made.repository, folder);
    const again = await svc.pickFolder();
    assert.equal(again?.project?.id, 'loja-virtual', 'the same folder opens its project');

    // The tree starts with the linked folder, live, without node_modules.
    const top = svc.tree('loja-virtual')[0];
    assert.deepEqual([top.name, top.path, top.linked], ['loja', '@folder', folder]);
    assert.deepEqual(top.children?.map((n) => n.path), ['@folder/docs']);
    assert.deepEqual(top.children?.[0].children?.map((n) => n.path), ['@folder/docs/us-1.md']);
    // Its files are read, edited and created in place; nothing outside it is reachable.
    assert.equal(svc.readFile('loja-virtual', '@folder/docs/us-1.md').kind, 'markdown');
    svc.writeFile('loja-virtual', '@folder/docs/us-1.md', '# US-1 v2');
    assert.equal(readFileSync(join(folder, 'docs', 'us-1.md'), 'utf8'), '# US-1 v2');
    assert.equal(svc.createEntry('loja-virtual', '@folder/docs', 'us-2', 'file'), '@folder/docs/us-2.md');
    assert.ok(existsSync(join(folder, 'docs', 'us-2.md')));
    for (const bad of ['@folder/../fora.md', '@folder/../../x']) assert.throws(() => svc.readFile('loja-virtual', bad), ServiceError, bad);
    assert.throws(() => svc.setFileTags('loja-virtual', '@folder/docs/us-1.md', []), /linked folder/);
    assert.throws(() => svc.readFile('acme', '@folder/x.md'), /no linked folder/);

    // Open in the IDE: only an editor, installed, on the linked folder.
    assert.equal(await svc.openInEditor('loja-virtual', 'vscode'), true);
    assert.deepEqual(ran, [['code', [folder]]]);
    await assert.rejects(svc.openInEditor('loja-virtual', 'claude'), /IDE/);
    await assert.rejects(svc.openInEditor('loja-virtual', 'cursor'), /not installed/);
    await assert.rejects(svc.openInEditor('acme', 'vscode'), /no linked folder/);
    rmSync(join(root, 'workspace', 'projects', 'loja-virtual'), { recursive: true, force: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('linked folder: a project can be created from an existing folder chosen in the dialog', async () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'qa-repo-')));
  writeFileSync(join(repo, 'CLAUDE.md'), '# repo');
  mkdirSync(join(repo, '.git', 'info'), { recursive: true });
  writeFileSync(join(repo, '.git', 'info', 'exclude'), '# git ls-files --others --exclude-from=.git/info/exclude');
  let pick: string | null = null;
  const svc = createService(root, { launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {}, pickFolder: async () => pick });
  try {
    assert.equal(await svc.pickFolder(), null, 'cancelled dialog');
    assert.throws(() => svc.createProject('From folder', 'qa', repo), /Choose the folder again/, 'only a picked folder');
    pick = root;
    await assert.rejects(svc.pickFolder(), /outside Moki/);
    pick = repo;
    assert.deepEqual(await svc.pickFolder(), { folder: repo, name: basename(repo) });
    assert.throws(() => svc.createProject('From folder', 'qa', join(repo, 'x')), /Choose the folder again/);
    const created = svc.createProject('From folder', 'blank', repo);
    assert.equal(created.id, 'from-folder');
    assert.equal(created.repository, repo);
    assert.equal(readFileSync(join(String(created.backup), 'CLAUDE.md'), 'utf8'), '# repo');
    assert.equal(dirname(String(created.backup)), join(repo, '.moki-backup'));
    const exclude = () => readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    assert.equal(exclude(), '# git ls-files --others --exclude-from=.git/info/exclude\n.moki-backup/\n');
    pick = repo;
    assert.equal((await svc.pickFolder())?.project?.id, 'from-folder', 'a linked folder opens its project');
    assert.throws(() => svc.createProject('Twice', 'qa', repo), /Choose the folder again/, 'no second project for it');
    rmSync(join(root, 'workspace', 'projects', 'from-folder'), { recursive: true });
    await svc.pickFolder(); // no project has it now
    svc.createProject('Twice', 'qa', repo);
    assert.equal(exclude().match(/\.moki-backup\//g)?.length, 1, 'added once');
    assert.throws(() => svc.createProject('Again', 'qa', repo), /Choose the folder again/, 'a pick is used once');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

// ------------------------------------------------------------- Skills & agents dialog

const b64 = (s: string) => Buffer.from(s).toString('base64');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const noLaunch = { launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {} };
const openAcme = { project: 'acme', activity: 'open', tool: 'print', files: [], language: 'English', note: '' };

test('skill registry: paged search, verified install per project or global, prompt names project skills', async () => {
  const bundles: Record<string, unknown> = {
    'good/lint': { files: [{ path: 'SKILL.md', content_base64: b64('---\nname: lint\n---') }, { path: 'refs/a.md', content_base64: b64('A'), sha256: sha('A') }] },
    'bad/hash': { files: [{ path: 'SKILL.md', content_base64: b64('x') }, { path: 'a.md', content_base64: b64('A'), sha256: sha('B') }] },
    'bad/escape': { files: [{ path: 'SKILL.md', content_base64: b64('x') }, { path: '../../evil.md', content_base64: b64('A'), sha256: sha('A') }] },
  };
  const urls: string[] = [];
  const fakeFetch = (async (url: string) => {
    urls.push(url);
    const slug = url.match(/\/api\/skills\/(.+)\/bundle/)?.[1];
    const body = slug ? bundles[slug] : { items: [{ slug: 'good/lint', title: 'lint', verdict: 'pass', avg_rating: 4 }, { slug: '../x', title: 'bad' }], total: 45 };
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
  }) as typeof fetch;
  const home = join(root, 'home');
  const svc = createService(root, { ...noLaunch, home, fetch: fakeFetch });

  const found = await svc.searchSkills('quero skills para programar', 'coding', 2);
  assert.deepEqual(found.items.map((s) => s.slug), ['good/lint'], 'invalid slugs are dropped');
  assert.deepEqual({ page: found.page, pages: found.pages, total: found.total }, { page: 2, pages: 3, total: 45 });
  assert.match(urls[0], /api\/search\?q=quero\+skills\+para\+programar&limit=20&offset=20&category=coding$/);
  assert.throws(() => svc.searchSkills('', 'nope'), /Unknown category/);
  assert.throws(() => svc.searchSkills('', ''), /choose a category/);
  assert.throws(() => svc.searchSkills('x', '', 0), /Invalid page/);

  const project = join(root, 'workspace', 'projects', 'acme');
  await assert.rejects(svc.installSkill('acme', 'bad/hash', 'project'), /Integrity check failed/);
  await assert.rejects(svc.installSkill('acme', 'bad/escape', 'project'), /outside/);
  assert.equal(existsSync(join(project, 'skills', 'escape')), false, 'failed installs leave nothing behind');
  await assert.rejects(svc.installSkill('acme', '../../x', 'project'), /Invalid skill id/);
  assert.throws(() => svc.installSkill('acme', 'good/lint', 'root'), /Choose where/);

  const r = await svc.installSkill('acme', 'good/lint', 'project');
  assert.equal(r.files, 2);
  assert.equal(readFileSync(join(project, 'skills', 'lint', 'refs', 'a.md'), 'utf8'), 'A');
  await assert.rejects(svc.installSkill('acme', 'good/lint', 'project'), /already installed/);
  await svc.installSkill('acme', 'good/lint', 'global');
  assert.ok(existsSync(join(home, '.claude', 'skills', 'lint', 'SKILL.md')) && existsSync(join(home, '.agents', 'skills', 'lint', 'SKILL.md')));
  assert.deepEqual(svc.installedSkills('acme'), { project: ['lint'], global: ['lint'], artcraft: [] });

  assert.match(svc.launch(openAcme).prompt, /Skills installed for this project \(read workspace\/projects\/acme\/skills\/<name>\/SKILL\.md when one fits the task\): lint\./);
  rmSync(join(project, 'skills'), { recursive: true, force: true });
  assert.doesNotMatch(svc.launch(openAcme).prompt, /Skills installed/, 'requests are unchanged without project skills');
  rmSync(home, { recursive: true, force: true });
});

test('agents created from Skills & agents only use skills installed in their own folder', () => {
  const home = join(root, 'home-agents');
  const svc = createService(root, { ...noLaunch, home });
  const project = join(root, 'workspace', 'projects', 'acme');
  for (const dir of [join(project, 'skills', 'lint'), join(home, '.agents', 'skills', 'shared')]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: x\n---');
  }
  const scoped = svc.scopeAgents('acme', 'project');
  assert.deepEqual({ ...scoped, builtin: [] }, { skills: ['lint'], builtin: [], agents: [], folder: 'workspace/projects/acme/skills', agentsFolder: 'workspace/projects/acme/agents' });
  assert.ok(scoped.builtin.length > 0 && !scoped.builtin.some((b) => b.name === 'automation'), 'project agents may also use the framework\'s usable skills (not pending ones)');
  assert.deepEqual(svc.scopeAgents('acme', 'global').builtin, [], 'global agents only use global skills');

  const req = { name: 'API Tester', description: 'Act as a senior API tester: use @lint.\nList breaking changes.', skills: ['lint'], scope: 'project' };
  assert.throws(() => svc.createScopeAgent('acme', { ...req, skills: ['shared'] }), /"shared" is not installed in workspace\/projects\/acme\/skills/);
  assert.throws(() => svc.createScopeAgent('acme', { ...req, skills: ['../skills/lint'] }), /not installed/);
  assert.throws(() => svc.createScopeAgent('acme', { ...req, skills: [] }), /at least one skill/);
  assert.throws(() => svc.createScopeAgent('acme', { ...req, name: '!!' }), /name/);
  assert.throws(() => svc.createScopeAgent('acme', { ...req, scope: 'root' }), /Choose where/);
  assert.throws(() => svc.createScopeAgent('acme', { ...req, name: 'auto', skills: ['automation'] }), /not installed/, 'pending skills are not offered');

  assert.equal(svc.createScopeAgent('acme', req).name, 'api-tester');
  const text = readFileSync(join(project, 'agents', 'api-tester.md'), 'utf8');
  assert.match(text, /^---\nname: api-tester\ndescription: "Act as a senior API tester: use @lint\."\n---\n\nAct as a senior API tester/);
  assert.match(text, /Use only these skills \(read the SKILL\.md when one fits the task\)\. Do not use or install any other skill/);
  assert.match(text, /- `lint`: `workspace\/projects\/acme\/skills\/lint\/SKILL\.md`/);
  assert.doesNotMatch(text, /Moki skills follow/, 'no framework note without framework skills');
  assert.throws(() => svc.createScopeAgent('acme', req), /already exists/);
  assert.match(svc.launch(openAcme).prompt, /Agents defined for this project \(.*agents\/<name>\.md and use only the skills it lists\): api-tester\./);

  const global = svc.createScopeAgent('acme', { ...req, name: 'helper', skills: ['shared'], scope: 'global' });
  assert.equal(global.file, join(home, '.claude', 'agents', 'helper.md'));
  assert.ok(readFileSync(global.file, 'utf8').includes(`\`${join(home, '.agents', 'skills', 'shared', 'SKILL.md')}\``));

  rmSync(join(project, 'skills'), { recursive: true, force: true });
  rmSync(join(project, 'agents'), { recursive: true, force: true });
  assert.doesNotMatch(svc.launch(openAcme).prompt, /Skills installed|Agents defined/, 'requests are unchanged without project skills or agents');
  rmSync(home, { recursive: true, force: true });
});

test('create skill: the AI tool drafts a proposal in the project; installing copies the reviewed proposal', () => {
  const home = join(root, 'home-proposals');
  const sent: string[] = [];
  const svc = createService(root, { ...noLaunch, home, launch: (_t, prompt) => { sent.push(prompt); return { opened: true, message: '' }; } });
  const req = { name: 'API Contract', prompt: 'Compare two OpenAPI files.\nList breaking changes.', tool: 'claude', language: 'Spanish' };
  assert.throws(() => svc.proposeSkill('acme', { ...req, name: '!!' }), /name/);
  assert.throws(() => svc.proposeSkill('acme', { ...req, prompt: ' ' }), /Describe/);
  assert.throws(() => svc.proposeSkill('acme', { ...req, tool: 'print' }), /AI tool/);
  svc.proposeSkill('acme', req);
  assert.match(sent[0], /named "api-contract" from my description: "Compare two OpenAPI files\. List breaking changes\."\./);
  assert.match(sent[0], /Write only inside workspace\/projects\/acme\/skill-proposals\/api-contract; do not install/);
  assert.match(sent[0], /Talk to me in Spanish\.$/);

  const project = join(root, 'workspace', 'projects', 'acme');
  const draft = join(project, 'skill-proposals', 'api-contract');
  mkdirSync(join(draft, 'references'), { recursive: true }); // what the AI tool writes
  writeFileSync(join(draft, 'SKILL.md'), '---\nname: api-contract\ndescription: Finds breaking changes.\n---\n');
  writeFileSync(join(draft, 'references', 'a.md'), 'A');
  assert.throws(() => svc.proposeSkill('acme', req), /already exists/);
  assert.deepEqual(svc.skillProposals('acme'), [{ name: 'api-contract', description: 'Finds breaking changes.' }]);

  assert.throws(() => svc.installProposal('acme', '../context', 'project'), /Unknown skill proposal/);
  svc.installProposal('acme', 'api-contract', 'project');
  assert.equal(readFileSync(join(project, 'skills', 'api-contract', 'references', 'a.md'), 'utf8'), 'A');
  assert.throws(() => svc.installProposal('acme', 'api-contract', 'project'), /already installed/);
  assert.deepEqual(svc.installProposal('acme', 'api-contract', 'global').folders, [join(home, '.claude', 'skills', 'api-contract'), join(home, '.agents', 'skills', 'api-contract')]);
  rmSync(join(project, 'skills'), { recursive: true, force: true });
  rmSync(join(project, 'skill-proposals'), { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('global tab and start screen: lists, opens and removes (to the trash) only what is installed for all projects', async () => {
  const home = join(root, 'home-global');
  const trashed: string[] = [];
  const openedFolders: string[] = [];
  const openedFiles: string[] = [];
  const svc = createService(root, {
    launch: () => ({ opened: true, message: '' }), openFolder: (f) => { openedFolders.push(f); }, openPath: (f) => { openedFiles.push(f); }, home,
    trash: async (p) => { trashed.push(p); rmSync(p, { recursive: true, force: true }); },
  });
  for (const dir of [join(home, '.claude', 'skills', 'shared'), join(home, '.agents', 'skills', 'shared')]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: shared\ndescription: Shared helper\n---');
  }
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(home, '.claude', 'agents', 'helper.md'), '---\nname: helper\ndescription: "Helps"\n---\n');
  svc.setupProject('acme', { description: '', linkedSkills: ['shared'] });

  const items = svc.globalItems();
  assert.deepEqual(items.skills, [{ name: 'shared', description: 'Shared helper', folders: [join(home, '.claude', 'skills', 'shared'), join(home, '.agents', 'skills', 'shared')], linkedBy: ['Acme'] }]);
  assert.deepEqual(items.agents, [{ name: 'helper', description: 'Helps', file: join(home, '.claude', 'agents', 'helper.md') }]);

  const agentFile = join(home, '.claude', 'agents', 'helper.md');
  assert.equal(svc.globalAgent('helper').text, readFileSync(agentFile, 'utf8'));
  assert.throws(() => svc.saveGlobalAgent('helper', 'no frontmatter'), /frontmatter/);
  assert.throws(() => svc.saveGlobalAgent('../x', '---\nname: x\ndescription: y\n---\n'), /not installed/);
  svc.saveGlobalAgent('helper', '---\nname: helper\ndescription: "Helps more"\n---\r\nBody\r\n');
  assert.equal(readFileSync(agentFile, 'utf8'), '---\nname: helper\ndescription: "Helps more"\n---\nBody\n');
  const edit = svc.editGlobalAgent('helper', { prompt: 'Answer in Portuguese', tool: 'claude', language: 'English' });
  assert.match(edit.prompt, /helper\.md.*Answer in Portuguese.*wait for my OK/);
  assert.throws(() => svc.editGlobalAgent('helper', { prompt: '', tool: 'claude' }), /Describe/);
  writeFileSync(agentFile, '---\nname: helper\ndescription: "Helps"\n---\n');

  svc.openGlobal('skill', 'shared');
  svc.openGlobal('agent', 'helper');
  assert.deepEqual([openedFolders, openedFiles], [[join(home, '.claude', 'skills', 'shared')], [join(home, '.claude', 'agents', 'helper.md')]]);
  assert.throws(() => svc.openGlobal('skill', '../agents'), /not installed/);
  await assert.rejects(svc.removeGlobal('agent', '../../x'), /not installed/);
  await assert.rejects(svc.removeGlobal('file', 'helper'), /Unknown kind/);

  await svc.removeGlobal('skill', 'shared');
  await svc.removeGlobal('agent', 'helper');
  assert.equal(trashed.length, 3, 'a skill leaves every global folder');
  assert.deepEqual(svc.globalItems(), { skills: [], agents: [] });
  svc.setupProject('acme', { description: '', linkedSkills: [] });
  rmSync(home, { recursive: true, force: true });
});

test('set up: description and global skills linked by reference; requests name them', () => {
  const home = join(root, 'home-setup');
  const svc = createService(root, { launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {}, home });
  const skill = join(home, '.claude', 'skills', 'react-dev');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: react-dev\n---');
  const setup = { project: 'acme', activity: 'setup', tool: 'print', files: [], language: 'English', note: '' };

  assert.throws(() => svc.setupProject('acme', { description: 'x', linkedSkills: ['ghost'] }), /Not installed for all projects: ghost/);
  const summary = svc.setupProject('acme', { description: 'quero iniciar um projeto com react\n', linkedSkills: ['react-dev', 'react-dev'] });
  assert.equal(summary.description, 'quero iniciar um projeto com react');
  assert.deepEqual(summary.linkedSkills, ['react-dev']);
  assert.ok(!existsSync(join(root, 'workspace', 'projects', 'acme', 'skills', 'react-dev')), 'nothing is copied');

  const prompt = svc.launch(setup).prompt;
  assert.match(prompt, /prepare this project for its goal: "quero iniciar um projeto com react"\./);
  assert.match(prompt, /proposed-updates\.md and wait for my approval/);
  assert.ok(prompt.includes(`Global skills linked to this project (read the SKILL.md when one fits the task): react-dev (${join(skill, 'SKILL.md')}).`));

  rmSync(skill, { recursive: true, force: true });
  assert.doesNotMatch(svc.launch(setup).prompt, /Global skills linked/, 'skills no longer installed are left out');
  svc.setupProject('acme', { description: '', linkedSkills: [] });
  rmSync(home, { recursive: true, force: true });
});

test('set up: ArtCraft skills of the framework can be linked; requests name them from the framework root', () => {
  const svc = createService(root, { launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {}, home: join(root, 'home-artcraft') });
  cpSync(join(ROOT, 'skills', 'wordcraft'), join(root, 'skills', 'wordcraft'), { recursive: true });
  assert.deepEqual(svc.installedSkills('acme').artcraft, ['wordcraft'], 'only installed, usable skills of the artcraft agents');
  assert.throws(() => svc.setupProject('acme', { description: '', linkedSkills: ['failure-analysis'] }), /Not installed for all projects: failure-analysis/);
  svc.setupProject('acme', { description: '', linkedSkills: ['wordcraft'] });
  assert.match(svc.launch({ project: 'acme', activity: 'setup', tool: 'print', files: [], language: 'English', note: '' }).prompt, /Global skills linked to this project \(read the SKILL\.md when one fits the task\): wordcraft \(skills\/wordcraft\/SKILL\.md\)\./);
  svc.setupProject('acme', { description: '', linkedSkills: [] });
  rmSync(join(root, 'skills', 'wordcraft'), { recursive: true, force: true });
});

test('blank project: no QA context files; the AI plan is filtered and approved from Set up', () => {
  const home = join(root, 'home-plan');
  const svc = createService(root, { launch: () => ({ opened: true, message: '' }), openFolder: () => {}, openPath: () => {}, home });
  mkdirSync(join(home, '.claude', 'skills', 'react-dev'), { recursive: true });
  writeFileSync(join(home, '.claude', 'skills', 'react-dev', 'SKILL.md'), '---\nname: react-dev\n---');
  assert.throws(() => svc.createProject('Other', 'empty'), /Unknown way to start/);
  const created = svc.createProject('Blank One', 'blank');
  const dir = join(root, 'workspace', 'projects', 'blank-one');
  assert.equal(created.starter, 'blank');
  assert.ok(!existsSync(join(dir, 'context')) && existsSync(join(dir, 'inbox')) && existsSync(join(dir, 'proposed-updates.md')));
  assert.equal(svc.readPlan('blank-one'), null);

  const plan = { project: 'blank-one', activity: 'plan', tool: 'print', files: [], language: 'English', note: '' };
  const prompt = svc.launch(plan).prompt;
  assert.match(prompt, /one question at a time/);
  assert.match(prompt, /skills: react-dev; agents: [^;]*failure-analyst/);
  assert.match(prompt, /Do not create proposed folders or context files, install or link anything before I approve/);
  assert.deepEqual(svc.launch({ ...plan, tool: 'chat' }).upload?.filter((f) => f.includes('context')), [], 'no missing context/index.md upload');

  writeFileSync(join(dir, 'plan.json'), JSON.stringify({
    skills: ['react-dev', 'ghost'], agents: ['failure-analyst', 'nobody'], searchSkills: ['playwright', 7],
    contextFiles: [{ path: 'context/stack.md', contains: 'Tech stack' }, { path: 'context/team.md' }, { path: '../escape.md' }],
    folders: [{ path: 'design/docs', contains: 'Documentation' }, { path: 'drafts', contains: 'Drafts' }, { path: '../outside' }, { path: '/absolute' }],
  }));
  assert.deepEqual(svc.readPlan('blank-one'), {
    approved: false, skills: ['react-dev'], agents: ['failure-analyst'], searchSkills: ['playwright'],
    contextFiles: [{ path: 'context/stack.md', contains: 'Tech stack' }, { path: 'context/team.md', contains: '' }],
    folders: [{ path: 'design/docs', contains: 'Documentation' }, { path: 'drafts', contains: 'Drafts' }],
  });
  assert.throws(() => svc.setupProject('blank-one', { description: 'x', linkedSkills: [], agents: ['nobody'] }), /Unknown or unavailable agents: nobody/);
  const summary = svc.setupProject('blank-one', { description: 'React app', linkedSkills: ['react-dev'], agents: ['failure-analyst'], contextFiles: ['context/stack.md'], folders: ['design/docs', '../outside'] });
  assert.deepEqual(summary.linkedSkills, ['react-dev']);
  assert.deepEqual(svc.projectAgents('blank-one'), ['failure-analyst']);
  assert.deepEqual(svc.readPlan('blank-one'), {
    approved: true, skills: ['react-dev'], agents: ['failure-analyst'], searchSkills: ['playwright'], contextFiles: [{ path: 'context/stack.md', contains: 'Tech stack' }],
    folders: [{ path: 'design/docs', contains: 'Documentation' }],
  });
  assert.deepEqual(svc.projectAgents('acme').length > 1, true, 'Set up without agents keeps every agent');
  rmSync(home, { recursive: true, force: true });
});

test('repository tab: installs, agents and removals in a linked .claude need confirmation and a backup; writeAllowed: false refuses', async () => {
  const fakeFetch = (async (url: string) => {
    const ok = url.includes('/api/skills/good/lint/bundle');
    return new Response(JSON.stringify(ok ? { files: [{ path: 'SKILL.md', content_base64: b64('---\nname: lint\ndescription: Lints\n---') }] } : {}), { status: ok ? 200 : 404 });
  }) as typeof fetch;
  const home = mkdtempSync(join(tmpdir(), 'qa-home-'));
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'qa-repo-')));
  const svc = createService(root, { ...noLaunch, home, fetch: fakeFetch, trash: async (p) => { rmSync(p, { recursive: true, force: true }); } });
  createProject('repo-tab', 'Repo tab', root);
  const project = join(root, 'workspace', 'projects', 'repo-tab');
  const backups = () => (existsSync(join(project, 'backups')) ? readdirSync(join(project, 'backups')).filter((n) => n.startsWith('claude-')) : []);

  // Without a linked folder, the project's own skills folder.
  mkdirSync(join(project, 'skills', 'old'), { recursive: true });
  writeFileSync(join(project, 'skills', 'old', 'SKILL.md'), '---\nname: old\ndescription: Old one\n---');
  assert.deepEqual(svc.projectItems('repo-tab').skills, [{ name: 'old', description: 'Old one' }]);
  await assert.rejects(svc.removeProjectItem('repo-tab', 'skill', '../skills'), /not installed/);
  await assert.rejects(svc.removeProjectItem('repo-tab', 'file', 'old'), /Unknown kind/);
  await svc.removeProjectItem('repo-tab', 'skill', 'old');
  assert.deepEqual(svc.projectItems('repo-tab').skills, []);

  const json = join(project, 'project.json');
  const setLink = (extra: Record<string, unknown>) => writeFileSync(json, JSON.stringify({ ...JSON.parse(readFileSync(json, 'utf8')), repositories: [{ name: 'app', localPath: repo, linkedFolder: true, ...extra }] }));
  setLink({});
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude', 'settings.json'), '{"before":true}');

  assert.throws(() => svc.installSkill('repo-tab', 'good/lint', 'project'), /Confirm the install/);
  setLink({ writeAllowed: false });
  assert.throws(() => svc.installSkill('repo-tab', 'good/lint', 'project', true), /does not allow writing/);
  assert.deepEqual(backups(), []);
  setLink({});
  const installed = await svc.installSkill('repo-tab', 'good/lint', 'project', true);
  assert.ok(existsSync(join(repo, '.claude', 'skills', 'lint', 'SKILL.md')) && !existsSync(join(project, 'skills', 'lint')));
  assert.equal(readFileSync(join(installed.backup!, '.claude', 'settings.json'), 'utf8'), '{"before":true}');
  assert.equal(existsSync(join(installed.backup!, '.claude', 'skills')), false, 'the backup is the .claude from before the install');

  const label = `${repo.split(sep).join('/')}/.claude`;
  assert.deepEqual(svc.scopeAgents('repo-tab', 'project').folder, `${label}/skills`);
  const agent = { name: 'Repo Tester', description: 'Tests this repository with @lint.', skills: ['lint', 'failure-analysis'], scope: 'project' };
  assert.throws(() => svc.createScopeAgent('repo-tab', agent), /Confirm the agent/);
  const made = svc.createScopeAgent('repo-tab', agent, true);
  assert.equal(made.file, join(repo, '.claude', 'agents', 'repo-tester.md'));
  assert.ok(readFileSync(made.file, 'utf8').includes(`- \`failure-analysis\`: \`${root.split(sep).join('/')}/skills/failure-analysis/SKILL.md\``), 'framework skills get absolute paths in a repository');
  assert.ok(svc.launch({ ...openAcme, project: 'repo-tab' }).prompt.includes(`follow ${label}/agents/<name>.md and use only the skills it lists): repo-tester.`));

  assert.deepEqual(svc.projectItems('repo-tab'), {
    skillsFolder: `${label}/skills`, agentsFolder: `${label}/agents`,
    skills: [{ name: 'lint', description: 'Lints' }], agents: [{ name: 'repo-tester', description: 'Tests this repository with @lint.' }],
  });
  await assert.rejects(svc.removeProjectItem('repo-tab', 'agent', 'repo-tester'), /Confirm the removal/);
  const removed = await svc.removeProjectItem('repo-tab', 'agent', 'repo-tester', true);
  assert.ok(existsSync(join(removed.backup!, '.claude', 'agents', 'repo-tester.md')) && !existsSync(made.file));
  for (const dir of [repo, home, project]) rmSync(dir, { recursive: true, force: true });
});

test('upload of skills and agents: preview writes nothing, blocks per item, installs only what is confirmed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'qa-up-home-'));
  const src = mkdtempSync(join(tmpdir(), 'qa-up-src-'));
  const put = (rel: string, text: string) => { mkdirSync(dirname(join(src, rel)), { recursive: true }); writeFileSync(join(src, rel), text); };
  const skill = (name: string, extra = '') => `---\nname: ${name}\ndescription: Does ${name}${extra}\n---\nBody`;
  put('proj/.claude/skills/good/SKILL.md', skill('good'));
  put('proj/.claude/skills/good/references/a.md', 'A');
  put('proj/.claude/skills/good/.env', 'TOKEN=1');
  put('proj/.claude/skills/good/keys/server.pem', 'x');
  put('proj/.claude/skills/leaky/SKILL.md', skill('leaky'));
  put('proj/.claude/skills/leaky/run.sh', `echo ${'ghp_'}${'a'.repeat(36)}`);
  put('proj/.claude/skills/nodesc/SKILL.md', '---\nname: nodesc\n---\nBody');
  put('proj/.claude/skills/nofile/notes.md', 'x');
  put('proj/.claude/skills/Bad_Name/SKILL.md', skill('Bad_Name'));
  put('proj/.claude/skills/failure-analysis/SKILL.md', skill('failure-analysis'));
  put('proj/.claude/agents/helper.md', '---\nname: helper\ndescription: >-\n  Helps with good\n  things\ntools: Read\n---\nUse good.');
  put('proj/.claude/agents/qa-lead.md', '---\nname: qa-lead\ndescription: Takes the Moki name\n---');
  put('proj/.claude/settings.json', '{"hooks":{}}');
  put('proj/.claude/hooks/pre.sh', 'rm -rf /');
  put('proj/.claude/commands/x.md', 'x');
  put('proj/CLAUDE.md', 'x');
  put('proj/.mcp.json', '{}');
  symlinkSync(join(src, 'proj', 'CLAUDE.md'), join(src, 'proj', '.claude', 'skills', 'good', 'link.md'));
  const svc = createService(root, { ...noLaunch, home, pickFolder: async () => join(src, 'proj') });

  const view = await svc.claudeUploadPick('folder', '', 'global');
  assert.ok(view);
  const by = Object.fromEntries(view.items.map((i) => [`${i.kind}:${i.name}`, i]));
  assert.equal(by['skill:good'].blocked, undefined);
  assert.deepEqual(by['skill:good'].discarded.sort(), ['.env', 'keys/server.pem']);
  assert.equal(by['skill:good'].files, 2, 'SKILL.md and the reference; the symlink is not followed');
  assert.equal(by['agent:helper'].description, 'Helps with good things', 'multi-line descriptions are read');
  assert.deepEqual(Object.fromEntries(view.items.filter((i) => i.blocked).map((i) => [i.name, i.blocked?.reason])), {
    leaky: 'secret', nodesc: 'no-description', nofile: 'no-skill-md', Bad_Name: 'invalid-name', 'failure-analysis': 'moki-name', 'qa-lead': 'moki-name',
  });
  assert.equal(by['skill:leaky'].blocked?.detail, 'GitHub token');
  assert.equal(by['skill:leaky'].blocked?.file, 'run.sh');
  assert.ok(!JSON.stringify(view).includes('ghp_'), 'the secret value never leaves the main process');
  const ignored = Object.fromEntries(view.ignored.map((i) => [i.path, i.reason]));
  assert.equal(ignored['settings.json'], 'config');
  assert.equal(ignored.hooks, 'config');
  assert.equal(ignored.commands, 'config');
  assert.equal(ignored['CLAUDE.md'], 'config');
  assert.equal(ignored['.mcp.json'], 'config');
  assert.equal(ignored['.claude/skills/good/link.md'], 'symlink');
  assert.equal(existsSync(join(home, '.claude')), false, 'the preview writes nothing');

  await assert.rejects(async () => svc.claudeUploadApply('', 'global', []), /at least one/);
  await assert.rejects(async () => svc.claudeUploadApply('', 'global', ['skill:leaky']), /cannot be installed \(secret\)/);
  await assert.rejects(async () => svc.claudeUploadApply('', 'global', ['skill:nope']), /Unknown item/);
  assert.equal(existsSync(join(home, '.claude')), false);

  const done = svc.claudeUploadApply('', 'global', ['skill:good', 'agent:helper']);
  assert.deepEqual(done.installed.map((i) => i.name).sort(), ['good', 'helper']);
  for (const base of ['.claude', '.agents']) {
    assert.equal(readFileSync(join(home, base, 'skills', 'good', 'references', 'a.md'), 'utf8'), 'A');
    assert.equal(existsSync(join(home, base, 'skills', 'good', '.env')), false);
    assert.equal(existsSync(join(home, base, 'skills', 'good', 'keys')), false);
  }
  assert.ok(existsSync(join(home, '.claude', 'agents', 'helper.md')));
  assert.equal(existsSync(join(home, '.agents', 'agents')), false);
  assert.deepEqual(svc.installedSkills('acme').global, ['good']);
  assert.throws(() => svc.claudeUploadPreview('', 'global'), /Choose what to upload first/, 'the upload is used once');

  // Picking again: what is already installed is blocked, not replaced.
  const again = await svc.claudeUploadPick('folder', '', 'global');
  assert.deepEqual(again?.items.filter((i) => i.blocked?.reason === 'installed').map((i) => i.name).sort(), ['good', 'helper']);
  await assert.rejects(async () => svc.claudeUploadApply('', 'global', ['skill:good']), /cannot be installed \(installed\)/);
  // The same upload for a project without a linked folder goes to the project folder.
  const forProject = svc.claudeUploadPreview('acme', 'project');
  assert.equal(forProject.items.find((i) => i.name === 'good')?.blocked, undefined);
  assert.throws(() => svc.claudeUploadPreview('nope', 'project'), /Unknown project/);
  assert.throws(() => svc.claudeUploadPreview('acme', 'root'), /Choose where/);
  svc.claudeUploadApply('acme', 'project', ['skill:good', 'agent:helper']);
  const projectDir = join(root, 'workspace', 'projects', 'acme');
  assert.ok(existsSync(join(projectDir, 'skills', 'good', 'SKILL.md')) && existsSync(join(projectDir, 'agents', 'helper.md')));
  assert.deepEqual(svc.installedSkills('acme').project, ['good']);
  assert.match(svc.launch(openAcme).prompt, /Skills installed for this project \(read workspace\/projects\/acme\/skills\/<name>\/SKILL\.md when one fits the task\): good\./);

  // A linked folder: confirmation and a backup of its .claude first.
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'qa-up-repo-')));
  createProject('up-linked', 'Up linked', root);
  const json = join(root, 'workspace', 'projects', 'up-linked', 'project.json');
  writeFileSync(json, JSON.stringify({ ...JSON.parse(readFileSync(json, 'utf8')), repositories: [{ name: 'app', localPath: repo, linkedFolder: true }] }));
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude', 'settings.json'), '{"before":true}');
  await svc.claudeUploadPick('folder', 'up-linked', 'project');
  assert.throws(() => svc.claudeUploadApply('up-linked', 'project', ['skill:good']), /Confirm the install/);
  assert.equal(existsSync(join(repo, '.claude', 'skills')), false);
  const linked = svc.claudeUploadApply('up-linked', 'project', ['skill:good'], true);
  assert.ok(existsSync(join(repo, '.claude', 'skills', 'good', 'SKILL.md')));
  assert.equal(readFileSync(join(linked.backup!, '.claude', 'settings.json'), 'utf8'), '{"before":true}');
  assert.equal(existsSync(join(linked.backup!, '.claude', 'skills')), false);

  for (const dir of [home, src, repo, join(root, 'workspace', 'projects', 'up-linked'), join(projectDir, 'skills'), join(projectDir, 'agents')]) rmSync(dir, { recursive: true, force: true });
});

test('upload from a zip: layouts, limits, unsafe paths, and a failure undoes everything', async () => {
  const home = mkdtempSync(join(tmpdir(), 'qa-upz-home-'));
  const dir = mkdtempSync(join(tmpdir(), 'qa-upz-'));
  const skill = (name: string) => `---\nname: ${name}\ndescription: Does ${name}\n---`;
  let file = join(dir, 'a.zip');
  const svc = createService(root, { ...noLaunch, home, pickFile: async () => file });
  const pick = (entries: [string, string][]) => { writeFileSync(file, zip(entries)); return svc.claudeUploadPick('zip', '', 'global'); };

  // A zipped skill folder: the name comes from the header.
  let view = await pick([['one/SKILL.md', skill('one')], ['one/refs/a.md', 'A']]);
  assert.deepEqual(view?.items.map((i) => [i.kind, i.name, i.files]), [['skill', 'one', 2]]);
  // skills/ and agents/ at the top, a .claude inside a folder.
  view = await pick([['skills/s1/SKILL.md', skill('s1')], ['agents/a1.md', skill('a1')]]);
  assert.deepEqual(view?.items.map((i) => i.name).sort(), ['a1', 's1']);
  view = await pick([['p/.claude/skills/s2/SKILL.md', skill('s2')], ['p/.claude/settings.json', '{}'], ['p/CLAUDE.md', 'x']]);
  assert.deepEqual(view?.items.map((i) => i.name), ['s2']);
  assert.deepEqual(view?.ignored.map((i) => i.path).sort(), ['CLAUDE.md', 'settings.json']);

  await assert.rejects(pick([['a/SKILL.md', skill('a')], ['../evil.md', 'x']]), /unsafe path/);
  await assert.rejects(pick([['/abs/SKILL.md', skill('a')]]), /unsafe path/);
  await assert.rejects(pick([['skills\\x\\SKILL.md', skill('x')]]), /unsafe path/);
  await assert.rejects(pick([['readme.txt', 'x']]), /No \.claude folder/);
  await assert.rejects(pick(Array.from({ length: 1001 }, (_, i): [string, string] => [`skills/s/f${i}`, 'x'])), /more than 1000 files/);
  await assert.rejects(pick([['SKILL.md', skill('big')], ['big.bin', 'x'.repeat(5 * 1024 * 1024 + 1)]]), /larger than 5 MB/);
  writeFileSync(file, 'not a zip');
  await assert.rejects(svc.claudeUploadPick('zip', '', 'global'), /Could not read the ZIP|not a ZIP/);
  await assert.rejects(svc.claudeUploadPick('other', '', 'global'), /folder or a \.zip/);
  await assert.rejects(createService(root, { ...noLaunch, home }).claudeUploadPick('zip'), /not available here/);

  // A failure in the second skill removes the first one too (a file and a folder with the same name).
  await pick([['skills/aaa/SKILL.md', skill('aaa')], ['skills/zzz/SKILL.md', skill('zzz')], ['skills/zzz/x', 'file'], ['skills/zzz/x/y', 'under a file']]);
  assert.throws(() => svc.claudeUploadApply('', 'global', ['skill:aaa', 'skill:zzz']), /Nothing was installed/);
  assert.equal(existsSync(join(home, '.claude')), false, 'everything created was removed');
  assert.equal(existsSync(join(home, '.agents')), false);
  for (const d of [home, dir]) rmSync(d, { recursive: true, force: true });
});

test('non-ASCII prompts reach Windows tools through a UTF-8 request file', () => {
  const prompt = 'Review it. Additional instructions: permissões & ação "crítica".';
  assert.equal(windowsSafePrompt('plain ascii', 'acme', root, 'win32'), 'plain ascii');
  assert.equal(windowsSafePrompt(prompt, 'acme', root, 'linux'), prompt);
  const pointer = windowsSafePrompt(prompt, 'acme', root, 'win32');
  assert.match(pointer, /^[\x20-\x7e]+$/);
  const file = pointer.match(/workspace\/projects\/acme\/temporary\/request-[^ ]+\.md/)?.[0];
  assert.ok(file);
  assert.equal(readFileSync(join(root, file), 'utf8').trim(), prompt);
});

test('app plugins load only in app sessions: Claude by folder, Codex as one line of instructions', { skip: process.platform === 'win32' }, () => {
  const bin = mkdtempSync(join(tmpdir(), 'qa-bin-'));
  writeFileSync(join(bin, 'rtk'), '#!/bin/sh\n', { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`; // keeps node and which; rtk is the fake one, or none once removed
  try {
    const dir = join('/home/u/qa', 'adapters', 'app-plugins');
    assert.deepEqual(pluginArgs('claude', '/home/u/qa'), ['--plugin-dir', join(dir, 'ponytail'), '--plugin-dir', join(dir, 'rtk')]);
    const [flag, value] = pluginArgs('codex', '/home/u/qa');
    assert.equal(flag, '-c');
    assert.match(value, /^developer_instructions=Ponytail .*SKILL\.md.* rtk /);
    assert.doesNotMatch(value, /["\n%]/); // survives launcher scripts and cmd.exe quoting
    assert.deepEqual(pluginArgs('gemini', '/home/u/qa'), []);
    // caveman only when the project turned it on
    assert.deepEqual(pluginArgs('claude', '/home/u/qa', ['caveman']).slice(-2), ['--plugin-dir', join(dir, 'caveman')]);
    assert.doesNotMatch(value, /caveman/i);
    assert.match(pluginArgs('codex', '/home/u/qa', ['caveman'])[1], /Caveman .*caveman.*SKILL\.md/);
    assert.deepEqual(pluginArgs('claude', '/home/u/qa', ['superpowers']).slice(-2), ['--plugin-dir', join(dir, 'superpowers')]);
    assert.doesNotMatch(value, /superpowers/i);
    assert.match(pluginArgs('codex', '/home/u/qa', ['superpowers'])[1], /Superpowers .*using-superpowers.*SKILL\.md/);
    rmSync(join(bin, 'rtk'));
    process.env.PATH = (path ?? '').split(':').filter((d) => !existsSync(join(d, 'rtk'))).join(':');
    assert.deepEqual(pluginArgs('claude', '/home/u/qa'), ['--plugin-dir', join(dir, 'ponytail')]);
    assert.doesNotMatch(pluginArgs('codex', '/home/u/qa')[1], /rtk/);
  } finally {
    process.env.PATH = path;
    rmSync(bin, { recursive: true, force: true });
  }
});

test('launcher keeps user text out of any shell command line', () => {
  const sh = scriptFor('gemini', ['-i', "it's $(rm -rf ~) `x` ação"], '/home/u/qa', 'QA');
  assert.ok(sh.split('\n').includes("cd '/home/u/qa' || exit 1"));
  assert.ok(sh.split('\n').includes("gemini '-i' 'it'\\''s $(rm -rf ~) `x` ação'"));
  const win = windowsStartArgs('C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\Júlia\\qa\\run-tool.mjs', 'C:\\t\\open.json', 'Moki - "X"');
  assert.equal(win, '/d /s /c "start "Moki - X" "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\Júlia\\qa\\run-tool.mjs" "C:\\t\\open.json""');
});

test('install plans: fixed vendor commands per system for every terminal AI; editors are downloaded, not installed', () => {
  assert.deepEqual(installPlan('claude', 'linux'), { file: '/bin/sh', args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'], shown: 'curl -fsSL https://claude.ai/install.sh | bash' });
  assert.equal(installPlan('claude', 'win32')?.file, 'powershell.exe');
  assert.equal(installPlan('claude', 'win32')?.shown, 'irm https://claude.ai/install.ps1 | iex');
  assert.equal(installPlan('codex', 'darwin')?.shown, 'npm install -g @openai/codex');
  assert.equal(installPlan('gemini', 'win32')?.shown, 'npm install -g @google/gemini-cli');
  assert.equal(installPlan('cursor-agent', 'linux')?.shown, 'curl https://cursor.com/install -fsS | bash');
  assert.equal(installPlan('cursor-agent', 'win32')?.shown, "irm 'https://cursor.com/install?win32=true' | iex");
  assert.equal(installPlan('antigravity', 'darwin')?.shown, 'curl -fsSL https://antigravity.google/cli/install.sh | bash');
  assert.equal(installPlan('antigravity', 'win32')?.shown, 'irm https://antigravity.google/cli/install.ps1 | iex');
  for (const t of ['cursor', 'vscode', 'chat', 'print'] as ToolKey[]) assert.equal(installPlan(t, 'linux'), null);
  for (const t of Object.values(TOOLS)) if (t.install) assert.match(t.install.docs, /^https:\/\//);
  for (const t of [TOOLS.cursor, TOOLS.vscode]) assert.match(t.download ?? '', /^https:\/\//);
  assert.equal(TOOLS.vscode.mokiExtension, 'supported');
  assert.equal(TOOLS.cursor.mokiExtension, 'unverified');
});

test('a missing installable tool opens run-tool in the tab; the request carries the tool and one prompt argument', { skip: process.platform === 'win32' }, () => {
  const bin = mkdtempSync(join(tmpdir(), 'qa-empty-'));
  const home = mkdtempSync(join(tmpdir(), 'qa-home-'));
  const root = mkdtempSync(join(tmpdir(), 'qa-root-'));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, SHELL: process.env.SHELL };
  process.env.PATH = bin; process.env.HOME = home; process.env.SHELL = '/bin/false';
  try {
    const specs: TermSpec[] = [];
    const r = launchInTerminal('claude', 'olá mundo', root, (spec) => { specs.push(spec); return 't1'; });
    assert.equal(r.opened, true);
    assert.equal(specs[0].file, process.execPath);
    assert.equal(specs[0].env?.ELECTRON_RUN_AS_NODE, '1');
    const req = JSON.parse(readFileSync(specs[0].args[1], 'utf8'));
    assert.equal(req.tool, 'claude');
    assert.equal(req.command, 'claude');
    assert.equal(req.args.at(-1), 'olá mundo');
    // Every terminal AI has an install plan now: a missing Gemini opens run-tool too, with its own request.
    const gemini: TermSpec[] = [];
    assert.equal(launchInTerminal('gemini', 'x', root, (spec) => { gemini.push(spec); return 't2'; }).opened, true);
    assert.equal(JSON.parse(readFileSync(gemini[0].args[1], 'utf8')).tool, 'gemini');
  } finally {
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    for (const d of [bin, home, root]) rmSync(d, { recursive: true, force: true });
  }
});

test('run-tool: a missing tool shows the instructions and asks; anything but y installs nothing', { skip: process.platform === 'win32' }, () => {
  const bin = mkdtempSync(join(tmpdir(), 'qa-empty-'));
  const dir = mkdtempSync(join(tmpdir(), 'qa-req-'));
  const file = join(dir, 'req.json');
  writeFileSync(file, JSON.stringify({ command: 'claude', args: ['--', 'x'], cwd: dir, title: 'Claude Code', tool: 'claude' }));
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'desktop', 'run-tool.ts'), file], { input: 'n\n\n', encoding: 'utf8', env: { PATH: bin, HOME: dir } });
    assert.match(r.stdout, /Installation instructions: https:\/\/code\.claude\.com\/docs\/en\/setup/);
    assert.match(r.stdout, /Install Claude Code\? \[y\/N\]/);
    assert.match(r.stderr, /Not installed/);
    assert.equal(r.status, 1);
  } finally {
    rmSync(bin, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true });
  }
});

test('terminal tabs start only the chosen tool, in the framework root, with the prompt as one argument', { skip: process.platform === 'win32' }, () => {
  const bin = mkdtempSync(join(tmpdir(), 'qa-bin-'));
  writeFileSync(join(bin, 'claude'), '#!/bin/sh\n', { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const specs: TermSpec[] = [];
    const r = launchInTerminal('claude', "it's $(rm -rf ~)\nação", '/home/u/qa', (spec) => { specs.push(spec); return 't7'; });
    assert.deepEqual(r.terminal, { id: 't7', title: 'Claude Code' });
    const plugins = pluginArgs('claude', '/home/u/qa');
    // The prompt after "--" (never read as an option); the tab is named after the tool.
    assert.deepEqual(specs, [{ file: 'claude', args: [...plugins, '--', "it's $(rm -rf ~) ação"], cwd: '/home/u/qa', title: 'Claude Code' }] as TermSpec[]);
    launchInTerminal('claude', '', '/home/u/qa', (spec) => { specs.push(spec); return 't8'; }); // "+" menu: the tool alone
    assert.deepEqual(specs[1], { file: 'claude', args: plugins, cwd: '/home/u/qa', title: 'Claude Code' });
    assert.throws(() => launchInTerminal('vscode', 'x', '/home/u/qa', () => 'never'), /does not run in a terminal/);
  } finally {
    process.env.PATH = path;
    rmSync(bin, { recursive: true, force: true });
  }
});

test('markdown tables draw merged cells (<< and ^^) as one cell', () => {
  const html = markdownToHtml('| Wide | << | << |\n| --- | --- | --- |\n| Tall | b | c |\n| ^^ | e | f |\n| 2x2 | << | g |\n| ^^ | << | h |\n| \\<< | \\^^ | x |');
  assert.equal(html, '<table><thead><tr><th colspan="3">Wide</th></tr></thead><tbody><tr><td rowspan="2">Tall</td><td>b</td><td>c</td></tr><tr><td>e</td><td>f</td></tr>'
    + '<tr><td colspan="2" rowspan="2">2x2</td><td>g</td></tr><tr><td>h</td></tr><tr><td>&lt;&lt;</td><td>^^</td><td>x</td></tr></tbody></table>');
});

test('markdown rendering escapes HTML and attribute injection', () => {
  const html = markdownToHtml('[x](a"onmouseover="alert(1)) <img src=x onerror=alert(1)> **ok**');
  assert.doesNotMatch(html, /<img|"onmouseover|" onmouseover/);
  // Only embedded raster images become <img>: no remote images, no attribute injection.
  assert.doesNotMatch(markdownToHtml('![a](https://x/y.png) ![b](data:image/png;base64,AA" onerror="x) ![c](data:image/svg+xml;base64,AA)'), /<img/);
  assert.match(html, /<strong>ok<\/strong>/);
});

test('markdown relative images are embedded from inside the project only', () => {
  const project = join(root, 'workspace', 'projects', 'acme');
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  mkdirSync(join(project, 'inbox', 'img'), { recursive: true });
  writeFileSync(join(project, 'inbox', 'img', 'shot one.png'), png);
  writeFileSync(join(project, 'inbox', 'logo.svg'), '<svg onload="alert(1)"/>');
  writeFileSync(join(root, 'outside.png'), png);
  const text = '![shot](img/shot%20one.png) ![up](../../../../outside.png) ![svg](logo.svg) ![web](https://x/y.png) ![none](img/missing.png)';
  writeFileSync(join(project, 'inbox', 'images.md'), text);
  const md = service.readFile('acme', 'inbox/images.md') as Extract<FileContent, { kind: 'markdown' }>;
  const imgs = md.html.match(/<img [^>]*>/g) ?? [];
  assert.deepEqual(imgs, [`<img alt="shot" src="data:image/png;base64,${png.toString('base64')}">`]);
  // The preview of unsaved edits embeds them the same way, only when told the project and the file.
  assert.match(service.renderMarkdown(`x ${text}`, 'acme', 'inbox/images.md'), /<img alt="shot" src="data:image\/png;base64,/);
  assert.doesNotMatch(service.renderMarkdown(text), /<img/);
  assert.doesNotMatch(service.renderMarkdown(text, '../..', 'inbox/images.md'), /<img/);
});

test('docx extraction keeps headings, lists and tables', () => {
  const md = docxToMarkdown(makeDocx());
  assert.match(md, /^## US-1 Renovação$/m);
  assert.match(md, /^- Item A$/m);
  assert.match(md, /^\| AC1 \| a \\\| b & c \|$/m);
  assert.match(md, /^A B na caixa depois$/m); // tab, text box kept once, text after the box
  assert.match(markdownToHtml(md), /<td>a \| b &amp; c<\/td>/);
  assert.deepEqual(readableInputs(['workspace/x/inbox/a.md'], root), ['workspace/x/inbox/a.md']);
  assert.throws(() => docxToMarkdown(zip([['other.xml', '<x/>']])), /Not a Word document/);
});

test('docx extraction keeps formatting, numbered lists, links, notes, comments and images', () => {
  const W = (body: string) => `<w:document><w:body>${body}</w:body></w:document>`;
  const rels = (items: string) => `<Relationships>${items}</Relationships>`;
  const docx = zip([
    ['word/document.xml', W('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t xml:space="preserve"> and </w:t></w:r><w:r><w:rPr><w:i/><w:strike/></w:rPr><w:t>gone</w:t></w:r>'
      + '<w:r><w:t xml:space="preserve"> *literal* </w:t></w:r><w:hyperlink r:id="rIdL"><w:r><w:t>site</w:t></w:r></w:hyperlink><w:r><w:footnoteReference w:id="2"/></w:r><w:r><w:commentReference w:id="0"/></w:r></w:p>'
      + '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>first</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>nested</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>1. not a list</w:t></w:r><w:r><w:br/><w:t>second line</w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>hidden</w:t></w:r></w:p>'
      + '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>wide</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>c</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc><w:tc><w:p><w:r><w:t>z</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
      + '<w:p><w:r><w:drawing><wp:docPr id="1" name="Shot" descr="Login screen"/><a:blip r:embed="rIdI"/></w:drawing></w:r></w:p>')],
    ['word/_rels/document.xml.rels', rels('<Relationship Id="rIdL" Type="x/hyperlink" Target="https://example.com/a b" TargetMode="External"/><Relationship Id="rIdI" Type="x/image" Target="media/i.png"/>'
      + '<Relationship Id="rN" Type="x/numbering" Target="numbering.xml"/><Relationship Id="rF" Type="x/footnotes" Target="footnotes.xml"/><Relationship Id="rC" Type="x/comments" Target="comments.xml"/>')],
    ['word/numbering.xml', '<w:numbering><w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num></w:numbering>'],
    ['word/footnotes.xml', '<w:footnotes><w:footnote w:id="2"><w:p><w:r><w:t>The note.</w:t></w:r></w:p></w:footnote></w:footnotes>'],
    ['word/comments.xml', '<w:comments><w:comment w:id="0" w:author="Ana"><w:p><w:r><w:t>Check this.</w:t></w:r></w:p></w:comment></w:comments>'],
    ['word/media/i.png', Buffer.from('iVBORw0KGgo=', 'base64')],
  ]);
  const md = docxToMarkdown(docx);
  assert.match(md, /^\*\*bold\*\* and \*~~gone~~\* \\\*literal\\\* \[site\]\(https:\/\/example\.com\/a%20b\)¹\[comment 1\]$/m);
  assert.match(md, /^1\. first\n  - nested$/m);
  assert.match(md, /^1\\\. not a list {2}\nsecond line$/m);
  assert.match(md, /^\| wide \|  \| c \|$/m);
  assert.match(md, /\[image: Login screen\]/);
  assert.match(md, /^¹ The note\.$/m);
  assert.match(md, /^\*\*Comment 1\*\* — Ana: Check this\.$/m);
  const html = markdownToHtml(docxToMarkdown(docx, { preview: true }));
  assert.match(html, /<img alt="Login screen" src="data:image\/png;base64,iVBORw0KGgo=">/);
  assert.match(html, /<strong>bold<\/strong> and <em><del>gone<\/del><\/em> \*literal\*/);
  assert.match(html, /<p>1\. not a list<br>second line<\/p>/);
  assert.match(html, /<thead><tr><th colspan="2">wide<\/th><th>c<\/th><\/tr><\/thead>/, 'the preview draws a merged cell once');
  assert.match(md, /^\| wide \|  \| c \|$/m, 'the AI text keeps the columns with empty cells');
});

test('spreadsheet number formats show values as the spreadsheet programs do', () => {
  const f = (v: number, code: string) => formatNumber(v, code, { locale: 'en-US' });
  assert.equal(f(0.1 + 0.2, 'General'), '0.3');
  assert.equal(f(1234567.891, '#,##0.00'), '1,234,567.89');
  assert.equal(f(1999.9, '[$R$-416] #,##0.00'), 'R$ 1,999.90');
  assert.equal(f(-1234.5, '#,##0.00;(#,##0.00)'), '(1,234.50)');
  assert.equal(f(0, '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-'), ' - ');
  assert.equal(f(0.875, '0.0%'), '87.5%');
  assert.equal(f(1.75, '# ?/?'), '1 3/4');
  assert.equal(f(0.000123, '0.00E+00'), '1.23E-04');
  assert.equal(f(1234, '00000'), '01234');
  assert.equal(f(1310100, '00000-000'), '01310-100');
  assert.equal(f(12345678909, '000\\.000\\.000-00'), '123.456.789-09');
  assert.equal(f(1500000, '#,##0.0,," M"'), '1.5 M');
  assert.equal(f(46319.6041666667, 'dd/mm/yyyy hh:mm'), '24/10/2026 14:30');
  assert.equal(f(46319, 'd-mmm-yy'), '24-Oct-26');
  assert.equal(f(0.604166666666666, 'h:mm AM/PM'), '2:30 PM');
  assert.equal(f(1.5, '[h]:mm:ss'), '36:00:00');
  assert.equal(formatNumber(44857, 'dd/mm/yyyy', { locale: 'en-US', date1904: true }), '24/10/2026');
  assert.equal(formatNumber(1234.5, '#,##0.00', { locale: 'pt-BR' }), '1.234,50');
});

test('installer framework sync refreshes framework files and never touches workspace/', () => {
  const bundled = mkdtempSync(join(tmpdir(), 'qa-bundle-'));
  const target = mkdtempSync(join(tmpdir(), 'qa-installed-'));
  try {
    mkdirSync(join(bundled, 'skills', 'a'), { recursive: true });
    writeFileSync(join(bundled, 'skills', 'a', 'SKILL.md'), 'v1');
    writeFileSync(join(bundled, 'AGENTS.md'), 'agents v1');
    mkdirSync(join(bundled, 'workspace'), { recursive: true });
    writeFileSync(join(bundled, 'workspace', 'README.md'), 'readme');

    assert.equal(syncFramework(bundled, target, 'build-1'), true);
    assert.equal(readFileSync(join(target, 'skills', 'a', 'SKILL.md'), 'utf8'), 'v1');
    assert.ok(existsSync(join(target, 'workspace', 'projects')));

    // The user's data, plus a stale framework file.
    mkdirSync(join(target, 'workspace', 'projects', 'p', 'runs'), { recursive: true });
    writeFileSync(join(target, 'workspace', 'projects', 'p', 'notes.md'), 'keep me');
    writeFileSync(join(target, 'skills', 'stale.md'), 'old');

    assert.equal(syncFramework(bundled, target, 'build-1'), false, 'same build: nothing to do');
    writeFileSync(join(bundled, 'skills', 'a', 'SKILL.md'), 'v2');
    assert.equal(syncFramework(bundled, target, 'build-2'), true);
    assert.equal(readFileSync(join(target, 'skills', 'a', 'SKILL.md'), 'utf8'), 'v2');
    assert.equal(existsSync(join(target, 'skills', 'stale.md')), false);
    assert.equal(readFileSync(join(target, 'workspace', 'projects', 'p', 'notes.md'), 'utf8'), 'keep me');
  } finally {
    rmSync(bundled, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('installed copies keep the framework in QA_ROOT, the legacy folder or <Documents>/Moki', () => {
  const docs = mkdtempSync(join(tmpdir(), 'qa-docs-'));
  const saved = process.env.QA_ROOT;
  try {
    delete process.env.QA_ROOT;
    assert.equal(frameworkTarget(docs), join(docs, 'Moki'));
    mkdirSync(join(docs, 'Quality Agents'));
    assert.equal(frameworkTarget(docs), join(docs, 'Quality Agents'));
    process.env.QA_ROOT = join(docs, 'custom');
    assert.equal(frameworkTarget(docs), join(docs, 'custom'));
  } finally {
    if (saved === undefined) delete process.env.QA_ROOT; else process.env.QA_ROOT = saved;
    rmSync(docs, { recursive: true, force: true });
  }
});

test('UI requests run only service methods and return their errors as messages', async () => {
  const listed = await callService(service, 'projects', []);
  assert.ok(listed.ok);
  assert.ok((listed.value as { id: string }[]).some((p) => p.id === 'acme'));
  for (const method of ['nope', 'constructor', '__proto__', 'toString', 42, null]) {
    assert.deepEqual(await callService(service, method, []), { ok: false, error: 'Unknown action.' }, String(method));
  }
  const failed = await callService(service, 'run', ['nope', RUN]);
  assert.ok(!failed.ok && failed.error && failed.error !== 'Unknown action.');
});

test('note windows: only notes/<file>.md of a listed project or a loose note id, one window per note', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const file = parseNoteRequest({ project: 'acme', path: 'notes/a.md', theme: 'light' }, root);
  assert.ok(file);
  assert.deepEqual(file, { project: 'acme', path: 'notes/a.md', loose: null, theme: 'light' });
  assert.equal(noteKey(file), 'file:acme:notes/a.md');
  assert.deepEqual(noteQuery(file), { view: 'note', project: 'acme', path: 'notes/a.md' });
  const loose = parseNoteRequest({ loose: id }, root);
  assert.ok(loose);
  assert.equal(noteKey(loose), `loose:${id}`);
  assert.deepEqual(noteQuery(loose), { view: 'note', loose: id });
  const fresh = parseNoteRequest({ loose: 'new' }, root);
  assert.ok(fresh);
  assert.equal(noteKey(fresh), '', 'a new note always gets its own window');
  const bad = [null, 'x', {}, { path: 'notes/a.md' }, { project: 'nope', path: 'notes/a.md' }, { project: 'acme', path: '../secret.md' },
    { project: 'acme', path: 'notes/../../x.md' }, { project: 'acme', path: 'inbox/us-1.md' }, { project: 'acme', loose: id }, { loose: 'abc' }];
  for (const raw of bad) assert.equal(parseNoteRequest(raw, root), null, JSON.stringify(raw));
});

test('fs-guard sandbox and file type rules', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-sandbox-'));
  try {
    mkdirSync(join(base, 'inbox'));
    writeFileSync(join(base, 'inbox', 'us.md'), 'x');
    assert.ok(resolveInside(base, 'inbox/us.md').endsWith('us.md'));
    assert.throws(() => resolveInside(base, 'inbox/../../outside.txt'), PathError);
    try {
      symlinkSync(tmpdir(), join(base, 'link'), 'junction');
      assert.throws(() => resolveInside(base, 'link'), PathError);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EPERM') throw e;
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
  assert.equal(isEditable('a.md'), true);
  assert.equal(isEditable('state.json'), false);
  assert.equal(isOpenable('report.xlsx'), true);
  assert.equal(isOpenable('run.bat'), false);
});

test('workspaces: each one has its own projects; requests name a workspace outside the default', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'qa-vault-'));
  let pick: string | null = outside;
  const svc = createService(root, { launch: (tool, prompt): LaunchResult => { launched.push({ tool, prompt }); return { opened: true, message: '' }; }, openFolder: () => {}, openPath: () => {}, pickFolder: async () => pick });
  try {
    const start = svc.workspaces();
    assert.equal(start.active, 'default');
    assert.deepEqual(start.list.map((w) => [w.id, w.isDefault]), [['default', true]]);
    const defaultProjects = svc.projects().map((p) => p.id);
    assert.ok(defaultProjects.includes('acme'));

    const client = svc.createWorkspace('Cliente X');
    assert.equal(client.path, join(root, 'workspaces', 'cliente-x'));
    assert.equal(svc.workspaces().active, client.id);
    assert.deepEqual(svc.projects(), [], 'a new workspace starts empty');
    assert.throws(() => svc.createWorkspace('Cliente X'), /already/);
    const made = svc.createProject('Portal');
    assert.ok(existsSync(join(client.path, 'projects', 'portal', 'project.json')));
    assert.ok(!existsSync(join(root, 'workspace', 'projects', 'portal')));
    writeFileSync(join(client.path, 'projects', 'portal', 'inbox', 'us.md'), '# US');
    const r = svc.launch({ project: made.id, activity: 'review', tool: 'print', files: ['us.md'], language: 'English', note: '' });
    const label = client.path.split(sep).join('/');
    assert.ok(r.prompt.includes(`Workspace folder: ${label}.`));
    assert.ok(r.prompt.includes(`${label}/projects/portal/inbox/us.md`));
    assert.throws(() => svc.readFile('acme', 'context/index.md'), /Unknown project/, 'projects of other workspaces are not reachable');

    const opened = await svc.openWorkspaceFolder();
    assert.equal(opened?.path, outside);
    assert.ok(existsSync(join(outside, 'projects')));
    assert.equal((await svc.openWorkspaceFolder())?.id, opened?.id, 'the same folder is not listed twice');
    pick = root;
    await assert.rejects(svc.openWorkspaceFolder(), /Moki folder itself/);

    assert.equal(svc.renameWorkspace('default', 'Principal').name, 'Principal');
    assert.throws(() => svc.forgetWorkspace('default'), /cannot be removed/);
    svc.forgetWorkspace(opened!.id);
    assert.ok(existsSync(join(outside, 'projects')), 'removing from the list keeps the folder');
    svc.selectWorkspace('default');
    assert.ok(svc.projects().some((p) => p.id === 'acme'));
    assert.doesNotMatch(svc.launch({ project: 'acme', activity: 'open', tool: 'print', files: [], language: 'English', note: '' }).prompt, /Workspace folder/);
  } finally {
    svc.selectWorkspace('default');
    rmSync(join(root, 'workspaces'), { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('search: projects by name, files by name and text, filters by tag', () => {
  const inbox = join(root, 'workspace', 'projects', 'acme', 'inbox');
  writeFileSync(join(inbox, 'renewal.md'), '# Story\n\nThe user renews the Loan before the due date.');
  try {
    assert.deepEqual(service.search('', []), { projects: [], files: [], truncated: false }, 'nothing asked, nothing listed');
    assert.deepEqual(service.search('acm', []).projects.map((p) => p.id), ['acme']);
    const hit = service.search('LOAN', []).files.find((f) => f.path === 'inbox/renewal.md');
    assert.ok(hit, 'content matches ignore case');
    assert.equal(hit.line, 3);
    assert.match(hit.snippet, /renews the Loan before/);
    assert.ok(service.search('renewal', []).files.some((f) => f.path === 'inbox/renewal.md'), 'file names match too');

    const tag = service.saveTag({ name: 'Emprestimos' });
    assert.deepEqual(service.search('', [tag.id]).files, [], 'no file has the tag yet');
    service.setFileTags('acme', 'inbox/renewal.md', [tag.id]);
    assert.deepEqual(service.search('', [tag.id]).files.map((f) => f.path), ['inbox/renewal.md']);
    assert.deepEqual(service.search('', [tag.id]).projects, [], 'the project itself has no tag');
    assert.deepEqual(service.search('story', [tag.id]).files.map((f) => f.path), ['inbox/renewal.md'], 'text and tag together');
    service.setProjectTags('acme', [tag.id]);
    assert.deepEqual(service.search('', [tag.id]).projects.map((p) => p.id), ['acme']);
  } finally {
    service.setProjectTags('acme', []);
    rmSync(join(inbox, 'renewal.md'), { force: true });
    rmSync(join(root, 'workspace', 'projects', 'acme', 'tags.json'), { force: true });
    rmSync(join(root, 'workspace', 'tags.json'), { force: true });
  }
});

// ---- ArtCraft apps download (scripts/lib/core.ts CRAFT_APPS, desktop/craft-download.ts) ----

test('expanded search: prefixes distinguish projects, file names and contents', async () => {
  const inbox = join(root, 'workspace', 'projects', 'acme', 'inbox');
  const textFile = join(inbox, 'search-proof.txt');
  const otherFile = join(inbox, 'search-proof.png');
  const wordFile = join(inbox, 'search-proof.docx');
  const pdfFile = join(inbox, 'search-proof.pdf');
  const xlsxFile = join(inbox, 'search-proof.xlsx');
  writeFileSync(textFile, 'A distinctive phrase: quasarneedle');
  writeFileSync(otherFile, 'not an image');
  writeFileSync(wordFile, makeDocx());
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('pdfuniqueneedle');
  writeFileSync(pdfFile, await pdf.save());
  const layout = JSON.parse(readFileSync(join(ROOT, 'skills', 'test-design', 'assets', 'test-cases.layout.json'), 'utf8'));
  writeFileSync(xlsxFile, buildXlsx(layout, { testCases: [{ source: 'spreadsheetuniqueneedle' }] }));
  try {
    assert.ok((await service.searchExpanded('projeto: acm', [])).projects.some((p) => p.id === 'acme'));
    assert.equal((await service.searchExpanded('projeto: acm', [])).files.length, 0);
    assert.ok((await service.searchExpanded('arquivo: search-proof', [])).files.some((f) => f.path.endsWith('.png')));
    assert.ok((await service.searchExpanded('conteudo: quasarneedle', [])).files.some((f) => f.path.endsWith('.txt')));
    assert.ok((await service.searchExpanded('conteudo: na caixa', [])).files.some((f) => f.path.endsWith('.docx')));
    assert.ok((await service.searchExpanded('conteudo: pdfuniqueneedle', [])).files.some((f) => f.path.endsWith('.pdf')));
    assert.ok((await service.searchExpanded('conteudo: spreadsheetuniqueneedle', [])).files.some((f) => f.path.endsWith('.xlsx')));
    assert.equal((await service.searchExpanded('conteudo: search-proof', [])).files.length, 0);
  } finally {
    rmSync(textFile, { force: true });
    rmSync(otherFile, { force: true });
    rmSync(wordFile, { force: true });
    rmSync(pdfFile, { force: true });
    rmSync(xlsxFile, { force: true });
  }
});

test('craft apps: fixed list with unique ids and a storytold repo', () => {
  assert.equal(CRAFT_APPS.length, 16);
  assert.equal(CRAFT_APPS[0].id, 'artcraft-launcher');
  assert.equal(new Set(CRAFT_APPS.map((a) => a.id)).size, CRAFT_APPS.length);
  for (const a of CRAFT_APPS) assert.match(a.repo, /^storytold\/[a-z-]+$/);
});

test('craft apps: Linux package family from os-release', () => {
  const fam = linuxPackageFamily;
  assert.equal(fam('ID=fedora\nVERSION_ID=44'), 'rpm');
  assert.equal(fam('NAME="Rocky Linux"\nID="rocky"\nID_LIKE="rhel centos fedora"'), 'rpm');
  assert.equal(fam('ID=opensuse-tumbleweed\nID_LIKE="opensuse suse"'), 'rpm');
  assert.equal(fam('ID=ubuntu\nID_LIKE=debian'), 'deb');
  assert.equal(fam('ID=linuxmint\nID_LIKE="ubuntu debian"'), 'deb');
  assert.equal(fam('ID=arch'), '');
  assert.equal(fam(''), '');
  assert.equal(fam("ID='debian'"), 'deb');
});

test('craft apps: the files for each system, recommended first, and exact names only', () => {
  const ends = craftAssetEndings;
  assert.deepEqual(ends('win32', 'x64', ''), ['windows-x64.msi', 'windows-x64-portable.zip']);
  assert.deepEqual(ends('win32', 'arm64', ''), ['windows-arm64.msi', 'windows-arm64-portable.zip']);
  assert.deepEqual(ends('win32', 'ia32', ''), ['windows-x86.msi', 'windows-x86-portable.zip']);
  assert.deepEqual(ends('darwin', 'arm64', ''), ['macos-universal.dmg']);
  assert.deepEqual(ends('linux', 'x64', 'rpm'), ['linux-x86_64.rpm', 'linux-x86_64.AppImage', 'linux-x86_64.tar.gz']);
  assert.deepEqual(ends('linux', 'arm64', 'deb'), ['linux-aarch64.deb', 'linux-aarch64.AppImage', 'linux-aarch64.tar.gz']);
  assert.deepEqual(ends('linux', 'riscv64', ''), ['linux-riscv64.AppImage', 'linux-riscv64.tar.gz']);
  assert.deepEqual(ends('freebsd', 'x64', ''), []);
  assert.deepEqual(ends('linux', 'ppc64', 'rpm'), []);
  const app = CRAFT_APPS[1]; // wordcraft
  const assets = ['wordcraft-1.0.0-linux-x86_64.tar.gz', 'wordcraft-cli-1.0.0-linux-x86_64.AppImage', 'wordcraft-1.0.0-linux-x86_64.deb', 'wordcraft-1.0.0-linux-x86_64.rpm', 'wordcraft-1.0.0-windows-x86.msi'].map((name) => ({ name }));
  const names = (v: string, p: string, a: string, f: string) => pickCraftAssets(app, v, assets, p, a, f).map((x) => x.name);
  assert.deepEqual(names('1.0.0', 'linux', 'x64', 'rpm'), ['wordcraft-1.0.0-linux-x86_64.rpm', 'wordcraft-1.0.0-linux-x86_64.tar.gz']); // .deb never for rpm; cli does not match
  assert.deepEqual(names('1.0.0', 'linux', 'x64', ''), ['wordcraft-1.0.0-linux-x86_64.tar.gz']);
  assert.deepEqual(names('1.0.0', 'win32', 'x64', ''), []); // no x64 -> x86 fallback
  assert.deepEqual(names('2.0.0', 'linux', 'x64', 'rpm'), []);
  assert.deepEqual(names('1.0.0', 'darwin', 'arm64', ''), []);
});

{
  const BODY = Buffer.from('pretend installer');
  const SHA = createHash('sha256').update(BODY).digest('hex');
  const app = CRAFT_APPS.find((a) => a.id === 'wordcraft')!;
  const NAME = 'wordcraft-1.2.3-linux-x86_64.AppImage';
  const system = { platform: 'linux', arch: 'x64', family: '' };
  type Opts = { status?: number; digest?: string | null; sums?: string | null; body?: Buffer; tag?: string; assets?: string[]; throws?: Error };
  const release = (o: Opts) => ({
    tag_name: o.tag ?? 'v1.2.3',
    assets: [...(o.assets ?? [NAME]), ...(o.sums !== undefined && o.sums !== null ? ['SHA256SUMS.txt'] : [])]
      .map((name) => ({ name, size: BODY.length, ...(name === NAME && o.digest !== null ? { digest: `sha256:${o.digest ?? SHA}` } : {}) })),
  });
  const calls: string[] = [];
  const fakeFetch = (o: Opts = {}) => (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (o.throws) throw o.throws;
    if (o.status) return new Response('x', { status: o.status });
    if (u.endsWith('/releases/latest')) return Response.json(release(o));
    if (u.endsWith('/SHA256SUMS.txt')) return new Response(o.sums ?? '');
    return new Response(o.body ?? BODY);
  }) as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), 'qa-craft-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const mk = (o: Opts = {}, save: string | null = join(dir, NAME)) => {
    const dialogs: string[] = [];
    const revealed: string[] = [];
    const svc = createService(root, {
      launch: () => ({ opened: true, message: 'fake' }), openFolder: () => {}, openPath: () => {}, fetch: fakeFetch(o), craftSystem: system,
      reveal: (p) => { revealed.push(p); }, saveFile: async (n, e, title) => { dialogs.push(`${n}|${e}|${title}`); return save; },
    });
    return { svc, dialogs, revealed };
  };

  test('craft download: lists the 16 apps and shows what would be downloaded', async () => {
    const { svc } = mk();
    assert.equal(svc.craftApps().length, 16);
    assert.deepEqual(svc.craftApps()[0], { id: 'artcraft-launcher', label: 'ArtCraft Launcher' });
    const info = await svc.craftDownloadInfo('wordcraft');
    assert.deepEqual(info, { id: 'wordcraft', label: 'WordCraft', tag: 'v1.2.3', page: 'https://github.com/storytold/wordcraft/releases/tag/v1.2.3',
      options: [{ file: NAME, size: BODY.length, url: `https://github.com/storytold/wordcraft/releases/download/v1.2.3/${NAME}` }] });
    await assert.rejects(svc.craftDownloadInfo('solidcraft'), /Unknown app/);
    await assert.rejects(svc.craftDownloadInfo('../x'), /Unknown app/);
  });

  test('craft download: GitHub digest verifies and the folder is revealed', async () => {
    const { svc, dialogs, revealed } = mk();
    const r = await svc.craftDownload('wordcraft', 'v1.2.3', NAME);
    assert.deepEqual(r, { path: join(dir, NAME), sha256: SHA });
    assert.deepEqual(readFileSync(join(dir, NAME)), BODY);
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.part')), []);
    assert.deepEqual(revealed, [join(dir, NAME)]);
    assert.deepEqual(dialogs, ['wordcraft-1.2.3-linux-x86_64|AppImage|Save WordCraft']);
    rmSync(join(dir, NAME));
  });

  test('craft download: SHA256SUMS.txt is used when there is no digest', async () => {
    const { svc } = mk({ digest: null, sums: `${'0'.repeat(64)}  other.deb\n${SHA} *${NAME}\n` });
    assert.equal((await svc.craftDownload('wordcraft', 'v1.2.3', NAME))?.sha256, SHA);
    rmSync(join(dir, NAME));
  });

  test('craft download: no digest and no listed checksum is refused before the dialog', async () => {
    for (const o of [{ digest: null }, { digest: null, sums: `${SHA}  other.deb\n` }] as Opts[]) {
      const { svc, dialogs } = mk(o);
      await assert.rejects(svc.craftDownload('wordcraft', 'v1.2.3', NAME), /publishes no SHA-256 for wordcraft-1\.2\.3-linux-x86_64\.AppImage/);
      assert.deepEqual(dialogs, []);
    }
  });

  test('craft download: a hash that does not match removes the file', async () => {
    const { svc } = mk({ body: Buffer.from('tampered') });
    await assert.rejects(svc.craftDownload('wordcraft', 'v1.2.3', NAME), /Integrity check failed for .* The file was removed/);
    assert.deepEqual(readdirSync(dir), []);
  });

  test('craft download: GitHub errors and no network say what to do', async () => {
    const msg = async (o: Opts) => (await mk(o).svc.craftDownloadInfo('wordcraft').then(() => '', (e: Error) => e.message));
    assert.equal(await msg({ status: 404 }), 'WordCraft has no published release yet. See https://github.com/storytold/wordcraft/releases.');
    assert.match(await msg({ status: 403 }), /limiting requests/);
    assert.match(await msg({ status: 429 }), /limiting requests/);
    assert.match(await msg({ status: 503 }), /unavailable right now \(503\)/);
    assert.match(await msg({ throws: new TypeError('fetch failed') }), /Could not reach GitHub \(api\.github\.com\)/);
    assert.match(await msg({ throws: Object.assign(new Error('t'), { name: 'TimeoutError' }) }), /did not answer in time/);
  });

  test('craft download: no file for this system, and unsafe names are ignored', async () => {
    await assert.rejects(mk({ assets: ['wordcraft-1.2.3-windows-x64.msi'] }).svc.craftDownloadInfo('wordcraft'), /WordCraft v1\.2\.3 has no file for linux x64\. See https:\/\/github\.com\/storytold\/wordcraft\/releases\/tag\/v1\.2\.3\./);
    await assert.rejects(mk({ assets: [`../${NAME}`, `x/${NAME}`, `..`] }).svc.craftDownloadInfo('wordcraft'), /no file for linux x64/);
    await assert.rejects(mk({ tag: '../v1' }).svc.craftDownloadInfo('wordcraft'), /no published release/);
  });

  test('craft download: Fedora is offered rpm first, AppImage second, never deb or unknown names', async () => {
    const RPM = 'wordcraft-1.2.3-linux-x86_64.rpm';
    const DEB = 'wordcraft-1.2.3-linux-x86_64.deb';
    const fedora = { ...system, family: 'rpm' };
    const all = { assets: [NAME, DEB, RPM] };
    const mkF = (o: Opts) => createService(root, {
      launch: () => ({ opened: true, message: 'fake' }), openFolder: () => {}, openPath: () => {}, fetch: fakeFetch(o), craftSystem: fedora,
      reveal: () => {}, saveFile: async () => join(dir, RPM),
    });
    const info = await mkF({ ...all, digest: null, sums: `${SHA}  ${RPM}\n` }).craftDownloadInfo('wordcraft');
    assert.deepEqual(info.options.map((o: { file: string }) => o.file), [RPM, NAME]);
    const svc = mkF({ ...all, digest: null, sums: `${SHA}  ${RPM}\n` });
    assert.equal((await svc.craftDownload('wordcraft', 'v1.2.3', RPM))?.path, join(dir, RPM));
    rmSync(join(dir, RPM));
    await assert.rejects(svc.craftDownload('wordcraft', 'v1.2.3', DEB), /wordcraft-1\.2\.3-linux-x86_64\.deb is not available for this system in v1\.2\.3\. Review the download again\./);
    await assert.rejects(svc.craftDownload('wordcraft', 'v1.2.3', 'evil.sh'), /evil\.sh is not available/);
    assert.deepEqual(readdirSync(dir), []);
  });

  test('craft download: a newer release after the review, and a cancelled dialog', async () => {
    const { svc, dialogs } = mk({ tag: 'v1.2.4', assets: ['wordcraft-1.2.4-linux-x86_64.AppImage'] });
    await assert.rejects(svc.craftDownload('wordcraft', 'v1.2.3', NAME), /A newer release of WordCraft came out \(v1\.2\.4\)\. Review the download again\./);
    assert.deepEqual(dialogs, []);
    calls.length = 0;
    assert.equal(await mk({}, null).svc.craftDownload('wordcraft', 'v1.2.3', NAME), null);
    assert.deepEqual(calls.filter((u) => u.includes('/releases/download/')), []); // nothing fetched after cancel
    assert.deepEqual(readdirSync(dir), []);
  });

  test('craft download: the URL is built by Moki, the extension is added, a failed write leaves nothing', async () => {
    calls.length = 0;
    const { svc } = mk({}, join(dir, 'chosen'));
    assert.equal((await svc.craftDownload('wordcraft', 'v1.2.3', NAME))?.path, join(dir, 'chosen.AppImage'));
    assert.ok(calls.includes(`https://github.com/${app.repo}/releases/download/v1.2.3/${NAME}`));
    rmSync(join(dir, 'chosen.AppImage'));
    await assert.rejects(mk({}, join(dir, 'missing', NAME)).svc.craftDownload('wordcraft', 'v1.2.3', NAME), /Could not save in .*missing: the folder does not exist/);
    assert.deepEqual(readdirSync(dir), []);
  });
}

// Settings › My AIs: where each AI is and its version, and the Moki extension of the app's version in the editors.
{
  const BODY = Buffer.from('pretend vsix');
  const SHA = createHash('sha256').update(BODY).digest('hex');
  const NAME = 'moki-9.9.9.vsix'; // the fixture's package.json is 9.9.9
  const found = { claude: true, codex: false, 'cursor-agent': false, gemini: false, antigravity: false, cursor: false, vscode: true, chat: true, print: true };
  const mk = (digest: string | null = SHA) => {
    const runs: string[][] = [];
    const urls: string[] = [];
    let extension = '';
    const svc = createService(root, {
      ...noLaunch,
      detectTools: () => found as Record<ToolKey, boolean>,
      which: (command) => `/bin/${command}`,
      fetch: (async (url: string | URL | Request) => {
        const u = String(url);
        urls.push(u);
        if (u.endsWith('/releases/tags/v9.9.9')) return Response.json({ tag_name: 'v9.9.9', assets: [{ name: NAME, size: BODY.length, ...(digest ? { digest: `sha256:${digest}` } : {}) }] });
        return new Response(BODY);
      }) as typeof fetch,
      runCommand: async (command, args) => {
        runs.push([command, ...args]);
        if (args[0] === '--version') return command === 'claude' ? '2.1.0 (Claude Code)\n' : '1.99.0\nabc123\n';
        if (args[0] === '--list-extensions') return `ms-python.python@2026.1.0\n${extension}`;
        if (args[0] === '--install-extension') {
          if (!readFileSync(args[1]).equals(BODY)) return null;
          extension = 'orsi88.moki@9.9.9';
          return 'Extension installed.';
        }
        return '';
      },
    });
    return { svc, runs, urls };
  };

  test('my AIs: path and version of the installed tools, nothing run for the missing ones', async () => {
    const { svc, runs } = mk();
    const list = await svc.aiTools();
    assert.deepEqual(list.map((s) => s.id), ['claude', 'codex', 'cursor-agent', 'gemini', 'antigravity', 'cursor', 'vscode']);
    assert.deepEqual(list.find((s) => s.id === 'claude'), { id: 'claude', available: true, path: '/bin/claude', version: '2.1.0 (Claude Code)', extension: '' });
    assert.deepEqual(list.find((s) => s.id === 'codex'), { id: 'codex', available: false, path: '', version: '', extension: '' });
    assert.deepEqual(list.find((s) => s.id === 'vscode'), { id: 'vscode', available: true, path: '/bin/code', version: '1.99.0', extension: '' });
    assert.ok(runs.every(([command]) => command === 'claude' || command === 'code'));
    const info = svc.integrations().find((t) => t.id === 'vscode');
    assert.equal(info?.download, 'https://code.visualstudio.com/Download');
    assert.equal(info?.mokiExtension, 'supported');
  });

  test('my AIs: the Moki extension of the app version is downloaded, verified, installed and the editor opens', async () => {
    const { svc, runs, urls } = mk();
    const r = await svc.installMokiExtension('vscode', 'acme');
    assert.deepEqual(r, { version: '9.9.9', folder: root });
    assert.ok(urls[0].endsWith('/repos/Orsi88/moki/releases/tags/v9.9.9'));
    assert.ok(urls.includes(`https://github.com/Orsi88/moki/releases/download/v9.9.9/${NAME}`));
    const install = runs.find((a) => a[1] === '--install-extension');
    assert.deepEqual(install?.slice(0, 2), ['code', '--install-extension']);
    assert.equal(install?.[3], '--force');
    assert.equal(existsSync(install![2]), false); // the download is removed
    assert.ok(runs.some((a) => a[0] === 'code' && a[1] === root));
    assert.equal((await svc.aiTools()).find((s) => s.id === 'vscode')?.extension, '9.9.9');
  });

  test('my AIs: only installed editors that take the extension, and only a vsix GitHub vouches for', async () => {
    const { svc, runs } = mk();
    await assert.rejects(svc.installMokiExtension('claude'), /does not take the Moki extension/);
    await assert.rejects(svc.installMokiExtension('../x'), /does not take the Moki extension/);
    await assert.rejects(svc.installMokiExtension('cursor'), /not installed on this computer/);
    await assert.rejects(svc.installMokiExtension('vscode', 'nope'));
    const bad = mk(null);
    await assert.rejects(bad.svc.installMokiExtension('vscode'), /publishes no SHA-256 for moki-9\.9\.9\.vsix/);
    const wrong = mk('0'.repeat(64));
    await assert.rejects(wrong.svc.installMokiExtension('vscode'), /Integrity check failed/);
    assert.deepEqual([...runs, ...bad.runs, ...wrong.runs].filter((a) => a[1] === '--install-extension'), []);
  });

  test('my AIs: in a checkout, the vsix built in release/ is installed without downloading', async () => {
    mkdirSync(join(root, 'release'), { recursive: true });
    writeFileSync(join(root, 'release', NAME), BODY);
    try {
      const { svc, urls, runs } = mk();
      await svc.installMokiExtension('vscode');
      assert.deepEqual(urls, []);
      assert.ok(runs.some((a) => a[1] === '--install-extension' && a[2] === join(root, 'release', NAME)));
      assert.ok(existsSync(join(root, 'release', NAME))); // the built one stays
    } finally { rmSync(join(root, 'release'), { recursive: true, force: true }); }
  });
}
