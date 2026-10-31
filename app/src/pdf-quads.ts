// A text selection on the drawn PDF pages as PdfCraft quads: points from the top-left of
// the displayed page, pages 1-based. Each page's scale comes from its drawn width. A range
// also reports the boxes of whole elements it covers (a text run twice, or a page's whole text
// layer): repeated boxes and boxes taller than a quarter of the page are left out. Pure.

export interface Box { left: number; top: number; right: number; bottom: number }
export interface DrawnPage { page: number; box: Box; widthPt: number }

export function selectionMarks(rects: Box[], pages: DrawnPage[]): { page: number; quads: number[][] }[] {
  const out = new Map<number, number[][]>();
  const seen = new Set<string>();
  for (const r of rects) {
    if (r.right - r.left < 1 || r.bottom - r.top < 1) continue;
    const p = pages.find(({ box }) => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top);
    if (!p || r.bottom - r.top > (p.box.bottom - p.box.top) / 4) continue;
    const key = [r.left, r.top, r.right, r.bottom].map(Math.round).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const s = (p.box.right - p.box.left) / p.widthPt;
    const pt = (v: number) => Math.round((v / s) * 100) / 100;
    const x0 = pt(Math.max(r.left, p.box.left) - p.box.left), x1 = pt(Math.min(r.right, p.box.right) - p.box.left);
    const y0 = pt(Math.max(r.top, p.box.top) - p.box.top), y1 = pt(Math.min(r.bottom, p.box.bottom) - p.box.top);
    out.set(p.page, [...(out.get(p.page) ?? []), [x0, y0, x1, y0, x0, y1, x1, y1]]);
  }
  return [...out].map(([page, quads]) => ({ page, quads }));
}
