import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/repo.mjs';
import { flatten, iconFont } from '../scripts/lib/icon-font.mjs';

const svg = readFileSync(join(ROOT, 'ide', 'vscode', 'resources', 'moki-activitybar.svg'), 'utf8');

// Reads a WOFF 1.0 (uncompressed tables) into { tag: Buffer }.
function tables(woff) {
  assert.equal(woff.toString('latin1', 0, 4), 'wOFF');
  assert.equal(woff.readUInt32BE(8), woff.length, 'the header gives the real length');
  const out = {};
  for (let k = 0; k < woff.readUInt16BE(12); k++) {
    const o = 44 + 20 * k;
    const [offset, comp, orig] = [woff.readUInt32BE(o + 4), woff.readUInt32BE(o + 8), woff.readUInt32BE(o + 12)];
    assert.equal(comp, orig);
    out[woff.toString('latin1', o, o + 4)] = woff.subarray(offset, offset + orig);
  }
  return out;
}

test('the status bar cat: one glyph at U+E000, in the codicon metrics', () => {
  const t = tables(iconFont(svg));
  assert.deepEqual(Object.keys(t).sort(), ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']);
  assert.equal(t.head.readUInt16BE(18), 300, 'units per em, as VS Code\'s codicons');
  assert.equal(t.head.readUInt32BE(12), 0x5f0f3cf5);
  assert.equal(t.maxp.readUInt16BE(4), 2, '.notdef and the cat');
  const sub = t.cmap.subarray(12);
  assert.equal(sub.readUInt16BE(0), 4);
  assert.equal(sub.readUInt16BE(14), 0xe000, 'mapped at U+E000 (fontCharacter \\E000)');
  const contours = t.glyf.readInt16BE(0);
  assert.ok(contours > 20, `the strokes became filled shapes (${contours} contours)`);
  const [xMin, yMin, xMax, yMax] = [2, 4, 6, 8].map((o) => t.glyf.readInt16BE(o));
  assert.ok(xMin >= 0 && yMin >= 0 && xMax <= 300 && yMax <= 300, 'inside the em');
});

test('path flattening: lines, curves and arcs end where the SVG does', () => {
  const [line] = flatten('M2 3h4v5');
  assert.deepEqual(line.points, [[2, 3], [6, 3], [6, 8]]);
  const [curve] = flatten('M0 0c0 4 4 4 4 0');
  assert.deepEqual(curve.points.at(-1), [4, 0]);
  const [arc] = flatten('M0 0a2 2 0 0 1 4 0Z');
  const end = arc.points.at(-1);
  assert.ok(Math.abs(end[0] - 4) < 1e-9 && Math.abs(end[1]) < 1e-9);
  assert.ok(arc.points.some(([, y]) => y < -1.9), 'the arc bulges to its radius');
  assert.equal(arc.closed, true);
});
