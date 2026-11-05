import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinDiagramFences, splitDiagramFences } from '../app/src/diagram-source.ts';

test('a closed drawing or diagram folds out of the text and joins back', () => {
  const md = 'antes\n\n```excalidraw\n{"type":"excalidraw"}\n```\n\ndepois\n```mermaid\nflowchart LR\n  A --> B\n```\n';
  const parts = splitDiagramFences(md);
  assert.deepEqual(parts.map((part) => part.kind === 'text' ? part.text : part.lang), ['antes\n\n', 'excalidraw', '\n\ndepois\n', 'mermaid', '\n']);
  assert.equal(joinDiagramFences(parts), md);
});

test('an unfinished fence and any other code fence stay in the text', () => {
  const md = '```js\nconst a = 1;\n```\n```excalidraw\n{"type":"excalidraw"}';
  const parts = splitDiagramFences(md);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].kind, 'text');
  assert.equal(joinDiagramFences(parts), md);
});
