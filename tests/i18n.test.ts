// The desktop app's Portuguese dictionary covers every text the app shows: the
// literal t('…') calls and the labels that come from the main process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/repo.mjs';
import { LANGUAGES } from '../scripts/lib/core.ts';
import { listActivities } from '../scripts/lib/activities.ts';

const SRC = join(ROOT, 'app', 'src');
const pt: Record<string, string> = JSON.parse(readFileSync(join(SRC, 'i18n', 'pt-BR.json'), 'utf8'));

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

test('every text of the app has a pt-BR translation', () => {
  const dynamic = [
    ...serviceMessages(),
    ...listActivities(ROOT).filter((a) => a.source !== 'library').flatMap((a) => [a.label, a.description]), // the ones that come with Moki
    ...LANGUAGES,
  ].filter((k): k is string => Boolean(k));
  const missing = [...keysInApp(), ...dynamic].filter((k) => !Object.hasOwn(pt, k));
  assert.deepEqual([...new Set(missing)], []);
});

test('translations keep the {placeholders} of the English text', () => {
  for (const [en, tr] of Object.entries(pt)) {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(names(tr), names(en), en);
  }
});
