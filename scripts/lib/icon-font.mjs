// Turns a stroked 24×24 SVG icon (like ide/vscode/resources/moki-activitybar.svg) into a
// one-glyph icon font (WOFF), the only way VS Code shows an extension's own icon in the
// status bar ($(id) through contributes.icons). No dependencies: the paths are flattened,
// each stroke becomes filled shapes (a quad per segment and a disc per point, which the
// nonzero rule unites into round-joined lines), and the font tables are written by hand.
// Metrics follow VS Code's codicon font: 300 units per em, the icon filling the em.
// Usage: iconFont(svgText, { codepoint: 0xE000, name: 'moki-icons' }) → Buffer

const EM = 300;
const VIEW = 24;
const SCALE = EM / VIEW;

// ---------------------------------------------------------------- SVG paths → polylines

function tokens(d) {
  return [...d.matchAll(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)].map((m) => m[0]);
}

// Flattens one path's d attribute into subpaths of points (curves sampled, arcs converted).
export function flatten(d, steps = 12) {
  const t = tokens(d);
  const out = [];
  let i = 0; let cmd = ''; let x = 0; let y = 0; let sx = 0; let sy = 0; let lcx = 0; let lcy = 0; let cur = null;
  const num = () => Number(t[i++]);
  const start = (px, py) => { cur = { points: [[px, py]], closed: false }; out.push(cur); sx = px; sy = py; };
  const to = (px, py) => { if (!cur) start(x, y); cur.points.push([px, py]); };
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    for (let k = 1; k <= steps; k++) {
      const s = k / steps; const u = 1 - s;
      to(u * u * u * x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3, u * u * u * y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3);
    }
    lcx = x2; lcy = y2; x = x3; y = y3;
  };
  const arc = (rx, ry, rot, large, sweep, x2, y2) => {
    // SVG arc endpoint parameterization → center parameterization (SVG 1.1, F.6.5).
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) { to(x2, y2); x = x2; y = y2; return; }
    const phi = (rot * Math.PI) / 180; const cos = Math.cos(phi); const sin = Math.sin(phi);
    const dx = (x - x2) / 2; const dy = (y - y2) / 2;
    const x1p = cos * dx + sin * dy; const y1p = -sin * dx + cos * dy;
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
    const cxp = coef * ((rx * y1p) / ry); const cyp = coef * (-(ry * x1p) / rx);
    const cx = cos * cxp - sin * cyp + (x + x2) / 2; const cy = sin * cxp + cos * cyp + (y + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dth > 0) dth -= 2 * Math.PI; else if (sweep && dth < 0) dth += 2 * Math.PI;
    const n = Math.max(4, Math.ceil((Math.abs(dth) / (Math.PI / 2)) * steps));
    for (let k = 1; k <= n; k++) {
      const a = th1 + (dth * k) / n;
      to(cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos);
    }
    x = x2; y = y2;
  };
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0; const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': { x = ox + num(); y = oy + num(); start(x, y); cmd = rel ? 'l' : 'L'; break; }
      case 'L': { x = ox + num(); y = oy + num(); to(x, y); break; }
      case 'H': { x = (rel ? x : 0) + num(); to(x, y); break; }
      case 'V': { y = (rel ? y : 0) + num(); to(x, y); break; }
      case 'C': { const a = [num(), num(), num(), num(), num(), num()]; cubic(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]); break; }
      case 'S': {
        const a = [num(), num(), num(), num()];
        cubic(2 * x - lcx, 2 * y - lcy, ox + a[0], oy + a[1], ox + a[2], oy + a[3]); break;
      }
      case 'Q': {
        const a = [num(), num(), num(), num()];
        const qx = ox + a[0]; const qy = oy + a[1];
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ox + a[2] + (2 / 3) * (qx - ox - a[2]), oy + a[3] + (2 / 3) * (qy - oy - a[3]), ox + a[2], oy + a[3]); break;
      }
      case 'A': { const a = [num(), num(), num(), num(), num(), num(), num()]; arc(a[0], a[1], a[2], a[3], a[4], ox + a[5], oy + a[6]); break; }
      case 'Z': { if (cur) { cur.closed = true; x = sx; y = sy; } cur = null; break; }
      default: i++; // an unsupported command: skip its token
    }
    if (!/[CcSs]/.test(cmd)) { lcx = x; lcy = y; }
  }
  return out;
}

