// Opens the built Moki window and checks the settings we use by hand:
// the Templates screen scrolls and accepts a logo and a watermark, and
// Create skill lives only under Add a skill.

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/repo.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;

// 1×1 PNG. The window accepts data: images; this is enough to prove the logo landed.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let app: ElectronApplication;
let page: Page;
let scratch = '';

function addProject(root: string, id: string, name: string, extra: Record<string, unknown> = {}): void {
  const project = join(root, 'workspace', 'projects', id);
  cpSync(join(ROOT, 'templates', 'project-context'), project, { recursive: true });
  renameSync(join(project, 'gitignore.txt'), join(project, '.gitignore'));
  for (const dir of ['inbox', 'runs', 'temporary']) mkdirSync(join(project, dir), { recursive: true });
  const file = join(project, 'project.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  writeFileSync(file, `${JSON.stringify({ ...data, project: id, name, ...extra }, null, 2)}\n`);
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'moki-ui-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.0.0-test' }));
  cpSync(join(ROOT, 'skills'), join(root, 'skills'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  addProject(root, 'acme', 'Acme Library');
  return root;
}

// Opens the app in Portuguese on a project of `root` (acme), or on the workspace picker (null).
async function openApp(root: string, userData: string, project: string | null = 'acme', extra: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env.QA_ROOT = root;
  env.QA_USER_DATA = userData;
  if (project) env.QA_OPEN_PROJECT = project; else delete env.QA_OPEN_PROJECT;
  delete env.QA_SCREENSHOT;
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, extra);
  const app = await electron.launch({ executablePath: electronPath, cwd: ROOT, args: [ROOT], env, timeout: 60_000 });
  const page = await app.firstWindow();
  page.on('pageerror', (err) => console.error('pageerror', err.message));
  await page.evaluate(() => {
    localStorage.setItem('qa-ui-language', 'pt-BR');
    localStorage.setItem('qa-language', 'Portuguese (pt-BR)');
  });
  const reloaded = page.waitForEvent('load');
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.reload(); });
  await reloaded;
  return { app, page };
}

async function cssSize(selector: string): Promise<{ height: number; fontSize: string }> {
  return page.locator(selector).first().evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { height: box.height, fontSize: getComputedStyle(el).fontSize };
  });
}

