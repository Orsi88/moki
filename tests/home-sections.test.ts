import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resizedWeights, SECTION_MIN } from '../app/src/home-sections.ts';

test('dragging the divider gives the height to the section it moves toward', () => {
  const next = resizedWeights({ projects: 200, notes: 200 }, 'projects', 'notes', 200, 200, 40);
  assert.equal(next.projects, 240);
  assert.equal(next.notes, 160);
  assert.equal(resizedWeights({ projects: 200, notes: 200 }, 'projects', 'notes', 200, 200, -40).projects, 160);
});

test('a section cannot be dragged below its minimum', () => {
  const next = resizedWeights({ projects: 200, notes: 200 }, 'projects', 'notes', 200, 200, 1000);
  assert.equal(next.projects, 400 - SECTION_MIN);
  assert.equal(next.notes, SECTION_MIN);
});
