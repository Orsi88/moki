// A loose note's formatted view is editable, its title sits beside the project
// destination, and each start-screen section scrolls on its own.
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/repo.mjs';
import { launchMoki } from './launch.ts';

let app: ElectronApplication;
let page: Page;
let root = '';
let userData = '';

function addProject(id: string, name: string): void {
  const project = join(root, 'workspace', 'projects', id);
  cpSync(join(ROOT, 'templates', 'project-context'), project, { recursive: true });
  renameSync(join(project, 'gitignore.txt'), join(project, '.gitignore'));
  for (const dir of ['inbox', 'runs', 'temporary']) mkdirSync(join(project, dir), { recursive: true });
  const file = join(project, 'project.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  writeFileSync(file, `${JSON.stringify({ ...data, project: id, name }, null, 2)}\n`);
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'moki-note-ui-'));
  userData = mkdtempSync(join(tmpdir(), 'moki-note-profile-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.0.0-test' }));
  cpSync(join(ROOT, 'skills'), join(root, 'skills'), { recursive: true });
  cpSync(join(ROOT, 'agents'), join(root, 'agents'), { recursive: true });
  cpSync(join(ROOT, 'activities'), join(root, 'activities'), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  for (let i = 1; i <= 14; i++) addProject(`p${i}`, `Projeto ${i}`);
  app = await launchMoki({ QA_ROOT: root, QA_USER_DATA: userData, QA_OPEN_PROJECT: 'p1' });
  page = await app.firstWindow();
  page.on('pageerror', (err) => console.error('pageerror', err.message));
  await page.evaluate(() => {
    localStorage.setItem('qa-ui-language', 'pt-BR');
    localStorage.setItem('qa-language', 'Portuguese (pt-BR)');
  });
  const reloaded = page.waitForEvent('load');
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1100, 720);
    win.webContents.reload();
  });
  await reloaded;
});

test.afterAll(async () => {
  await Promise.race([app?.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  for (const dir of [root, userData]) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 2 }); } catch { /* the window may still hold the profile */ }
  }
});

test('execution phases are separate buttons, and the plus is not one of them', async () => {
  const ops = page.getByRole('region', { name: 'Execuções' });
  const phases = ops.locator('.ops-phases');
  const tabs = phases.getByRole('tablist');
  await expect(tabs.getByRole('tab', { name: 'Em andamento' })).toHaveAttribute('aria-selected', 'true');
  await expect(phases.getByRole('button', { name: 'Vincular operações a este projeto' })).toHaveCount(0);
});

test('start-screen sections keep their headings and scroll on their own', async () => {
  await page.locator('.project-switch').click();
  const projects = page.locator('.home-block').filter({ hasText: 'Projetos' });
  const notes = page.locator('.home-block').filter({ hasText: 'Notas avulsas' });
  await expect(projects).toBeVisible();
  await expect(notes).toBeVisible();
  const notesHead = notes.locator('.home-list-head');
  const before = await notesHead.boundingBox();
  const scroller = projects.locator('.home-block-scroll');
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const after = await notesHead.boundingBox();
  expect(before && after && Math.abs(before.y - after.y)).toBeLessThan(2);

  const projectsHead = projects.getByRole('button', { name: 'Projetos' });
  const projectsTop = await projectsHead.boundingBox();
  await projectsHead.click();
  await expect(projects.locator('.home-block-scroll')).toHaveCount(0);
  await expect(projectsHead).toHaveAttribute('aria-expanded', 'false');
  const collapsedNotes = await notesHead.boundingBox();
  expect(projectsTop && collapsedNotes && collapsedNotes.y).toBeLessThan(projectsTop.y + 80);
  await projectsHead.click();
  await expect(projects.locator('.home-block-scroll')).toBeVisible();
});

test('a formatted note can be edited, with the title beside the project destination', async () => {
  await page.getByRole('button', { name: 'Nova nota' }).click();
  const note = page.locator('.home-main .note-dialog');
  const title = note.getByPlaceholder('ex.: Ideias de teste');
  const destination = note.locator('select');
  await expect(title).toBeVisible();
  await expect(destination).toBeVisible();
  const titleBox = await title.boundingBox();
  const destinationBox = await destination.boundingBox();
  expect(titleBox && destinationBox && Math.abs(titleBox.y - destinationBox.y)).toBeLessThan(8);
  expect(destinationBox && titleBox && destinationBox.x).toBeGreaterThan(titleBox.x + titleBox.width - 4);

  // The note already opens in its formatted editor.
  const visual = note.locator('.tiptap-body');
  await expect(visual).toBeVisible();
  await visual.click();
  await page.keyboard.type('editavel');
  await expect(visual).toContainText('editavel');
});
