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
  cpSync(join(ROOT, 'activities'), join(root, 'activities'), { recursive: true });
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
    await expect(page.locator('.ds-card-item')).toHaveCount(1); // the list first: every template of the workspace
    await page.getByRole('button', { name: 'Default' }).click();
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

  test('templates are a list: a new one tagged with a project applies only to it', async () => {
    page.once('dialog', (d) => { void d.accept(); }); // the watermark typed above is discarded
    await page.getByRole('button', { name: 'Voltar para Templates' }).click();
    await page.getByRole('button', { name: 'Novo template' }).click();
    await page.locator('.ds-form').getByRole('textbox', { name: 'Nome' }).fill('Acme look');
    await page.locator('.ds-form .tag-field').getByRole('textbox', { name: 'Adicionar uma tag' }).fill('Acme');
    await page.getByRole('listbox').getByText('Acme Library').click();
    await page.locator('.ds-actions').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('.list-back')).toContainText('Acme Library');
    await page.getByRole('button', { name: 'Voltar para Templates' }).click();
    const card = page.locator('.ds-card-item', { hasText: 'Acme look' });
    await expect(card).toContainText('Acme Library');
    await expect(page.locator('.ds-card-item')).toHaveCount(2);

    await page.getByRole('searchbox', { name: 'Buscar templates' }).fill('acme');
    await expect(page.locator('.ds-card-item')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Buscar templates' }).fill('');

    const [root] = readFileSync(join(scratch, 'root.txt'), 'utf8').trim().split('\n');
    const saved = readdirSync(join(root, 'workspace', 'templates')).map((f) => JSON.parse(readFileSync(join(root, 'workspace', 'templates', f), 'utf8')) as { name: string; tags: string[] });
    expect(saved.find((x) => x.name === 'Acme look')?.tags).toEqual(['project:acme']);
  });

  test('Skills is one list like the other tabs: filter tabs, search, a detail; Add a skill has its own page', async () => {
    await page.getByRole('tab', { name: 'Skills' }).click();
    await expect(page.getByRole('heading', { name: 'Skills', level: 1 })).toBeVisible();
    await page.getByRole('tab', { name: /^Plugins/ }).click();
    await expect(page.locator('.skill-item')).toHaveCount(4);
    await page.getByRole('searchbox', { name: 'Buscar skills' }).fill('caveman');
    await expect(page.locator('.skill-item')).toHaveCount(1);
    await page.locator('.skill-item').click();
    const acme = page.getByRole('checkbox', { name: 'Acme Library' });
    await expect(acme).not.toBeChecked();
    await acme.check();
    await expect(acme).toBeChecked();
    await page.getByRole('button', { name: 'Voltar para Skills' }).click();
    await expect(page.locator('.skill-item')).toContainText('Usado em 1 projeto');

    await page.getByRole('button', { name: 'Adicionar skill' }).click();
    await expect(page.getByRole('tab', { name: 'Criar skill' })).toBeVisible();
    await expect(page.getByText('Instalar para')).toHaveCount(0); // Settings installs for every project
    await page.getByRole('button', { name: 'Voltar para Skills' }).click();
  });

  test('an agent shows what it needs and delivers; your copy edits it, MCPs and AI included', async () => {
    await page.getByRole('tab', { name: 'Agentes' }).click();
    await expect(page.getByRole('heading', { name: 'Agentes' })).toBeVisible(); // the list first
    await page.locator('.library-item', { has: page.locator('.list-card-title', { hasText: /^test-designer$/ }) }).click();
    const contract = page.getByRole('group', { name: 'Na operação' });
    await expect(contract.getByRole('list', { name: 'Entradas' })).toContainText('User stories');
    await expect(contract.getByRole('list', { name: 'Saídas' })).toContainText('test-cases.json');
    await expect(contract.getByRole('textbox')).toHaveCount(0); // built-in: read-only

    await page.getByRole('button', { name: 'Duplicar' }).click();
    await expect(page.locator('.title-row h1')).toHaveText('test-designer-custom');
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

  test('your agent: description and instructions in text fields, skills searched and added, one Save; tags say which projects it reaches', async () => {
    await expect(page.locator('.title-row h1')).toHaveText('test-designer-custom');
    await page.getByRole('textbox', { name: 'Descrição' }).fill('Designs the tests of the Acme stories.');
    await expect(page.getByText('Alterações não salvas')).toBeVisible();
    const notes = page.getByRole('textbox', { name: 'Instruções' });
    expect((await notes.boundingBox())?.height ?? 0).toBeGreaterThan(400);
    await notes.fill('# Notes only\n');
    await expect(page.getByText(/Faltam as seções: ## Role/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Alterações não salvas')).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Descrição' }).fill('Designs the tests of the Acme stories.');
    await page.getByRole('searchbox', { name: 'Adicionar skill' }).fill('requirements');
    await page.locator('.skill-options button', { has: page.locator('.skill-name', { hasText: /^requirements-review$/ }) }).click();
    await expect(page.locator('.skill-row .skill-name')).toHaveText(['test-design', 'project-context', 'requirements-review']);
    await page.locator('.agent-savebar').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Alterações não salvas')).toHaveCount(0);

    await page.locator('.library-detail .tag-field').getByRole('textbox', { name: 'Adicionar uma tag' }).fill('Acme');
    await page.getByRole('listbox').getByText('Acme Library').click();
    await expect(page.locator('.library-detail .tag-field .tag-chip')).toHaveText('Acme Library');

    const [root] = readFileSync(join(scratch, 'root.txt'), 'utf8').trim().split('\n');
    const file = readFileSync(join(root, 'workspace', 'library', 'agents', 'quality', 'test-designer-custom.md'), 'utf8');
    expect(file).toMatch(/skills: .*requirements-review/);
    expect(file).toContain('description: Designs the tests of the Acme stories.\n');
    expect(file).toContain('\n## Role\n');
    const tags = JSON.parse(readFileSync(join(root, 'workspace', 'library', 'agent-tags.json'), 'utf8')) as { agents: Record<string, string[]> };
    expect(tags.agents['test-designer-custom']).toEqual(['project:acme']);
  });

  test('an operation links agents with arrows: approval, which output answers which input, saved in the list', async () => {
    await page.getByRole('tab', { name: 'Operações' }).click();
    // The first time, an example to learn from: three lanes, the Moki agents, approval between them.
    const example = page.locator('.library-item', { hasText: 'Exemplo: da história às evidências' });
    await example.click();
    await expect(page.locator('.ops-card-name')).toHaveText(['requirements-analyst', 'test-designer', 'evidence-builder']);
    await expect(page.getByRole('region', { name: 'Checagem' }).locator('.ops-panel-head .pill')).toHaveText('Pronta');
    await page.getByRole('button', { name: 'Voltar para Operações' }).click(); // the list, like every tab
    await page.getByRole('button', { name: 'Nova operação' }).click();
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

    // Expand: the editor takes the whole window and the board grows; Esc brings it back, Settings stays open.
    const normalH = (await scroller.boundingBox())?.height ?? 0;
    await page.getByRole('button', { name: 'Expandir' }).click();
    await expect(page.locator('.ops-editor.expanded')).toBeVisible();
    await expect.poll(async () => (await scroller.boundingBox())?.height ?? 0).toBeGreaterThan(normalH + 100);
    await page.getByRole('button', { name: 'Recolher' }).click();
    await expect(page.locator('.ops-editor.expanded')).toHaveCount(0);
    // Esc: first it closes the details of what is selected, then the expanded view; Settings stays open.
    await page.getByRole('button', { name: 'Expandir' }).click();
    if (await page.locator('.ops-inspector.has-sel').count()) await page.keyboard.press('Escape');
    await expect(page.locator('.ops-inspector.has-sel')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ops-editor.expanded')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Operações' })).toBeVisible();

    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Salva nas suas operações.')).toBeVisible();
    await page.getByRole('button', { name: 'Voltar para Operações' }).click();
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
    await row.click({ button: 'right' }); // the row's actions are on the right click
    await wsPage.getByRole('menuitem', { name: 'Desvisualizar' }).click();
    await wsPage.getByText('Ocultos (1)').click();
    await wsPage.locator('.home-hidden .home-row', { hasText: 'Old Portal' }).click({ button: 'right' });
    await wsPage.getByRole('menuitem', { name: 'Excluir definitivamente' }).click();

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
    await row.click({ button: 'right' });
    const opened = wsApp.waitForEvent('window');
    await wsPage.getByRole('menuitem', { name: 'Abrir no bloco de notas' }).click();
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
    // A .md file has the notes' / commands too.
    const md = treePage.locator('textarea.editor');
    await md.click();
    await md.pressSequentially('/tab');
    await expect(treePage.getByRole('listbox', { name: 'Comandos' })).toContainText('Tabela');
    await md.press('Enter');
    await expect(md).toHaveValue(/\| Coluna 1 \| Coluna 2 \| Coluna 3 \|/);
    await treePage.locator('.doc-bar').getByRole('button', { name: 'Salvar' }).click();
    await expect.poll(() => readFileSync(join(dirs[0], 'workspace', 'projects', 'acme', 'inbox', 'cenarios.md'), 'utf8')).toContain('| Coluna 1 |');

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

    // The run opens on its board: each card shows how its step is doing; the panel beside it, the step under way.
    const runView = opsPage.locator('.ops-run');
    const card = (step: string) => runView.locator(`.ops-run-card[data-step="${step}"]`);
    await expect(card('s1')).toHaveAttribute('data-state', 'running');
    await expect(card('s2')).toHaveAttribute('data-state', 'pending');
    await expect(runView.locator('.ops-run-panel h2')).toHaveText('requirements-analyst');
    // The step's panel takes the right side of the screen: the project panel steps aside while the board shows.
    await expect(opsPage.locator('.workspace.panel-rail')).toHaveCount(1);
    await expect(runView.locator('.ops-run-panel')).toHaveCSS('position', 'absolute');
    await expect(side.locator('.ops-side-row', { hasText: 'Em andamento' })).toBeVisible();
    const runs = join(dirs[0], 'workspace', 'projects', 'acme', 'runs');
    const runId = readdirSync(runs).find((d) => d.includes('-op-fluxo-qa')) as string;
    const run = join(runs, runId);
    expect(readFileSync(join(run, 'inputs', 'request.md'), 'utf8')).toContain('workspace/projects/acme/inbox/us-1.md');

    // The analyst stops to ask something: the run waits for the user and shows the question.
    writeFileSync(join(run, 'waiting', 's1.md'), 'Qual ambiente devo considerar?');
    await expect(runView.locator('.ops-question')).toContainText('requirements-analyst pergunta: Qual ambiente devo considerar?');
    await expect(card('s1')).toHaveAttribute('data-state', 'asking');
    await expect(runView.locator('.ops-run-head .pill')).toHaveText('Aguardando informações');
    // Answered here: its terminal is not open in Moki (the tools are faked), so the step starts again with the answer.
    await expect(runView.getByRole('button', { name: 'Ver a pergunta completa' })).toBeVisible();
    await expect(runView.locator('.ops-question')).toContainText('O terminal dele não está aberto no Moki');
    await runView.getByRole('textbox', { name: 'Sua resposta' }).fill('Homologação');
    await runView.getByRole('button', { name: 'Responder e retomar' }).click();
    await expect(runView.locator('.ops-question')).toHaveCount(0);
    await expect(card('s1')).toHaveAttribute('data-state', 'running');
    expect(existsSync(join(run, 'waiting', 's1.md'))).toBe(false);
    expect(JSON.parse(readFileSync(join(run, 'state.json'), 'utf8')).visits[0].resume).toEqual({ question: 'Qual ambiente devo considerar?', answer: 'Homologação' });

    // The analyst delivers its files and its summary: the next step waits for approval (an approval arrow).
    mkdirSync(join(run, 'outputs', 's1'), { recursive: true });
    for (const f of ['review-matrix.json', 'Matriz.xlsx', 'Relatorio.pdf']) writeFileSync(join(run, 'outputs', 's1', f), 'x');
    writeFileSync(join(run, 'handoff', 's1.md'), 'Revisei a US-1.');
    await expect(card('s1')).toHaveAttribute('data-state', 'done');
    await expect(card('s2')).toHaveAttribute('data-state', 'awaiting-approval');
    await expect(runView.locator('.ops-run-panel h2')).toHaveText('test-designer');

    // Rejected with a reason and sent back: the analyst runs again (its second time) and sees why.
    await runView.getByRole('button', { name: 'Reprovar…' }).click();
    await runView.getByRole('textbox', { name: 'Por que você reprova' }).fill('Falta a regra de senha.');
    await runView.getByRole('button', { name: 'Devolver para requirements-analyst' }).click();
    await expect(card('s2')).toHaveAttribute('data-state', 'cancelled');
    await expect(card('s1')).toHaveAttribute('data-state', 'running');
    await expect(card('s1').locator('.chip')).toHaveText('×2');
    await expect(runView.locator('.ops-run-panel .ops-notes')).toContainText('Falta a regra de senha.');

    mkdirSync(join(run, 'outputs', 's1-2'), { recursive: true });
    for (const f of ['review-matrix.json', 'Matriz.xlsx', 'Relatorio.pdf']) writeFileSync(join(run, 'outputs', 's1-2', f), 'x');
    writeFileSync(join(run, 'handoff', 's1-2.md'), 'Revisei de novo.');
    await expect(card('s2')).toHaveAttribute('data-state', 'awaiting-approval');
    await runView.getByRole('button', { name: 'Aprovar e iniciar test-designer' }).click();
    await expect(card('s2')).toHaveAttribute('data-state', 'running');

    mkdirSync(join(run, 'outputs', 's2-2'), { recursive: true });
    for (const f of ['mapping.md', 'test-cases.json', 'Casos.xlsx']) writeFileSync(join(run, 'outputs', 's2-2', f), 'x');
    writeFileSync(join(run, 'handoff', 's2-2.md'), 'Casos prontos.');
    await expect(card('s2')).toHaveAttribute('data-state', 'done');
    await expect(runView.locator('.ops-run-head .pill')).toHaveText('Concluída');

    // A click on a card shows that step beside the board.
    await card('s1').click();
    await expect(runView.locator('.ops-run-panel h2')).toHaveText('requirements-analyst');
    await expect(runView.locator('.ops-run-panel .ops-run-visit')).toHaveCount(2);

    // The list shows each time a step ran (the app remembers it: the next test reads the list).
    await runView.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(runView.locator('.ops-timeline-status')).toHaveText(['Concluída', 'Cancelada', 'Concluída', 'Concluída']);

    // Each step's summary and files show in the run screen itself, without opening anything else.
    const summary = runView.getByRole('region', { name: 'Resumo da etapa' }).first();
    await expect(summary).toBeVisible();
    const delivered = runView.getByRole('region', { name: 'O que entregou' }).first();
    await delivered.locator('.run-file').first().click();
    await expect(delivered.locator('.run-preview')).toBeVisible();
    // Closed, the run stays in the side panel, among the finished ones.
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

// A terminal keeps running when you leave its project, and its tab comes back, with what it printed, when the project opens again.
test.describe.serial('Moki terminals outlive the project screen', () => {
  let termApp: ElectronApplication;
  let termPage: Page;
  const dirs: string[] = [];

  test.beforeAll(async () => {
    const root = fixture();
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    ({ app: termApp, page: termPage } = await openApp(root, userData, 'acme'));
  });

  test.afterAll(async () => {
    await termApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('leaving the project does not close its terminal; opening it again brings the tab back', async () => {
    await termPage.getByTitle('Novo terminal').first().click();
    await termPage.getByRole('menuitem', { name: /Terminal/ }).first().click();
    const pane = termPage.locator('.term-pane:not([hidden])');
    await expect(pane).toBeVisible();
    await pane.click();
    await termPage.keyboard.type('echo moki-segue-rodando');
    await termPage.keyboard.press('Enter');
    await expect(pane.locator('.xterm-rows')).toContainText('moki-segue-rodando');

    // Leaving asks nothing (a confirm would be dismissed and keep us here).
    await termPage.getByTitle('Todos os projetos').click();
    await expect(termPage.locator('.home-project', { hasText: 'Acme Library' }).first()).toBeVisible();
    await termPage.locator('.home-project', { hasText: 'Acme Library' }).first().click();
    await expect(termPage.locator('.term-pane:not([hidden]) .xterm-rows')).toContainText('moki-segue-rodando');

    // Closing its tab is what stops it.
    termPage.once('dialog', (d) => { void d.accept(); });
    await termPage.locator('.tab-close[title="Fechar o terminal"]').first().click();
    await expect(termPage.locator('.term-pane')).toHaveCount(0);
  });
});

// MCP servers: where each one applies is set right in the list (Global switch, project picker, chips).
test.describe.serial('Moki MCP servers list', () => {
  let mcpApp: ElectronApplication;
  let mcpPage: Page;
  const dirs: string[] = [];
  let catalog = '';

  test.beforeAll(async () => {
    const root = fixture();
    addProject(root, 'beta', 'Beta Store');
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    catalog = join(root, 'workspace', 'mcp-servers.json');
    writeFileSync(catalog, JSON.stringify({ servers: [{ id: 'playwright', name: 'Playwright', transport: 'stdio', command: 'npx', args: ['@playwright/mcp@latest'], access: 'read', enabled: true, projects: [] }] }));
    ({ app: mcpApp, page: mcpPage } = await openApp(root, userData, 'acme'));
  });

  test.afterAll(async () => {
    await mcpApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('a server is made global or given to chosen projects from its row', async () => {
    const saved = () => (JSON.parse(readFileSync(catalog, 'utf8')) as { servers: { projects: string[] }[] }).servers[0].projects;
    await mcpPage.getByRole('button', { name: 'Configurações' }).click();
    await mcpPage.getByRole('tab', { name: 'Servidores MCP' }).click();
    await expect(mcpPage.getByText('Usar nas IAs')).toHaveCount(0);
    const global = mcpPage.getByRole('switch', { name: 'Global: Playwright em todos os projetos' });
    const pick = mcpPage.getByRole('button', { name: 'Escolher os projetos de Playwright' });
    await expect(global).toHaveAttribute('aria-checked', 'true');
    await expect(pick).toBeDisabled();

    // Global off: the picker opens; the server stays global until a project is chosen.
    await global.click();
    const picker = mcpPage.getByRole('dialog', { name: 'Projetos de Playwright' });
    await expect(picker).toBeVisible();
    expect(saved()).toEqual([]);
    await picker.getByRole('checkbox', { name: 'Acme Library' }).check();
    await expect.poll(saved).toEqual(['acme']);
    await expect(picker.getByRole('checkbox', { name: 'Acme Library' })).toBeDisabled(); // the last one stays
    await picker.getByRole('checkbox', { name: 'Beta Store' }).check();
    await expect.poll(saved).toEqual(['acme', 'beta']);
    await mcpPage.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);

    // The projects show as chips under the row; one can be removed there.
    const chips = mcpPage.getByRole('list', { name: 'Projetos de Playwright' });
    await expect(chips.locator('.mcp-chip')).toHaveText(['Acme Library', 'Beta Store']);
    await chips.getByRole('button', { name: 'Tirar Beta Store de Playwright' }).click();
    await expect.poll(saved).toEqual(['acme']);
    await expect(chips.locator('.mcp-chip')).toHaveText(['Acme Library']);

    // Global on again: every project, no chips.
    await global.click();
    await expect.poll(saved).toEqual([]);
    await expect(global).toHaveAttribute('aria-checked', 'true');
    await expect(mcpPage.locator('.mcp-chip')).toHaveCount(0);
  });
});

// A small PDF with one line of text per page, its xref offsets computed (pdf.js reads it as is).
function smallPdf(lines: string[]): Buffer {
  const objs: string[] = [];
  const pageIds = lines.map((_, i) => 3 + i * 2);
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${lines.length} >>`);
  const font = 3 + lines.length * 2;
  lines.forEach((line, i) => {
    const stream = `BT /F1 18 Tf 72 700 Td (${line}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const REVIEW_MD = '# Revisão\n\nA senha expira em 30 dias.\n';

test.describe.serial('Moki PDF comments', () => {
  let pdfApp: ElectronApplication;
  let pdfPage: Page;
  const dirs: string[] = [];

  test.beforeAll(async () => {
    const root = fixture();
    writeFileSync(join(root, 'workspace', 'projects', 'acme', 'relatorio.pdf'), smallPdf(['Requisito de login', 'Segunda pagina']));
    writeFileSync(join(root, 'workspace', 'projects', 'acme', 'revisao.md'), REVIEW_MD);
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    ({ app: pdfApp, page: pdfPage } = await openApp(root, userData, 'acme'));
  });

  test.afterAll(async () => {
    await pdfApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('a selection is commented right on the page; the comment stays beside it, joined by a line', async () => {
    await pdfPage.locator('.tree-row[title="relatorio.pdf"]').click();
    const span = pdfPage.locator('.pdf-page .textLayer span', { hasText: 'Requisito' }).first();
    await expect(span).toBeVisible();
    await pdfPage.evaluate(() => {
      const el = [...document.querySelectorAll('.pdf-page .textLayer span')].find((s) => s.textContent?.includes('Requisito'));
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(range);
      document.querySelector('.pdf-pages')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    const box = pdfPage.getByRole('dialog', { name: 'Destacar e comentar' });
    await expect(box).toBeVisible();
    await box.getByRole('radio', { name: 'Verde' }).click();
    await box.getByRole('textbox').fill('Falta o caso de senha expirada');
    await box.getByRole('button', { name: 'Comentar' }).click();
    await expect(box).toHaveCount(0);

    const card = pdfPage.locator('.pdf-card', { hasText: 'Falta o caso de senha expirada' });
    await expect(card).toBeVisible();
    await expect(pdfPage.locator('.pdf-links path')).toHaveCount(1);
    // The card sits at the height of the commented line, beside the page.
    const spanBox = await span.boundingBox();
    await expect.poll(async () => Math.abs(((await card.boundingBox())?.y ?? 0) + 18 - ((spanBox?.y ?? 0) + (spanBox?.height ?? 0) / 2))).toBeLessThan(30);
    expect(((await card.boundingBox())?.x ?? 0)).toBeGreaterThan((spanBox?.x ?? 0) + (spanBox?.width ?? 0));

    await card.getByRole('button', { name: 'Responder' }).click();
    const thread = pdfPage.locator('.pdf-card').first();
    await thread.getByRole('textbox').fill('Vou incluir');
    await thread.getByRole('button', { name: 'Salvar' }).click();
    await expect(thread).toContainText('Vou incluir');

    // The column closes from the bar: the page grows and a mark on its edge shows the comment; the mark opens it again.
    const pageWidth = async () => (await pdfPage.locator('.pdf-page').first().boundingBox())?.width ?? 0;
    const withRail = await pageWidth();
    await pdfPage.getByRole('button', { name: /^Comentários \(/ }).click();
    await expect(pdfPage.locator('.pdf-card')).toHaveCount(0);
    await expect.poll(pageWidth).toBeGreaterThan(withRail);
    const marker = pdfPage.locator('.pdf-marker');
    await expect(marker).toHaveCount(1);
    await marker.click();
    await expect(pdfPage.locator('.pdf-card')).toHaveCount(1);

    // The search field finds the text in every page, selects the match (the box opens there) and highlights all of them.
    const field = pdfPage.getByRole('searchbox', { name: 'Buscar no PDF' });
    await field.fill('pagina');
    await field.press('Enter');
    await expect(pdfPage.locator('.pdf-find-count')).toHaveText('1 de 1');
    await expect(pdfPage.getByRole('dialog', { name: 'Destacar e comentar' })).toBeVisible();
    await pdfPage.getByRole('button', { name: 'Destacar todas' }).click();
    await expect(pdfPage.locator('.pdf-card')).toHaveCount(2);
    await expect(pdfPage.locator('.pdf-card').nth(1)).toContainText('página 2');
    // The comments took the project panel's place; opening the panel closes them, and a button brings them back.
    await expect(pdfPage.locator('.workspace.panel-rail')).toHaveCount(1);
  });

  test('a .md file is commented the same way; the comment is kept inside the file, invisible to other viewers', async () => {
    const file = join(dirs[0], 'workspace', 'projects', 'acme', 'revisao.md');
    await pdfPage.locator('.tree-row[title="revisao.md"]').click();
    const text = pdfPage.locator('.md-commented .markdown p', { hasText: 'A senha expira' });
    await expect(text).toBeVisible();
    await text.evaluate((p) => {
      const node = p.firstChild as Text;
      const start = node.data.indexOf('expira em 30 dias');
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + 'expira em 30 dias'.length);
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(range);
      p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    const box = pdfPage.getByRole('dialog', { name: 'Comentário' });
    await box.getByRole('textbox').fill('E quando expira?');
    await box.getByRole('button', { name: 'Comentar' }).click();

    await expect(pdfPage.locator('.md-card')).toContainText('E quando expira?');
    await expect(pdfPage.locator('mark.md-comment')).toHaveText('expira em 30 dias');
    await expect(pdfPage.locator('.md-links path')).toHaveCount(1);
    await expect.poll(() => readFileSync(file, 'utf8')).toMatch(/A senha <!--c:[a-z0-9]+-->expira em 30 dias<!--\/c:[a-z0-9]+-->\./);
    expect(readFileSync(file, 'utf8')).toContain('<!-- moki-comments');

    // The bar's comments button hides the column (a mark on the text's edge stays) and the mark brings it back.
    await pdfPage.locator('.doc-bar').getByRole('button', { name: 'Comentários (1)' }).click();
    await expect(pdfPage.locator('.md-card')).toHaveCount(0);
    await expect(pdfPage.locator('mark.md-comment')).toHaveText('expira em 30 dias');
    await pdfPage.locator('.md-marker').click();
    await expect(pdfPage.locator('.md-card')).toContainText('E quando expira?');

    pdfPage.once('dialog', (d) => { void d.accept(); });
    await pdfPage.locator('.md-card').getByRole('button', { name: 'Excluir' }).click();
    await expect(pdfPage.locator('.md-card')).toHaveCount(0);
    await expect.poll(() => readFileSync(file, 'utf8')).toBe(REVIEW_MD);
  });
});

// Activities: ready-made requests, configured in Settings like agents and skills; favorites come first.
test.describe.serial('Moki activities', () => {
  let actApp: ElectronApplication;
  let actPage: Page;
  const dirs: string[] = [];
  let library = '';

  test.beforeAll(async () => {
    const root = fixture();
    const userData = mkdtempSync(join(tmpdir(), 'moki-profile-'));
    dirs.push(root, userData);
    library = join(root, 'workspace', 'library', 'activities');
    ({ app: actApp, page: actPage } = await openApp(root, userData, 'acme'));
  });

  test.afterAll(async () => {
    await actApp?.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test('a new activity is created in Settings, starred, and comes first when opening the AI tool', async () => {
    await actPage.getByRole('button', { name: 'Configurações' }).click();
    await actPage.getByRole('tab', { name: 'Atividades' }).click();
    await expect(actPage.locator('.activity-item .list-card-title').getByText('Desenhar testes', { exact: true })).toBeVisible(); // one that comes with Moki
    await actPage.getByRole('button', { name: 'Nova atividade' }).click();
    await actPage.getByRole('textbox', { name: 'Nome' }).fill('Checar smoke');
    await actPage.getByRole('combobox', { name: 'O que ela usa' }).selectOption('test-design');
    await actPage.getByRole('textbox', { name: 'Pedido enviado à IA' }).fill('Use the test-design skill to list smoke checks for: {files}.');
    await actPage.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(actPage.getByRole('heading', { name: 'Checar smoke', level: 1 })).toBeVisible();
    await expect.poll(() => existsSync(join(library, 'checar-smoke.md'))).toBe(true);
    expect(readFileSync(join(library, 'checar-smoke.md'), 'utf8')).toContain('uses: skill:test-design');

    await actPage.getByRole('button', { name: 'Favorita: Checar smoke' }).click();
    await expect(actPage.getByRole('button', { name: 'Favorita: Checar smoke' })).toHaveAttribute('aria-pressed', 'true');
    await actPage.getByRole('button', { name: 'Voltar para Atividades' }).click();
    await actPage.getByRole('tab', { name: /^Favoritas/ }).click();
    await expect(actPage.locator('.activity-item .list-card-title')).toHaveText(['Checar smoke']);

    // In the project, the starred activity is the first one offered.
    await actPage.getByRole('button', { name: 'Configurações' }).click();
    await actPage.getByRole('button', { name: 'Abrir na sua ferramenta de IA' }).click();
    await expect(actPage.locator('.answer-list .answer').first()).toContainText('Checar smoke');
  });
});
