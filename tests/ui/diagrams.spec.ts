// A note with a Mermaid fence and an Excalidraw fence draws both in the reading view.
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/repo.mjs';
import { launchMoki } from './launch.ts';

const NOTE = `\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`excalidraw
{"type":"excalidraw","version":2,"source":"moki","elements":[],"appState":{"viewBackgroundColor":"#ffffff"},"files":{}}
\`\`\`
`;

let app: ElectronApplication;
let page: Page;
let root = '';
let userData = '';

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'moki-diagram-ui-'));
  userData = mkdtempSync(join(tmpdir(), 'moki-diagram-profile-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.0.0-test' }));
  cpSync(join(ROOT, 'skills'), join(root, 'skills'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  cpSync(join(ROOT, 'activities'), join(root, 'activities'), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  const project = join(root, 'workspace', 'projects', 'acme');
  cpSync(join(ROOT, 'templates', 'project-context'), project, { recursive: true });
  renameSync(join(project, 'gitignore.txt'), join(project, '.gitignore'));
  for (const dir of ['inbox', 'runs', 'temporary', 'notes']) mkdirSync(join(project, dir), { recursive: true });
  const file = join(project, 'project.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  writeFileSync(file, `${JSON.stringify({ ...data, project: 'acme', name: 'Acme Library' }, null, 2)}\n`);
  writeFileSync(join(project, 'notes', 'diagram.md'), NOTE);
  writeFileSync(join(project, 'inbox', 'plain.md'), 'Olá\n');

  app = await launchMoki({ QA_ROOT: root, QA_USER_DATA: userData, QA_OPEN_PROJECT: 'acme' });
  page = await app.firstWindow();
  page.on('pageerror', (err) => console.error('pageerror', err.message));
  await page.evaluate(() => {
    localStorage.setItem('qa-ui-language', 'pt-BR');
    localStorage.setItem('qa-language', 'Portuguese (pt-BR)');
  });
  const reloaded = page.waitForEvent('load');
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.reload(); });
  await reloaded;
});

test.afterAll(async () => {
  await Promise.race([app?.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
  for (const dir of [root, userData]) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* the window can keep its profile locked briefly */ }
  }
});

test('a note draws the Mermaid chart and the Excalidraw scene', async () => {
  await page.locator('.tree-row[title="notes"]').click();
  await page.locator('.tree-row[title="notes/diagram.md"]').click();
  const note = page.locator('.note-dialog');
  // A note opens straight in its formatted editor: the diagrams are drawn there.
  const pictures = note.locator('.diagram-picture');
  await expect(pictures).toHaveCount(2);
  await expect(pictures.first().locator('svg')).toBeVisible();
  await expect(pictures.first()).toContainText('A');
  await expect(pictures.nth(1).locator('svg')).toBeVisible();
  await note.getByRole('button', { name: 'Editar desenho' }).click();
  const editor = page.getByRole('dialog', { name: 'Desenho' });
  await expect(editor.locator('.excalidraw')).toBeVisible();
  await editor.getByRole('button', { name: 'Cancelar' }).click();
  await expect(editor).toBeHidden();
});

test('typing / in a Markdown file lists commands, including the diagrams', async () => {
  const close = page.getByRole('button', { name: 'Fechar (Esc)' });
  if (await close.isVisible()) await close.click();
  await page.locator('.tree-row[title="inbox"]').click();
  await page.locator('.tree-row[title="inbox/plain.md"]').click();
  await page.getByRole('button', { name: 'Editar (Ctrl+E)' }).click();
  const visual = page.locator('.tiptap-body');
  await visual.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('/');
  const commands = page.getByRole('listbox', { name: 'Comandos' });
  await expect(commands).toBeVisible();
  await expect(commands.getByRole('option', { name: 'Diagrama' })).toBeVisible();
  await expect(commands.getByRole('option', { name: 'Desenho' })).toBeVisible();
  await commands.getByRole('option', { name: 'Diagrama' }).click();
  await expect(visual.locator('svg')).toBeVisible();
  const after = visual.locator('.node-diagramFence + p'); // the React node view wraps the .diagram card in its own element
  await after.click();
  await page.keyboard.type('depois');
  await expect(after).toContainText('depois');
  await page.keyboard.press('Enter');
  await page.keyboard.type('linha');
  await expect(visual.locator('.node-diagramFence ~ p').nth(1)).toContainText('linha');

  // Saved, the file keeps the fence as Markdown; an unsaved tab would also keep the window from closing (beforeunload).
  await page.locator('.doc-bar').getByRole('button', { name: 'Salvar' }).click();
  const saved = join(root, 'workspace', 'projects', 'acme', 'inbox', 'plain.md');
  await expect.poll(() => readFileSync(saved, 'utf8')).toMatch(/```mermaid\n[\s\S]+\n```[\s\S]*depois[\s\S]*linha/);
});