// ---------------------------------------------------------------- strokes → filled contours

const signedArea = (c) => c.reduce((a, [x1, y1], k) => { const [x2, y2] = c[(k + 1) % c.length]; return a + (x1 * y2 - x2 * y1); }, 0) / 2;
// TrueType outer contours run clockwise (y up); all shapes the same way, so the nonzero rule unites them.
const clockwise = (c) => (signedArea(c) > 0 ? [...c].reverse() : c);

export function strokeContours(subpaths, width) {
  const r = width / 2;
  const contours = [];
  const disc = ([cx, cy]) => Array.from({ length: 16 }, (_, k) => [cx + r * Math.cos((k * Math.PI) / 8), cy + r * Math.sin((k * Math.PI) / 8)]);
  for (const { points, closed } of subpaths) {
    const pts = closed ? [...points, points[0]] : points;
    for (const p of pts) contours.push(disc(p));
    for (let k = 1; k < pts.length; k++) {
      const [x1, y1] = pts[k - 1]; const [x2, y2] = pts[k];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1e-6) continue;
      const nx = (-(y2 - y1) / len) * r; const ny = ((x2 - x1) / len) * r;
      contours.push([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]);
    }
  }
  return contours;
}

// The <path d> of an icon SVG and its stroke width.
export function svgPaths(svg) {
  const width = Number(svg.match(/stroke-width="([\d.]+)"/)?.[1] ?? 1.5);
  return { width, paths: [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"[^>]*>/g)].map((m) => ({ d: m[1], filled: /fill="currentColor"/.test(m[0]) })) };
}

// ---------------------------------------------------------------- font tables

class Writer {
  constructor() { this.parts = []; }
  u8(v) { this.parts.push(Buffer.from([v & 0xff])); return this; }
  u16(v) { const b = Buffer.alloc(2); b.writeUInt16BE(v & 0xffff); this.parts.push(b); return this; }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v); this.parts.push(b); return this; }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); this.parts.push(b); return this; }
  bytes(b) { this.parts.push(Buffer.from(b)); return this; }
  done() { return Buffer.concat(this.parts); }
}
const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
const checksum = (b) => { const p = pad4(b); let s = 0; for (let k = 0; k < p.length; k += 4) s = (s + p.readUInt32BE(k)) >>> 0; return s; };

function glyph(contours) {
  const pts = contours.flat();
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const w = new Writer().i16(contours.length).i16(Math.min(...xs)).i16(Math.min(...ys)).i16(Math.max(...xs)).i16(Math.max(...ys));
  let end = -1;
  for (const c of contours) { end += c.length; w.u16(end); }
  w.u16(0); // no instructions
  for (let k = 0; k < pts.length; k++) w.u8(0x01); // on-curve, int16 deltas
  let px = 0; for (const [x] of pts) { w.i16(x - px); px = x; }
  let py = 0; for (const [, y] of pts) { w.i16(y - py); py = y; }
  return { data: w.done(), xMin: Math.min(...xs), yMin: Math.min(...ys), xMax: Math.max(...xs), yMax: Math.max(...ys), points: pts.length, contours: contours.length };
}

function nameTable(name) {
  const records = [[1, name], [2, 'Regular'], [3, `${name}-1`], [4, name], [5, 'Version 1.0'], [6, name]];
  const strings = records.map(([, s]) => Buffer.from(s, 'utf16le').swap16());
  const w = new Writer().u16(0).u16(records.length).u16(6 + 12 * records.length);
  let offset = 0;
  records.forEach(([id], k) => { w.u16(3).u16(1).u16(0x409).u16(id).u16(strings[k].length).u16(offset); offset += strings[k].length; });
  for (const s of strings) w.bytes(s);
  return w.done();
}

