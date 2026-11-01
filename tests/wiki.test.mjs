// The wiki is built from docs/ (scripts/build-wiki.mjs): every page of docs/wiki.json, links that work in the wiki.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWiki, pageName, wikiPages } from '../scripts/build-wiki.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..'); // this checkout, whatever QA_ROOT says

test('every page of docs/wiki.json is built, with Home, the sidebar and the footer', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'docs', 'wiki.json'), 'utf8'));
  const pages = buildWiki(root);
  for (const p of wikiPages(manifest)) assert.ok(pages[`${pageName(p.page)}.md`], p.page);
  for (const f of ['Home.md', '_Sidebar.md', '_Footer.md']) assert.ok(pages[f], f);
  assert.match(pages['_Sidebar.md'], /\[Moki na IDE\]\(Moki-na-IDE\)/);
});

test('links become wiki pages or GitHub links; a page says where it is edited and links its translation', () => {
  const pages = buildWiki(root, { ref: 'main', sha: '0123456789abcdef' });
  const ide = pages['Moki-in-the-IDE.md'];
  assert.match(ide, /^> Generated from \[docs\/ide\.md\]\(https:\/\/github\.com\/Orsi88\/moki\/blob\/main\/docs\/ide\.md\)/);
  assert.match(ide, /Em português: \[Moki na IDE\]\(Moki-na-IDE\)/);
  assert.match(ide, /\]\(MCP-servers\)/, 'a docs page is a wiki page');
  assert.match(ide, /\]\(https:\/\/github\.com\/Orsi88\/moki\/blob\/main\/ide\/vscode\/README\.md\)/, 'the rest of the repository is on GitHub');
  assert.match(pages['Troubleshooting.md'], /\]\(Moki-in-the-IDE#exceptions-and-troubleshooting\)/, 'anchors are kept');
  assert.doesNotMatch(ide, /In development/, 'main is not in development');
  assert.match(pages['_Footer.md'], /0123456/);
  for (const [name, text] of Object.entries(pages)) {
    const prose = text.replace(/```[\s\S]*?```/g, '');
    assert.doesNotMatch(prose, /\]\((?!https?:|mailto:|#)[^)]*\.md[)#]/, `${name}: no relative .md link left`);
  }
});

test('another branch gets the in-development note; a broken link stops the build', () => {
  assert.match(buildWiki(root, { ref: 'ide-companion' })['Moki-na-IDE.md'], /Versão em desenvolvimento.*ide-companion/);
  const copy = mkdtempSync(join(tmpdir(), 'moki-wiki-'));
  try {
    cpSync(join(root, 'docs'), join(copy, 'docs'), { recursive: true });
    cpSync(join(root, 'ide', 'vscode', 'README.md'), join(copy, 'ide', 'vscode', 'README.md'));
    cpSync(join(root, 'ide', 'mcp', 'server.ts'), join(copy, 'ide', 'mcp', 'server.ts'));
    for (const d of ['skills', 'agents', 'core', 'templates', 'schemas', 'scripts', 'desktop', 'app', 'adapters', 'examples', 'tests']) cpSync(join(root, d), join(copy, d), { recursive: true, filter: (s) => !s.includes('node_modules') && !s.includes(join('app', 'dist')) });
    cpSync(join(root, 'LICENSE'), join(copy, 'LICENSE'));
    buildWiki(copy); // the copy builds
    writeFileSync(join(copy, 'docs', 'troubleshooting.md'), '# T\n\n[gone](nowhere.md)\n');
    assert.throws(() => buildWiki(copy), /docs\/troubleshooting\.md: broken link "nowhere\.md"/);
  } finally { rmSync(copy, { recursive: true, force: true }); }
});
