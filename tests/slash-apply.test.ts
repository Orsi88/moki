import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXCALIDRAW_STARTER, MERMAID_STARTER } from '../app/src/diagram-source.ts';
import { applySlash } from '../app/src/slash-apply.ts';

const phrases = { link: 'link', cols: ['Column 1', 'Column 2', 'Column 3'] as [string, string, string] };

test('a slash command replaces only the typed slash', () => {
  assert.equal(applySlash('Hello /', 6, 7, 'h1', phrases), '# Hello ');
  assert.equal(applySlash('/', 0, 1, 'list', phrases), '- ');
  assert.match(applySlash('/', 0, 1, 'diagram', phrases), new RegExp(`^\`\`\`mermaid\\n${MERMAID_STARTER}\\n\`\`\`\\n$`));
  assert.match(applySlash('/', 0, 1, 'drawing', phrases), new RegExp(`^\`\`\`excalidraw\\n${EXCALIDRAW_STARTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\`\`\`\\n$`));
  assert.equal(applySlash('Hello /', 6, 7, 'nope', phrases), 'Hello /');
});
