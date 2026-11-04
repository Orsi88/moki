// The desktop app's dictionaries cover every text the app shows: the
// literal t('…') calls and the labels that come from the main process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { ROOT } from '../scripts/lib/repo.mjs';
import { LANGUAGES } from '../scripts/lib/core.ts';
import { listActivities } from '../scripts/lib/activities.ts';

const SRC = join(ROOT, 'app', 'src');
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  ['pt-BR', 'es'].map((lang) => [lang, JSON.parse(readFileSync(join(SRC, 'i18n', `${lang}.json`), 'utf8'))]),
);

function keysInApp(): Set<string> {
  const keys = new Set<string>();
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
  for (const f of files) {
    for (const m of readFileSync(join(SRC, f), 'utf8').matchAll(/\bt\((['"])((?:\\.|(?!\1).)*)\1/g)) {
      keys.add(m[2].replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1'));
    }
  }
  return keys;
}

// Messages the main process sends for the app to translate (operation check: err('…') / warn('…')).
function serviceMessages(): string[] {
  const source = readFileSync(join(ROOT, 'scripts', 'lib', 'operations.ts'), 'utf8');
  return [...source.matchAll(/\b(?:err|warn)\((['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2].replace(/\\(['"\\])/g, '$1'));
}

for (const [lang, dict] of Object.entries(dictionaries)) {
  test(`every text of the app has a ${lang} translation`, () => {
    const dynamic = [
      ...serviceMessages(),
      ...listActivities(ROOT).filter((a) => a.source !== 'library').flatMap((a) => [a.label, a.description]), // the ones that come with Moki
      ...LANGUAGES,
    ].filter((k): k is string => Boolean(k));
    const missing = [...keysInApp(), ...dynamic].filter((k) => !Object.hasOwn(dict, k) || !dict[k].trim());
    assert.deepEqual([...new Set(missing)], []);
  });

  test(`${lang} translations keep the {placeholders} of the English text`, () => {
    for (const [en, tr] of Object.entries(dict)) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(names(tr), names(en), en);
    }
  });
}

// Bundle the real renderer module just as Vite does, without needing a DOM or Electron.
const code = buildSync({
  entryPoints: [join(SRC, 'i18n.ts')], bundle: true, write: false, format: 'cjs',
  define: { 'process.env.NODE_ENV': '"production"' },
}).outputFiles[0].text;

function loadLanguage(saved?: string) {
  const storage = new Map<string, string>(saved ? [['qa-ui-language', saved]] : []);
  const element = { lang: '' };
  const module = { exports: {} as {
    lang: string;
    setLang: (lang: string) => void;
    t: (text: string, vars?: Record<string, string | number>) => string;
    conversationLanguage: () => string;
  } };
  runInNewContext(code, {
    module, exports: module.exports, document: { documentElement: element },
    window: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  });
  return { api: module.exports, storage, element };
}

const languages = [
  { lang: 'en', title: 'Choose a workspace', back: 'Back to Moki', conversation: 'English' },
  { lang: 'pt-BR', title: 'Escolha um workspace', back: 'Voltar para Moki', conversation: 'Portuguese (pt-BR)' },
  { lang: 'es', title: 'Elige un espacio de trabajo', back: 'Volver a Moki', conversation: 'Spanish' },
];

for (const expected of languages) {
  test(`${expected.lang} is selected, persisted and restored with the right conversation default`, () => {
    const { api, storage, element } = loadLanguage();
    api.setLang(expected.lang);
    assert.equal(api.lang, expected.lang);
    assert.equal(element.lang, expected.lang);
    assert.equal(api.t('Choose a workspace'), expected.title);
    assert.equal(api.t('Back to {name}', { name: 'Moki' }), expected.back);
    assert.equal(api.conversationLanguage(), expected.conversation);
    assert.equal(storage.get('qa-ui-language'), expected.lang);
    const restored = loadLanguage(storage.get('qa-ui-language'));
    assert.equal(restored.api.lang, expected.lang);
    assert.equal(restored.element.lang, expected.lang);
    assert.equal(restored.api.t('Choose a workspace'), expected.title);
    assert.equal(restored.api.conversationLanguage(), expected.conversation);
  });
}

test('switching between all interface languages replaces the dictionary and preserves an explicit conversation language', () => {
  const { api, storage } = loadLanguage();
  storage.set('qa-language', 'Portuguese (pt-BR)');
  for (const expected of [languages[2], languages[0], languages[1], languages[2]]) {
    api.setLang(expected.lang);
    assert.equal(api.t('Choose a workspace'), expected.title);
    assert.equal(api.conversationLanguage(), 'Portuguese (pt-BR)');
    assert.equal(api.t('Unknown {name}', { name: 'Moki' }), 'Unknown Moki');
  }
});

test('an absent or unsupported stored language still defaults to English', () => {
  for (const saved of [undefined, 'unsupported', 'constructor', '__proto__']) {
    const { api, element } = loadLanguage(saved);
    assert.equal(api.lang, 'en');
    assert.equal(element.lang, 'en');
    assert.equal(api.t('Choose a workspace'), 'Choose a workspace');
    assert.equal(api.conversationLanguage(), 'English');
  }
});