export function iconFont(svg, { codepoint = 0xe000, name = 'moki-icons' } = {}) {
  const { width, paths } = svgPaths(svg);
  const toFont = ([x, y]) => [Math.round(x * SCALE), Math.round((VIEW - y) * SCALE)];
  const contours = [];
  for (const p of paths) {
    const subpaths = flatten(p.d);
    if (p.filled) for (const s of subpaths) contours.push(s.points);
    contours.push(...strokeContours(subpaths, width));
  }
  const g = glyph(contours.map((c) => clockwise(c.map(toFont))));
  const glyf = pad4(g.data);
  const tables = {
    'OS/2': new Writer().u16(4).i16(EM).u16(400).u16(5).u16(0)
      .i16(EM / 2).i16(EM / 2).i16(0).i16(EM / 4).i16(EM / 2).i16(EM / 2).i16(0).i16(EM / 2).i16(EM / 20).i16(EM / 4)
      .i16(0).bytes(Buffer.alloc(10)).u32(0).u32(0).u32(0).u32(0).bytes(Buffer.from('MOKI', 'latin1'))
      .u16(0x40).u16(codepoint).u16(codepoint).i16(EM).i16(0).i16(0).u16(EM).u16(0).u32(1).u32(0).i16(0).i16(0).u16(0).u16(32).u16(1).done(),
    cmap: new Writer().u16(0).u16(1).u16(3).u16(1).u32(12)
      .u16(4).u16(32).u16(0).u16(4).u16(4).u16(1).u16(0)
      .u16(codepoint).u16(0xffff).u16(0).u16(codepoint).u16(0xffff).u16((1 - codepoint) & 0xffff).u16(1).u16(0).u16(0).done(),
    glyf,
    head: new Writer().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(EM)
      .u32(0).u32(0).u32(0).u32(0).i16(g.xMin).i16(g.yMin).i16(g.xMax).i16(g.yMax).u16(0).u16(8).i16(2).i16(1).i16(0).done(),
    hhea: new Writer().u32(0x00010000).i16(EM).i16(0).i16(0).u16(EM).i16(0).i16(0).i16(g.xMax).i16(1).i16(0).i16(0)
      .i16(0).i16(0).i16(0).i16(0).i16(0).u16(2).done(),
    hmtx: new Writer().u16(EM).i16(0).u16(EM).i16(g.xMin).done(),
    loca: new Writer().u32(0).u32(0).u32(glyf.length).done(),
    maxp: new Writer().u32(0x00010000).u16(2).u16(g.points).u16(g.contours).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).done(),
    name: nameTable(name),
    post: new Writer().u32(0x00030000).u32(0).i16(-EM / 10).i16(EM / 20).u32(0).u32(0).u32(0).u32(0).u32(0).done(),
  };
  const tags = Object.keys(tables).sort();
  // The sfnt checksum adjustment, as head must carry it.
  const sfntDir = 12 + 16 * tags.length;
  let sfntSum = 0;
  {
    const n = tags.length; const pow = 2 ** Math.floor(Math.log2(n));
    const header = new Writer().u32(0x00010000).u16(n).u16(pow * 16).u16(Math.log2(pow)).u16(n * 16 - pow * 16);
    let offset = sfntDir;
    for (const tag of tags) { header.bytes(Buffer.from(tag, 'latin1')).u32(checksum(tables[tag])).u32(offset).u32(tables[tag].length); offset += pad4(tables[tag]).length; }
    sfntSum = checksum(Buffer.concat([header.done(), ...tags.map((tag) => pad4(tables[tag]))]));
  }
  tables.head.writeUInt32BE((0xb1b0afba - sfntSum) >>> 0, 8);
  // WOFF 1.0, tables stored uncompressed.
  const woffDir = 44 + 20 * tags.length;
  let offset = woffDir;
  const dir = new Writer();
  for (const tag of tags) {
    dir.bytes(Buffer.from(tag, 'latin1')).u32(offset).u32(tables[tag].length).u32(tables[tag].length).u32(checksum(tables[tag]));
    offset += pad4(tables[tag]).length;
  }
  const totalSfnt = sfntDir + tags.reduce((s, tag) => s + pad4(tables[tag]).length, 0);
  const header = new Writer().u32(0x774f4646).u32(0x00010000).u32(offset).u16(tags.length).u16(0).u32(totalSfnt)
    .u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0).done();
  return Buffer.concat([header, dir.done(), ...tags.map((tag) => pad4(tables[tag]))]);
}
