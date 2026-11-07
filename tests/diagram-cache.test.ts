import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cachedMermaid, createDiagramCache, diagramKey, withId } from '../app/src/diagram-cache.ts';
import { mountDiagramJobs } from '../app/src/diagram-mount.ts';

test('a stored diagram is a hit, an unknown one a miss', () => {
  const cache = createDiagramCache();
  const key = diagramKey('mermaid', 'dark', 'A-->B');
  assert.equal(cache.get(key), undefined);
  cache.set(key, { svg: '<svg>1</svg>' });
  assert.equal(cache.get(key)?.svg, '<svg>1</svg>');
});

test('language, theme and source make different keys and never share a drawing', () => {
  const cache = createDiagramCache();
  const keys = [
    diagramKey('mermaid', 'dark', 'A-->B'),
    diagramKey('mermaid', 'neutral', 'A-->B'),
    diagramKey('excalidraw', 'dark', 'A-->B'),
    diagramKey('mermaid', 'dark', 'A-->C'),
    // Fields cannot slide into each other.
    diagramKey('mermaid', 'dark\nA-->B', ''),
    diagramKey('mermaid\ndark', 'A-->B', ''),
  ];
  assert.equal(new Set(keys).size, keys.length);
  keys.forEach((key, i) => cache.set(key, { svg: `<svg>${i}</svg>` }));
  keys.forEach((key, i) => assert.equal(cache.get(key)?.svg, `<svg>${i}</svg>`));
});

test('the entry limit drops the least recently used diagram', () => {
  const cache = createDiagramCache(2, 1_000_000);
  cache.set('a', { svg: '1' });
  cache.set('b', { svg: '2' });
  cache.get('a');
  cache.set('c', { svg: '3' });
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a')?.svg, '1');
  assert.equal(cache.get('c')?.svg, '3');
  assert.equal(cache.size, 2);
});

test('the byte limit drops old diagrams, and one that cannot fit is not stored', () => {
  const cache = createDiagramCache(50, 100);
  cache.set('a', { svg: 'x'.repeat(20) }); // (1 + 20) * 2 = 42 bytes
  cache.set('b', { svg: 'x'.repeat(20) });
  assert.equal(cache.bytes, 84);
  cache.set('c', { svg: 'x'.repeat(20) });
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.size, 2);
  assert.equal(cache.bytes, 84);
  cache.set('huge', { svg: 'x'.repeat(200) });
  assert.equal(cache.get('huge'), undefined);
  assert.equal(cache.size, 2);
  cache.set('b', { svg: 'y' });
  assert.equal(cache.bytes, 42 + 4);
  cache.clear();
  assert.equal(cache.bytes, 0);
});

test('a hit is served under the id of the new render', () => {
  const svg = '<svg id="mk0aaaaa"><style>#mk0aaaaa .x{}</style><marker id="mk0aaaaa_end"/></svg>';
  const out = withId({ svg, id: 'mk0aaaaa' }, 'mk1bbbbb');
  assert.equal(out.includes('mk0aaaaa'), false);
  assert.equal(out, '<svg id="mk1bbbbb"><style>#mk1bbbbb .x{}</style><marker id="mk1bbbbb_end"/></svg>');
});

const job = (index: number, source: string) => ({ index, lang: 'mermaid' as const, source });

async function mount(jobs: ReturnType<typeof job>[], drawer: ReturnType<typeof cachedMermaid>) {
  const shown: string[] = [];
  const failed: number[] = [];
  await mountDiagramJobs(jobs, {
    card: (j) => j.index,
    draw: async () => {},
    loadMermaid: async () => drawer,
    show: (_card, svg) => { shown.push(svg); },
    fail: (card) => { failed.push(card); },
  });
  return { shown, failed };
}

test('mounting the same diagrams again does not call the renderer', async () => {
  const cache = createDiagramCache();
  const calls: string[] = [];
  const drawer = cachedMermaid({
    render: async (id, source) => { calls.push(source); return `<svg id="${id}">${source}</svg>`; },
  }, 'dark', cache);
  const first = await mount([job(0, 'A-->B'), job(1, 'C-->D')], drawer);
  assert.deepEqual(calls, ['A-->B', 'C-->D']);
  const second = await mount([job(0, 'A-->B'), job(1, 'C-->D')], drawer);
  assert.deepEqual(calls, ['A-->B', 'C-->D']);
  assert.equal(second.shown.length, 2);
  // Each picture of the second mount has an id of its own, and the right source.
  assert.equal(second.shown[0].includes('A-->B'), true);
  assert.equal(second.shown[1].includes('C-->D'), true);
  assert.equal(second.shown[0].includes(first.shown[0].match(/id="([^"]+)"/)![1]), false);
});

test('another theme, an edited source and a failed render are drawn again', async () => {
  const cache = createDiagramCache();
  const calls: string[] = [];
  const make = (theme: string) => cachedMermaid({
    render: async (id, source) => {
      calls.push(`${theme}:${source}`);
      if (source === 'bad') throw new Error('syntax');
      return `<svg id="${id}">${theme}${source}</svg>`;
    },
  }, theme, cache);
  await mount([job(0, 'A-->B')], make('dark'));
  await mount([job(0, 'A-->B')], make('neutral'));
  const edited = await mount([job(0, 'A-->C')], make('dark'));
  assert.equal(edited.shown[0].includes('A-->B'), false);
  assert.equal((await mount([job(0, 'bad')], make('dark'))).failed.length, 1);
  assert.equal((await mount([job(0, 'bad')], make('dark'))).failed.length, 1);
  assert.deepEqual(calls, ['dark:A-->B', 'neutral:A-->B', 'dark:A-->C', 'dark:bad', 'dark:bad']);
});