test.describe.serial('Moki settings', () => {
  test.beforeAll(async () => {
    const root = fixture();
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    scratch = join(tmpdir(), 'moki-ui-keep');
    mkdirSync(scratch, { recursive: true });
    writeFileSync(join(scratch, 'root.txt'), `${root}\n${userData}\n`);
    ({ app, page } = await openApp(root, userData));
    await expect(page.getByRole('button', { name: 'Configurações' })).toBeVisible();
    await page.getByRole('button', { name: 'Configurações' }).click();
    await expect(page.getByRole('tab', { name: 'Templates' })).toBeVisible();
  });

  test.afterAll(async () => {
    await app?.close();
    try {
      const [root, userData] = readFileSync(join(scratch, 'root.txt'), 'utf8').trim().split('\n');
      rmSync(root, { recursive: true, force: true });
      rmSync(userData, { recursive: true, force: true });
      rmSync(scratch, { recursive: true, force: true });
    } catch { /* the window may have exited before the paths were written */ }
  });

  test('Templates scrolls and its controls share one size', async () => {
    await page.getByRole('tab', { name: 'Templates' }).click();
    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
    const form = page.locator('.ds-form');
    const room = await form.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(room).toBeGreaterThan(40);
    await form.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByRole('button', { name: 'Salvar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar logo' })).toBeEnabled();
    await expect(page.getByPlaceholder('ex.: CONFIDENCIAL, RASCUNHO')).toBeEnabled();

    const empty = await cssSize('.ds-logo-empty');
    const button = await cssSize('.ds-logo .btn');
    const side = await cssSize('.ds-logo select');
    expect(button.fontSize).toBe(empty.fontSize);
    expect(side.fontSize).toBe(empty.fontSize);
    expect(Math.abs(button.height - empty.height)).toBeLessThan(1.5);
    expect(Math.abs(side.height - empty.height)).toBeLessThan(1.5);
  });

  test('a chosen logo shows in the form and in the preview', async () => {
    const logo = join(scratch, 'logo.png');
    writeFileSync(logo, PNG);
    await page.locator('.ds-logo input[type=file]').setInputFiles(logo);
    await expect(page.getByRole('img', { name: 'Logo' })).toBeVisible();
    await expect(page.locator('.ds-page img')).toBeVisible();
    await expect(page.getByText('Não foi possível ler esta imagem.')).toHaveCount(0);
  });

  test('a watermark text shows on the preview page', async () => {
    await page.getByPlaceholder('ex.: CONFIDENCIAL, RASCUNHO').fill('RASCUNHO');
    await expect(page.locator('.ds-page-mark')).toHaveText('RASCUNHO');
  });

  test('Create skill stays on Add a skill', async () => {
    await page.getByRole('tab', { name: 'Skills' }).click();
    await page.getByRole('tab', { name: 'Nativas e criadas' }).click();
    await expect(page.getByRole('button', { name: 'Criar skill' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Adicionar skill' }).click();
    await expect(page.getByRole('tab', { name: 'Criar skill' })).toBeVisible();
  });

  test('an agent shows what it needs and delivers; your copy edits it, MCPs and AI included', async () => {
    await page.getByRole('tab', { name: 'Agentes' }).click();
    await page.locator('.library-item', { hasText: 'test-designer' }).click();
    const contract = page.getByRole('group', { name: 'Na operação' });
    await expect(contract.getByRole('list', { name: 'Entradas' })).toContainText('User stories');
    await expect(contract.getByRole('list', { name: 'Saídas' })).toContainText('test-cases.json');
    await expect(contract.getByRole('textbox')).toHaveCount(0); // built-in: read-only

    await page.getByRole('button', { name: 'Duplicar' }).click();
    await expect(page.locator('.library-item.active')).toContainText('test-designer-custom');
    await contract.getByRole('textbox', { name: 'Entradas' }).fill('Logs');
    await contract.getByRole('textbox', { name: 'Entradas' }).press('Enter');
    await contract.getByRole('combobox', { name: 'Servidor MCP' }).fill('jira');
    await contract.getByRole('button', { name: 'Adicionar: Servidor MCP' }).click();
    await contract.getByRole('combobox', { name: 'Como jira é usado' }).selectOption('execute');
    await contract.getByRole('combobox', { name: 'IA padrão' }).selectOption('codex');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);

    const [root] = readFileSync(join(scratch, 'root.txt'), 'utf8').trim().split('\n');
    const file = readFileSync(join(root, 'workspace', 'library', 'agents', 'quality', 'test-designer-custom.md'), 'utf8');
    expect(file).toContain('inputs: User stories, Business rules, Acceptance criteria, Logs\n');
    expect(file).toContain('mcps:\n  jira: execute\nai: codex\nmetadata:');
  });

  test('an operation links agents with arrows: approval, which output answers which input, saved in the list', async () => {
    await page.getByRole('tab', { name: 'Operações' }).click();
    // The first time, an example to learn from: three lanes, the Moki agents, approval between them.
    const example = page.locator('.library-item', { hasText: 'Exemplo: da história às evidências' });
    await example.click();
    await expect(page.locator('.ops-card-name')).toHaveText(['requirements-analyst', 'test-designer', 'evidence-builder']);
    await expect(page.getByRole('region', { name: 'Checagem' }).locator('.ops-panel-head .pill')).toHaveText('Pronta');
    await page.locator('.operations .home-list').getByRole('button', { name: 'Nova operação' }).click();
    await page.getByRole('textbox', { name: 'Nome da operação' }).fill('Revisão e testes');
    const pick = async (name: string) => {
      if (!(await page.locator('.ops-palette').isVisible())) await page.getByRole('button', { name: '+ Adicionar agente' }).click();
      await page.locator('.ops-palette button', { has: page.locator('.ops-palette-name', { hasText: new RegExp(`^${name}$`) }) }).click();
    };
    await pick('requirements-analyst');
    await pick('test-designer'); // linked to the end of the line on its own

    const arrow = page.getByRole('button', { name: 'Seta de requirements-analyst para test-designer' });
    await expect(arrow).toHaveText('Aprovação');
    const inspector = page.getByRole('region', { name: 'Selecionado' });
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText('requirements-analyst → test-designer');
    await inspector.getByRole('combobox', { name: 'Resposta para Business rules' }).selectOption('review-matrix.json');
    const check = page.getByRole('region', { name: 'Checagem' });
    await expect(check.locator('.ops-initial-agent')).toHaveText(['requirements-analyst', 'test-designer']);
    await expect(check.locator('.ops-initial .chip')).toHaveText(['User stories', 'User stories', 'Acceptance criteria']);
    await expect(check).toContainText('Pronta para usar.');
    await expect(check.locator('.ops-panel-head .pill')).toHaveText('Pronta');

    // The bar under the board makes it taller; the two panels below share what is left, side by side, same size.
    const board = page.locator('.ops-board-scroll');
    const before = (await board.boundingBox())?.height ?? 0;
    const bar = await page.getByRole('separator', { name: 'Altura do quadro' }).boundingBox();
    await page.mouse.move((bar?.x ?? 0) + 20, (bar?.y ?? 0) + 6);
    await page.mouse.down();
    await page.mouse.move((bar?.x ?? 0) + 20, (bar?.y ?? 0) - 54, { steps: 6 });
    await page.mouse.up();
    expect(Math.round((await board.boundingBox())?.height ?? 0)).toBe(Math.round(Math.max(before - 60, 180))); // never below 180px
    const [left, right] = [await inspector.boundingBox(), await check.boundingBox()];
    expect(Math.round(left?.height ?? 0)).toBe(Math.round(right?.height ?? 1));
    expect(Math.round(left?.width ?? 0)).toBe(Math.round(right?.width ?? 1));

    await inspector.getByRole('radio', { name: 'Seguir direto para test-designer' }).check();
    await expect(arrow).toHaveText('Direto');

    // A third agent, linked by dragging from the dot of test-designer to its card.
    await pick('failure-analyst');
    await page.getByRole('button', { name: 'Seta de test-designer para failure-analyst' }).click();
    await inspector.getByRole('button', { name: 'Remover seta' }).click();
    await expect(check).toContainText('Etapas sem ligação com as outras: failure-analyst');
    const dot = page.getByRole('button', { name: 'Ligar test-designer a outra etapa' });
    const target = page.getByRole('button', { name: 'Etapa failure-analyst' });
    await dot.hover();
    await page.mouse.down();
    const box = await target.boundingBox();
    await page.mouse.move((box?.x ?? 0) + 60, (box?.y ?? 0) + 40, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Seta de test-designer para failure-analyst' })).toBeVisible();
    await expect(page.locator('.ops-card-n')).toHaveText(['1', '2', '3']);

    // Lanes: coloured bands named after the phases; a colour from the palette; wider by dragging the border.
    await page.getByRole('button', { name: '+ Adicionar raia' }).click();
    await page.getByRole('button', { name: '+ Adicionar raia' }).click();
    const names = page.getByRole('textbox', { name: 'Nome da raia' });
    await expect(names.first()).toHaveValue('Raia 1');
    await expect(names.last()).toHaveValue('Raia 2');
    await names.first().fill('Análise');
    await names.last().fill('Testes');
    await page.getByRole('button', { name: 'Cor de Testes' }).click();
    await page.getByRole('group', { name: 'Cor da raia' }).getByRole('button', { name: '#c79be0' }).click();
    const border = page.locator('.ops-lane-resize').first();
    const edge = await border.boundingBox();
    await page.mouse.move((edge?.x ?? 0) + 4, (edge?.y ?? 0) + 200);
    await page.mouse.down();
    await page.mouse.move((edge?.x ?? 0) + 104, (edge?.y ?? 0) + 200, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.ops-lane').first()).toHaveCSS('width', '400px');

    // Dragging the empty board moves the view.
    const scroller = page.locator('.ops-board-scroll');
    const area = await scroller.boundingBox();
    await page.mouse.move((area?.x ?? 0) + 300, (area?.y ?? 0) + 200);
    await page.mouse.down();
    await page.mouse.move((area?.x ?? 0) + 100, (area?.y ?? 0) + 200, { steps: 6 });
    await page.mouse.up();
    expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);

    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Salva nas suas operações.')).toBeVisible();
    await expect(page.locator('.library-item', { hasText: 'Revisão e testes' })).toBeVisible();
    const [root] = readFileSync(join(scratch, 'root.txt'), 'utf8').trim().split('\n');
    const saved = JSON.parse(readFileSync(join(root, 'workspace', 'library', 'operations', 'revisao-e-testes.json'), 'utf8'));
    expect(saved.steps.map((s: { agent: string }) => s.agent)).toEqual(['library:requirements-analyst', 'library:test-designer', 'library:failure-analyst']);
    expect(saved.links).toEqual([
      { from: 's1', to: 's2', gate: 'auto', map: { 'Business rules': 'review-matrix.json' }, when: '' },
      { from: 's2', to: 's3', gate: 'approval', map: {}, when: '' },
    ]);
    expect(saved.lanes).toEqual([
      { id: 'l1', name: 'Análise', color: '#f1d27c', width: 400 },
      { id: 'l2', name: 'Testes', color: '#c79be0', width: 300 },
    ]);
  });
});

test.describe.serial('Moki tags', () => {
  let tagsApp: ElectronApplication;
  let tagsPage: Page;
  const dirs: string[] = [];

  test.beforeAll(async () => {
    const root = fixture();
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    writeFileSync(join(root, 'workspace', 'tags.json'), JSON.stringify({ tags: [{ id: 'pagamentos', name: 'Pagamentos', color: '#3b82f6', description: '' }] }));
    addProject(root, 'docs', 'Docs', { tags: ['pagamentos'] });
    ({ app: tagsApp, page: tagsPage } = await openApp(root, userData));
  });

  test.afterAll(async () => {
    await tagsApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('a project tag brings the other project into the activity context', async () => {
    const input = tagsPage.locator('.sidebar-tags').getByRole('textbox', { name: 'Adicionar uma tag' });
    await input.fill('Pag');
    await tagsPage.getByRole('listbox').getByText('Pagamentos').click();
    await expect(tagsPage.locator('.sidebar-tags .tag-chip')).toHaveText('Pagamentos');

    await tagsPage.getByRole('button', { name: 'Abrir na sua ferramenta de IA' }).click();
    await tagsPage.getByRole('button', { name: /Só abrir o projeto/ }).click();
    await tagsPage.getByRole('button', { name: 'Continuar sem arquivos' }).click();
    await expect(tagsPage.getByRole('heading', { name: 'Qual contexto a IA deve considerar?' })).toBeVisible();
    const docs = tagsPage.locator('.context-source', { hasText: 'Docs' });
    await expect(docs.getByRole('checkbox')).toBeChecked();
    await docs.getByRole('checkbox').click();
    await expect(docs.getByRole('checkbox')).not.toBeChecked();
  });
});

test.describe.serial('Moki workspaces', () => {
  let wsApp: ElectronApplication;
  let wsPage: Page;
  const dirs: string[] = [];

  test.beforeAll(async () => {
    const root = fixture();
    addProject(root, 'old-portal', 'Old Portal');
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    ({ app: wsApp, page: wsPage } = await openApp(root, userData, null));
  });

  test.afterAll(async () => {
    await wsApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('the app starts on the workspace picker; a new workspace opens empty and can be switched back', async () => {
    await expect(wsPage.getByText('Escolha um workspace', { exact: false })).toBeVisible();
    await expect(wsPage.locator('.picker-cat')).toBeVisible();
    await wsPage.getByRole('button', { name: 'Criar' }).click();
    await wsPage.getByPlaceholder('ex.: Cliente X').fill('Cliente X');
    await wsPage.getByRole('button', { name: 'Criar workspace' }).click();
    await expect(wsPage.locator('.ws-switch-name')).toHaveText('Cliente X');
    await expect(wsPage.getByText('Nenhum projeto ainda.')).toBeVisible();

    await wsPage.locator('.ws-switch-btn').click();
    await wsPage.getByRole('menuitem', { name: 'Workspace', exact: true }).click();
    await expect(wsPage.locator('.ws-switch-name')).toHaveText('Workspace');
    await expect(wsPage.getByRole('button', { name: /Acme Library/ })).toBeVisible();
  });

  test('a hidden project is deleted for good only after typing delete', async () => {
    const row = wsPage.locator('.home-row', { hasText: 'Old Portal' });
    wsPage.once('dialog', (d) => { void d.accept(); });
    await row.hover();
    await row.getByRole('button', { name: 'Desvisualizar' }).click();
    await wsPage.getByText('Ocultos (1)').click();
    await wsPage.locator('.home-hidden .home-row', { hasText: 'Old Portal' }).getByRole('button', { name: 'Excluir definitivamente' }).click();

    const dialog = wsPage.getByRole('dialog', { name: 'Excluir Old Portal' });
    const confirm = dialog.getByRole('button', { name: 'Excluir definitivamente' });
    await expect(confirm).toBeDisabled();
    await dialog.getByPlaceholder('delete').fill('Delete');
    await expect(confirm).toBeDisabled();
    await dialog.getByPlaceholder('delete').fill('delete');
    await confirm.click();

    await expect(dialog).toBeHidden();
    await expect(wsPage.getByText('Old Portal')).toHaveCount(0);
    await expect(wsPage.getByRole('button', { name: /Acme Library/ })).toBeVisible();
    expect(existsSync(join(dirs[0], 'workspace', 'projects', 'old-portal'))).toBe(false);
  });

  test('a loose note opens inside the app; its notebook window lists the loose notes opened, as tabs', async () => {
    await wsPage.getByRole('button', { name: 'Nova nota' }).click();
    const note = wsPage.locator('.home-main .note-dialog'); // in the main area of the start screen, not a popup
    await expect(wsPage.locator('.modal-backdrop')).toHaveCount(0);
    await expect(wsPage.locator('.hero')).toHaveCount(0);
    await note.getByPlaceholder('ex.: Ideias de teste').fill('Lista');
    await note.locator('textarea.note-editor').fill('leite');
    await expect(note.getByRole('button', { name: 'Salvar' })).toHaveCount(0); // it saves on its own
    await expect(note.getByText(/^Salvo às/)).toBeVisible();
    await note.getByRole('button', { name: 'Fechar (Esc)' }).click();
    await expect(note).toBeHidden();
    await expect(wsPage.locator('.hero')).toBeVisible(); // back to the start screen

    // A click opens it here again; the icon beside it opens the notebook window.
    await wsPage.locator('.home-row', { hasText: 'Lista' }).last().locator('.home-project').click();
    await expect(note.locator('textarea.note-editor')).toHaveValue('leite');
    await note.getByRole('button', { name: 'Fechar (Esc)' }).click();

    const row = wsPage.locator('.home-row', { hasText: 'Lista' }).last();
    await row.hover();
    const opened = wsApp.waitForEvent('window');
    await row.getByRole('button', { name: 'Abrir no bloco de notas' }).click();
    const book = await opened;
    await expect(book.getByRole('tab')).toHaveText(['Lista']);
    await expect(book.locator('textarea.note-editor')).toHaveValue('leite');

    await book.getByRole('button', { name: 'Nova nota' }).click();
    await expect(book.getByRole('tab')).toHaveCount(2);
    await expect(book.getByRole('tab', { name: 'Nova nota' })).toHaveAttribute('aria-selected', 'true');
    await book.getByRole('tab', { name: 'Nova nota' }).getByRole('button', { name: 'Fechar aba' }).click();
    await expect(book.getByRole('tab')).toHaveText(['Lista']);
    await book.close();
  });
});

test.describe.serial('Moki project tree', () => {
  let treeApp: ElectronApplication;
  let treePage: Page;
  const dirs: string[] = [];

  test.beforeAll(async () => {
    const root = fixture();
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    ({ app: treeApp, page: treePage } = await openApp(root, userData));
  });

  test.afterAll(async () => {
    await treeApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('right click on a tree item copies its full path', async () => {
    await treePage.locator('.tree-row[title="context"]').click({ button: 'right' });
    await expect(treePage.getByRole('menuitem', { name: 'Mostrar na pasta' })).toBeVisible();
    await treePage.getByRole('menuitem', { name: 'Copiar caminho' }).click();
    const expected = join(dirs[0], 'workspace', 'projects', 'acme', 'context');
    await expect(treePage.getByRole('status')).toContainText(expected);
    expect(await treeApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(expected);
    await expect(treePage.getByRole('menu')).toBeHidden();
  });

  test('the ⋯ menu creates a file that opens to be written, and a folder at the project root', async () => {
    const inbox = treePage.locator('.tree-line', { has: treePage.locator('.tree-row[title="inbox"]') });
    await inbox.hover();
    await inbox.getByRole('button', { name: 'Mais opções' }).click();
    await treePage.getByRole('menuitem', { name: 'Novo arquivo' }).click();
    const dialog = treePage.getByRole('dialog', { name: 'Novo arquivo' });
    await dialog.getByLabel('Nome').fill('cenarios');
    await dialog.getByRole('button', { name: 'Criar' }).click();
    await expect(dialog).toBeHidden();
    const project = join(dirs[0], 'workspace', 'projects', 'acme');
    expect(existsSync(join(project, 'inbox', 'cenarios.md'))).toBe(true);
    await expect(treePage.locator('.tree-row[title="inbox/cenarios.md"]')).toBeVisible();
    await expect(treePage.locator('textarea')).toBeVisible();

    await treePage.getByRole('button', { name: 'Opções da pasta do projeto' }).click();
    await expect(treePage.getByRole('menuitem', { name: 'Copiar caminho' })).toBeVisible();
    await treePage.getByRole('menuitem', { name: 'Nova pasta' }).click();
    await treePage.getByRole('dialog', { name: 'Nova pasta' }).getByLabel('Nome').fill('sprint-12');
    await treePage.getByRole('dialog', { name: 'Nova pasta' }).getByRole('button', { name: 'Criar' }).click();
    await expect(treePage.locator('.tree-row[title="sprint-12"]')).toBeVisible();
    expect(existsSync(join(project, 'sprint-12'))).toBe(true);

    await treePage.locator('.tree-row[title="runs"]').click({ button: 'right' });
    await expect(treePage.getByRole('menuitem', { name: 'Mostrar na pasta' })).toBeVisible();
    await expect(treePage.getByRole('menuitem', { name: 'Novo arquivo' })).toHaveCount(0);
    await treePage.keyboard.press('Escape');
  });

  test('typing / in a note lists the formatting commands; a checklist continues on Enter', async () => {
    await treePage.locator('.tree-row[title="notes"]').click();
    await treePage.getByRole('button', { name: 'Nova nota' }).click();
    const note = treePage.locator('.note-dialog'); // its name follows the title typed below
    await note.getByPlaceholder('ex.: Ideias de teste').fill('Compras');
    const editor = note.locator('textarea.note-editor');
    const commands = note.getByRole('listbox', { name: 'Comandos' });

    await editor.click();
    await editor.pressSequentially('/tare');
    await expect(commands.getByRole('option')).toHaveCount(1);
    await expect(commands.getByRole('option', { name: 'Checklist' })).toBeVisible();
    await editor.press('Enter');
    await expect(commands).toBeHidden();
    await expect(editor).toHaveValue('- [ ] ');
    await editor.pressSequentially('pão');
    await editor.press('Enter');
    await editor.pressSequentially('café');
    await expect(editor).toHaveValue('- [ ] pão\n- [ ] café');

    await editor.press('Enter');
    await editor.press('Enter'); // an empty item ends the list
    await note.getByRole('button', { name: 'Comandos (digite /)' }).click();
    await expect(commands).toBeVisible();
    await editor.pressSequentially('gra');
    await commands.getByRole('option', { name: 'Título grande' }).click();
    await editor.pressSequentially('Fim');
    await expect(editor).toHaveValue('- [ ] pão\n- [ ] café\n# Fim');

    await editor.pressSequentially(' e/ou /');
    await expect(commands).toBeVisible(); // after a space only; "e/ou" did not open it
    await editor.press('Escape');
    await expect(commands).toBeHidden();
    await expect(note).toBeVisible(); // Escape closed the list, not the note
    await treePage.keyboard.press('Escape'); // closing saves it: no question, nothing lost
    await expect(note).toBeHidden();
    await expect.poll(() => { try { return readFileSync(join(dirs[0], 'workspace', 'projects', 'acme', 'notes', 'compras.md'), 'utf8'); } catch { return ''; } })
      .toBe('- [ ] pão\n- [ ] café\n# Fim e/ou /');
  });

  test('the star turns a note into a golden favorite, first in the notes folder', async () => {
    const create = async (name: string) => {
      await treePage.locator('.tree-row[title="notes"]').click({ button: 'right' });
      await treePage.getByRole('menuitem', { name: 'Novo arquivo' }).click();
      await treePage.getByRole('dialog', { name: 'Novo arquivo' }).getByLabel('Nome').fill(name);
      await treePage.getByRole('dialog', { name: 'Novo arquivo' }).getByRole('button', { name: 'Criar' }).click();
      await expect(treePage.locator('.note-dialog')).toBeVisible(); // a note opens in its popup
    };
    await create('aaa');
    await treePage.keyboard.press('Escape');
    await create('ideias');

    const star = treePage.locator('.note-dialog').getByRole('button', { name: 'Favoritar' });
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await star.click();
    const on = treePage.locator('.note-dialog').getByRole('button', { name: 'Desfavoritar' });
    await expect(on).toHaveAttribute('aria-pressed', 'true');
    await on.hover(); // the button hover color must not win over the gold
    const fill = await on.evaluate((el) => getComputedStyle(el.querySelector('.star-shape') as SVGPathElement).fill);
    expect(['rgb(242, 194, 48)', 'rgb(217, 164, 6)']).toContain(fill); // --star, dark or light theme
    await treePage.keyboard.press('Escape');

    const notes = treePage.locator('.tree-row[title^="notes/"]');
    await expect(notes.first()).toHaveAttribute('title', 'notes/ideias.md');
    await expect(notes.first().locator('.star-mark')).toBeVisible();

    await notes.first().click({ button: 'right' });
    await treePage.getByRole('menuitem', { name: 'Desfavoritar' }).click();
    await expect(treePage.locator('.tree-row[title="notes/ideias.md"] .star-mark')).toHaveCount(0);
    await expect(notes.first()).toHaveAttribute('title', 'notes/aaa.md');
  });

  test('a project note opens inside the app, and in its notebook with every note of the project as a tab', async () => {
    await treePage.locator('.tree-row[title="notes/aaa.md"]').click();
    const inApp = treePage.locator('.main .note-host .note-dialog'); // in the main area, not a popup
    await expect(inApp).toBeVisible();
    await expect(treePage.locator('.modal-backdrop')).toHaveCount(0);
    const opened = treeApp.waitForEvent('window');
    await inApp.getByRole('button', { name: 'Abrir no bloco de notas' }).click();
    const book = await opened;
    await expect(inApp).toBeHidden();
    await expect(book.getByRole('tab')).toHaveText(['aaa', 'compras', 'ideias']);
    await expect(book.getByRole('tab', { name: 'aaa' })).toHaveAttribute('aria-selected', 'true');

    // Another note of the project goes to the same window.
    await treePage.locator('.tree-row[title="notes/ideias.md"]').click({ button: 'right' });
    await treePage.getByRole('menuitem', { name: 'Abrir no bloco de notas' }).click();
    await expect(book.getByRole('tab', { name: 'ideias' })).toHaveAttribute('aria-selected', 'true');
    expect(treeApp.windows()).toHaveLength(2);

    // + writes a new note of the project; saved, it stays open as its own tab.
    await book.getByRole('button', { name: 'Nova nota' }).click();
    const page = book.locator('.notebook-page:not([hidden])');
    await page.getByPlaceholder('ex.: Ideias de teste').fill('terceira');
    const editor = page.locator('textarea.note-editor');
    await editor.fill('texto');
    await expect(book.getByRole('tab', { name: 'terceira' })).toHaveAttribute('aria-selected', 'true'); // saved on its own
    await expect(book.getByRole('tab')).toHaveCount(4);
    const file = join(dirs[0], 'workspace', 'projects', 'acme', 'notes', 'terceira.md');
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('texto');
    await editor.pressSequentially(' mais'); // still the same note, still writing
    await expect(editor).toBeFocused();
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('texto mais');
    await book.close();
  });
});

// AI tools are faked (QA_FAKE_TOOLS): nothing is started; the test writes what each agent would deliver.
test.describe.serial('Moki operations in a project', () => {
  let opsApp: ElectronApplication;
  let opsPage: Page;
  const dirs: string[] = [];

  test.beforeAll(async () => {
    const root = fixture();
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    mkdirSync(join(root, 'workspace', 'library', 'operations'), { recursive: true });
    writeFileSync(join(root, 'workspace', 'library', 'operations', 'fluxo-qa.json'), JSON.stringify({
      schemaVersion: 1, id: 'fluxo-qa', name: 'Fluxo QA', description: 'Revisão e testes', lanes: [],
      steps: [{ id: 's1', agent: 'library:requirements-analyst', x: 20, y: 60 }, { id: 's2', agent: 'library:test-designer', x: 320, y: 60 }],
      links: [{ from: 's1', to: 's2', gate: 'approval', map: { 'Business rules': 'review-matrix.json' } }],
    }));
    writeFileSync(join(root, 'workspace', 'projects', 'acme', 'inbox', 'us-1.md'), '# US-1');
    // A reviewer that ends approved or rejected, and a fixer: rejected goes to the fixer and back to the review.
    const agent = (name: string, extra: string) => [
      '---', `name: ${name}`, `description: ${name}.`, 'category: quality', 'skills: project-context', 'access: project-write', extra,
      'metadata:', '  version: "1.0.0"', '  status: draft', '---', '', `# ${name}`, '', '## Role', '', 'x', '', '## When to use', '', 'x', '', '## How to work', '', 'x', '', '## Boundaries', '', 'x', '',
    ].join('\n');
    mkdirSync(join(root, 'workspace', 'library', 'agents', 'quality'), { recursive: true });
    writeFileSync(join(root, 'workspace', 'library', 'agents', 'quality', 'reviewer.md'), agent('reviewer', 'outputs: review.md\noutcomes: approved, rejected'));
    writeFileSync(join(root, 'workspace', 'library', 'agents', 'quality', 'fixer.md'), agent('fixer', 'outputs: fixed.md'));
    writeFileSync(join(root, 'workspace', 'library', 'operations', 'revisa-ate-aprovar.json'), JSON.stringify({
      schemaVersion: 1, id: 'revisa-ate-aprovar', name: 'Revisa até aprovar', description: '', lanes: [], start: 's1', maxRounds: 3,
      steps: [{ id: 's1', agent: 'library:reviewer', x: 20, y: 60 }, { id: 's2', agent: 'library:fixer', x: 340, y: 240 }],
      links: [{ from: 's1', to: 's2', gate: 'auto', map: {}, when: 'rejected' }, { from: 's2', to: 's1', gate: 'auto', map: {}, when: '' }],
    }));
    ({ app: opsApp, page: opsPage } = await openApp(root, userData, 'acme', { QA_FAKE_TOOLS: '1' }));
  });

  test.afterAll(async () => {
    await opsApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('an operation is linked, started from its form, and moves on as each agent delivers its files', async () => {
    const side = opsPage.getByRole('region', { name: 'Operações' });
    await side.getByRole('button', { name: 'Vincular operações a este projeto' }).click();
    await opsPage.getByRole('menuitemcheckbox', { name: /Fluxo QA/ }).click();
    await opsPage.keyboard.press('Escape');
    await expect(opsPage.locator('.menu-backdrop')).toHaveCount(0);
    await side.getByRole('button', { name: /Fluxo QA/ }).click();

    const launch = opsPage.getByRole('region', { name: 'Iniciar Fluxo QA' });
    await expect(launch.locator('.ops-run-agent')).toHaveText(['requirements-analyst', 'test-designer']);
    await launch.getByRole('textbox', { name: 'O que você quer?' }).fill('Revisar o login');
    await launch.getByRole('textbox', { name: 'User stories (requirements-analyst)' }).fill('US-1 login');
    await launch.locator('.ops-run-inputs').first().getByRole('button', { name: 'us-1.md' }).click();
    await launch.getByRole('button', { name: 'Iniciar operação' }).click();

    const runView = opsPage.locator('.ops-run');
    await expect(runView.locator('.ops-timeline-status')).toHaveText(['Em andamento']);
    await expect(side.locator('.ops-side-row', { hasText: 'Em andamento' })).toBeVisible();
    const runs = join(dirs[0], 'workspace', 'projects', 'acme', 'runs');
    const runId = readdirSync(runs).find((d) => d.includes('-op-fluxo-qa')) as string;
    const run = join(runs, runId);
    expect(readFileSync(join(run, 'inputs', 'request.md'), 'utf8')).toContain('workspace/projects/acme/inbox/us-1.md');

    // The analyst stops to ask something: the run waits for the user and shows the question.
    writeFileSync(join(run, 'waiting', 's1.md'), 'Qual ambiente devo considerar?');
    await expect(runView.locator('.ops-question')).toContainText('requirements-analyst pergunta: Qual ambiente devo considerar?');
    await expect(runView.locator('.ops-run-head .pill')).toHaveText('Aguardando informações');
    rmSync(join(run, 'waiting', 's1.md'));
    await expect(runView.locator('.ops-question')).toHaveCount(0);

    // The analyst delivers its files and its summary: the next step waits for approval (an approval arrow).
    mkdirSync(join(run, 'outputs', 's1'), { recursive: true });
    for (const f of ['review-matrix.json', 'Matriz.xlsx', 'Relatorio.pdf']) writeFileSync(join(run, 'outputs', 's1', f), 'x');
    writeFileSync(join(run, 'handoff', 's1.md'), 'Revisei a US-1.');
    await expect(runView.locator('.ops-timeline-status')).toHaveText(['Concluída', 'Aguardando sua aprovação']);
    await runView.getByRole('button', { name: 'Aprovar e iniciar test-designer' }).click();
    await expect(runView.locator('.ops-timeline-status')).toHaveText(['Concluída', 'Em andamento']);

    mkdirSync(join(run, 'outputs', 's2'), { recursive: true });
    for (const f of ['mapping.md', 'test-cases.json', 'Casos.xlsx']) writeFileSync(join(run, 'outputs', 's2', f), 'x');
    writeFileSync(join(run, 'handoff', 's2.md'), 'Casos prontos.');
    await expect(runView.locator('.ops-timeline-status')).toHaveText(['Concluída', 'Concluída']);
    await expect(runView.locator('.ops-run-head .pill')).toHaveText('Concluída');

    // Closed, the run stays in the side panel, among the finished ones; its summary opens as a tab.
    await runView.getByRole('button', { name: 'Ler o resumo' }).first().click();
    await expect(opsPage.getByRole('tab', { name: /s1\.md/ })).toBeVisible();
    await side.getByText('Concluídas (1)').click();
    await expect(side.locator('.ops-side-ended .ops-side-row')).toContainText('Fluxo QA');
  });

  test('a result picks the arrow: rejected goes to the fixer and back to the review; no valid result asks the user', async () => {
    const side = opsPage.getByRole('region', { name: 'Operações' });
    await side.getByRole('button', { name: 'Vincular operações a este projeto' }).click();
    await opsPage.getByRole('menuitemcheckbox', { name: /Revisa até aprovar/ }).click();
    await opsPage.keyboard.press('Escape');
    await side.getByRole('button', { name: /Revisa até aprovar/ }).click();
    await opsPage.getByRole('region', { name: 'Iniciar Revisa até aprovar' }).getByRole('button', { name: 'Iniciar operação' }).click();

    const runView = opsPage.locator('.ops-run');
    const runs = join(dirs[0], 'workspace', 'projects', 'acme', 'runs');
    const run = join(runs, readdirSync(runs).find((d) => d.includes('-op-revisa-ate-aprovar')) as string);
    const deliver = (slot: string, file: string, handoff: string) => {
      mkdirSync(join(run, 'outputs', slot), { recursive: true });
      writeFileSync(join(run, 'outputs', slot, file), 'x');
      writeFileSync(join(run, 'handoff', `${slot}.md`), handoff);
    };
    deliver('s1', 'review.md', 'outcome: rejected');
    await expect(runView.locator('.ops-timeline-title strong')).toHaveText(['reviewer', 'fixer']);
    await expect(runView.locator('.pill-outcome')).toHaveText(['rejected']);
    deliver('s2', 'fixed.md', 'Ajustado.');
    await expect(runView.locator('.ops-timeline-title strong')).toHaveText(['reviewer', 'fixer', 'reviewer']);
    await expect(runView.locator('.ops-timeline-step').last().locator('.chip')).toHaveText('2ª vez');

    // "approved" has no arrow and there is no "otherwise": the operation ends; a result it does not know: the user decides.
    deliver('s1-2', 'review.md', 'Acho que ficou bom.');
    const decision = opsPage.getByRole('group', { name: 'Sua decisão' });
    await expect(decision).toContainText('reviewer não informou como terminou.');
    await decision.getByRole('button', { name: 'Seguir para fixer (como "rejected")' }).click();
    await expect(runView.locator('.ops-timeline-title strong')).toHaveText(['reviewer', 'fixer', 'reviewer', 'fixer']);
    deliver('s2-2', 'fixed.md', 'De novo.');
    deliver('s1-3', 'review.md', 'outcome: approved');
    await expect(runView.locator('.ops-run-head .pill')).toHaveText('Concluída');
    await expect(runView.locator('.pill-outcome')).toHaveText(['rejected', 'approved']);

    // In the editor, the reviewer's card has a dot per result (and "otherwise"); the arrow shows its result; the loop curves back.
    await opsPage.getByRole('button', { name: 'Configurações' }).click();
    await opsPage.getByRole('tab', { name: 'Operações' }).click();
    await opsPage.locator('.library-item', { hasText: 'Revisa até aprovar' }).click();
    await expect(opsPage.locator('[data-step="s1"] .ops-dot-label')).toHaveText(['approved', 'rejected', 'senão']);
    await expect(opsPage.getByRole('button', { name: 'Seta de reviewer para fixer, quando rejected' })).toContainText('rejected');
    await expect(opsPage.locator('.ops-card-start')).toHaveText('Início');
  });
});
