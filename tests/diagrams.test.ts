import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountDiagramJobs } from '../app/src/diagram-mount.ts';
import { replaceDiagram } from '../app/src/diagram-source.ts';
import { applyDiagramImages, diagramSources } from '../scripts/lib/diagram-images.mjs';
import { markdownToHtml } from '../scripts/lib/markdown.mjs';

test('replacing one drawing leaves the other diagram alone', () => {
  const md = '```excalidraw\n{"type":"excalidraw","elements":[]}\n```\n\n```mermaid\nA-->B\n```';
  const next = replaceDiagram(md, 0, 'excalidraw', '{"type":"excalidraw","elements":[{"id":"a"}]}');
  assert.match(next, /"id":"a"/);
  assert.match(next, /```mermaid\nA-->B\n```/);
  assert.equal(replaceDiagram(md, 1, 'mermaid', 'C-->D').includes('C-->D'), true);
});

const both = [
  { index: 0, lang: 'excalidraw' as const, source: '{"type":"excalidraw","elements":[]}' },
  { index: 1, lang: 'mermaid' as const, source: 'A-->B' },
];

test('a drawing is drawn while the diagram under it is still loading', async () => {
  const events: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const done = mountDiagramJobs(both, {
    card: (job) => { events.push(`card:${job.lang}`); return job.lang; },
    draw: async () => { events.push('draw'); },
    loadMermaid: async () => {
      events.push('load');
      await gate;
      return { render: async () => '<svg></svg>' };
    },
    show: () => { events.push('show'); },
    fail: () => { events.push('fail'); },
  });
  assert.deepEqual(events, ['card:excalidraw', 'card:mermaid', 'draw', 'load']);
  release();
  await done;
  assert.deepEqual(events, ['card:excalidraw', 'card:mermaid', 'draw', 'load', 'show']);
});

test('a diagram that fails to load does not hide the drawing', async () => {
  const failed: string[] = [];
  let drew = false;
  await mountDiagramJobs(both, {
    card: (job) => job.lang,
    draw: async () => { drew = true; },
    loadMermaid: async () => { throw new Error('missing'); },
    show: () => { throw new Error('the diagram was shown'); },
    fail: (card) => { failed.push(card); },
  });
  assert.equal(drew, true);
  assert.deepEqual(failed, ['mermaid']);
});

test('one diagram that cannot be drawn leaves the drawing', async () => {
  const failed: string[] = [];
  let drew = false;
  await mountDiagramJobs(both, {
    card: (job) => job.lang,
    draw: async () => { drew = true; },
    loadMermaid: async () => ({ render: async () => { throw new Error('bad'); } }),
    show: () => { throw new Error('the diagram was shown'); },
    fail: (card) => { failed.push(card); },
  });
  assert.equal(drew, true);
  assert.deepEqual(failed, ['mermaid']);
});

test('a drawing that cannot be drawn does not stop the diagram', async () => {
  const shown: string[] = [];
  const failed: string[] = [];
  await mountDiagramJobs(both, {
    card: (job) => job.lang,
    draw: async () => { throw new Error('invalid'); },
    loadMermaid: async () => ({ render: async () => '<svg></svg>' }),
    show: (card, svg) => { shown.push(`${card}:${svg}`); },
    fail: (card) => { failed.push(card); },
  });
  assert.deepEqual(failed, ['excalidraw']);
  assert.deepEqual(shown, ['mermaid:<svg></svg>']);
});

test('a note with only a drawing never loads Mermaid', async () => {
  let loaded = false;
  await mountDiagramJobs([{ index: 0, lang: 'excalidraw', source: '{}' }], {
    card: () => 0,
    draw: async () => {},
    loadMermaid: async () => { loaded = true; return { render: async () => '' }; },
    show: () => {},
    fail: () => { throw new Error('the drawing failed'); },
  });
  assert.equal(loaded, false);
});

test('a diagram picture replaces only the block that was drawn', () => {
  const html = markdownToHtml('```mermaid\nA-->B\n```');
  assert.equal(diagramSources(html)[0].source, 'A-->B');
  assert.match(applyDiagramImages(html, ['data:image/png;base64,QQ==']), /<img class="diagram" alt="Diagram" src="data:image\/png;base64,QQ==">/);
  assert.equal(applyDiagramImages(html, [null]), html);
});
