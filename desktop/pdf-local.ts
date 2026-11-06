// PDF comments and page edits without PdfCraft: the same steps pdfScript writes for it
// (desktop/pdfcraft.ts), run by Moki itself. pdf.js reads (the comments already there, the
// text of a page for "highlight by search", and each page's displayed coordinates, so a rect
// or a quad means the same as for PdfCraft: points from the top-left of the page as displayed);
// pdf-lib writes (highlights with their appearance, so every viewer draws them; replies as
// notes in reply to their comment; rotate, move, insert, delete pages; title and author).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, degrees } from 'pdf-lib';
import { getDocument, type PDFPageProxy, type PageViewport } from './pdfjs.ts';
import type { PdfRunner, PdfStep } from './pdfcraft.ts';

const COLORS: Record<string, [number, number, number]> = {
  yellow: [1, 0.85, 0.04], green: [0.27, 0.77, 0.42], blue: [0.29, 0.56, 0.94], pink: [0.94, 0.42, 0.69],
  orange: [0.96, 0.61, 0.16], red: [0.9, 0.28, 0.3], purple: [0.61, 0.42, 0.94],
};
const SHOWN = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Text', 'FreeText', 'Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Ink', 'Stamp', 'Caret', 'FileAttachment']);
const round = (v: number) => Math.round(v * 100) / 100;

// A rectangle of PDF user space on the displayed page: [x0, y0, x1, y1], top-left origin.
const viewRect = (v: PageViewport, r: number[]): number[] => {
  const [ax, ay] = v.convertToViewportPoint(r[0], r[1]) as number[];
  const [bx, by] = v.convertToViewportPoint(r[2], r[3]) as number[];
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
};

interface Comment { id: string; page: number; index: number; type: string; author: string | null; contents: string | null; color: string | null; rect: number[]; replies: Comment[] }

class Open {
  readonly file: string;
  readonly doc: PDFDocument;
  constructor(file: string, doc: PDFDocument) { this.file = file; this.doc = doc; }
  private views: Map<number, PDFPageProxy> | null = null;
  private reader: Promise<{ getPage: (n: number) => Promise<PDFPageProxy> }> | null = null;

  // pdf.js on the bytes as they are now (after page edits, read again).
  private async page(n: number): Promise<PDFPageProxy> {
    if (!this.reader) this.reader = getDocument({ data: new Uint8Array(await this.doc.save()), useSystemFonts: false, verbosity: 0 }).promise;
    this.views ??= new Map();
    const hit = this.views.get(n);
    if (hit) return hit;
    const p = await (await this.reader).getPage(n);
    this.views.set(n, p);
    return p;
  }
  changedPages(): void { this.reader = null; this.views = null; }

  // A point of the displayed page (top-left origin, rotation applied) in PDF user space, and back.
  async toUser(n: number, x: number, y: number): Promise<[number, number]> {
    const v = (await this.page(n)).getViewport({ scale: 1 });
    const [ux, uy] = v.convertToPdfPoint(x, y) as number[];
    return [ux, uy];
  }
  async toView(n: number, r: number[]): Promise<number[]> {
    const v = (await this.page(n)).getViewport({ scale: 1 });
    return viewRect(v, r).map(round);
  }

  // Quads (view coordinates) of a piece of text on a page: each text run that contains it, cut in proportion.
  async find(n: number, text: string, all: boolean): Promise<number[][]> {
    const page = await this.page(n);
    const v = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const want = text.toLowerCase();
    const quads: number[][] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const hay = item.str.toLowerCase();
      for (let at = hay.indexOf(want); at >= 0; at = hay.indexOf(want, at + want.length)) {
        const [, , c, d, e, f] = item.transform as number[];
        const size = Math.hypot(c, d) || item.height || 10;
        const per = item.width / Math.max(item.str.length, 1);
        const ux0 = e + per * at;
        const ux1 = ux0 + per * want.length;
        const [l, t, r, b] = viewRect(v, [ux0, f - size * 0.22, ux1, f + size * 0.88]);
        quads.push([l, t, r, t, l, b, r, b].map(round));
        if (!all) return quads;
      }
    }
    return quads;
  }
}

const str = (d: PDFDict, key: string): string | null => {
  const v = d.lookup(PDFName.of(key));
  return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : null;
};
const hex = (d: PDFDict): string | null => {
  const c = d.lookup(PDFName.of('C'));
  if (!(c instanceof PDFArray) || c.size() !== 3) return null;
  return `#${[0, 1, 2].map((i) => Math.round(((c.lookup(i) as PDFNumber).asNumber()) * 255).toString(16).padStart(2, '0')).join('')}`;
};
const nums = (d: PDFDict, key: string): number[] => {
  const a = d.lookup(PDFName.of(key));
  return a instanceof PDFArray ? a.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : 0)) : [];
};

// Every annotation of the document with what lists and finds it: page, index, its dictionary and ref.
function annotations(doc: PDFDocument): { page: number; index: number; dict: PDFDict; ref: PDFRef | null; id: string }[] {
  const out: { page: number; index: number; dict: PDFDict; ref: PDFRef | null; id: string }[] = [];
  doc.getPages().forEach((p, pi) => {
    const annots = p.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const dict = annots.lookup(i);
      if (!(dict instanceof PDFDict)) continue;
      out.push({ page: pi + 1, index: i + 1, dict, ref: raw instanceof PDFRef ? raw : null, id: str(dict, 'NM') ?? `p${pi + 1}-${i + 1}` });
    }
  });
  return out;
}

async function list(o: Open): Promise<{ count: number; comments: Comment[] }> {
  const all = annotations(o.doc).filter((a) => SHOWN.has(a.dict.lookup(PDFName.of('Subtype'))?.toString().slice(1) ?? ''));
  const byRef = new Map(all.filter((a) => a.ref).map((a) => [a.ref!.toString(), a]));
  const made = new Map<string, Comment>();
  for (const a of all) {
    made.set(a.id, {
      id: a.id, page: a.page, index: a.index, type: a.dict.lookup(PDFName.of('Subtype'))?.toString().slice(1) ?? '',
      author: str(a.dict, 'T'), contents: str(a.dict, 'Contents'), color: hex(a.dict), rect: await o.toView(a.page, nums(a.dict, 'Rect')), replies: [],
    });
  }
  const roots: Comment[] = [];
  for (const a of all) {
    const irt = a.dict.get(PDFName.of('IRT'));
    const parent = irt instanceof PDFRef ? byRef.get(irt.toString()) : undefined;
    const c = made.get(a.id)!;
    if (parent && parent !== a) made.get(parent.id)?.replies.push(c); else roots.push(c);
  }
  return { count: roots.length, comments: roots };
}

const find = (o: Open, id: unknown) => {
  const hits = annotations(o.doc).filter((a) => a.id === id);
  if (hits.length !== 1) throw new Error(hits.length ? 'Several comments share this id.' : 'Comment not found.');
  return hits[0];
};

// A highlight: its quads, a rect around them and an appearance (multiplied colour) every viewer can draw.
async function highlight(o: Open, a: Record<string, unknown>, id: string): Promise<void> {
  const n = Number(a.page);
  const pages = o.doc.getPages();
  if (!Number.isInteger(n) || n < 1 || n > pages.length) throw new Error('Invalid page.');
  const viewQuads = Array.isArray(a.quads) ? a.quads as number[][] : await o.find(n, String(a.find ?? ''), Boolean(a.all));
  if (!viewQuads.length) throw new Error(`"${String(a.find ?? '')}" was not found on page ${n}.`);
  const quads: number[][] = [];
  for (const q of viewQuads) {
    const pts: number[] = [];
    for (let i = 0; i < 8; i += 2) pts.push(...(await o.toUser(n, q[i], q[i + 1])));
    quads.push(pts);
  }
  const xs = quads.flatMap((q) => [q[0], q[2], q[4], q[6]]);
  const ys = quads.flatMap((q) => [q[1], q[3], q[5], q[7]]);
  const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(round);
  const rgb = COLORS[String(a.color)] ?? COLORS.yellow;
  const ctx = o.doc.context;
  const path = quads.map((q) => `${q[4] - rect[0]} ${q[5] - rect[1]} m ${q[6] - rect[0]} ${q[7] - rect[1]} l ${q[2] - rect[0]} ${q[3] - rect[1]} l ${q[0] - rect[0]} ${q[1] - rect[1]} l h`).join(' ');
  const gs = ctx.obj({ Type: 'ExtGState', BM: 'Multiply', ca: 1 });
  const ap = ctx.stream(`/GS0 gs ${rgb.join(' ')} rg ${path} f`, {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, rect[2] - rect[0], rect[3] - rect[1]], Resources: { ExtGState: { GS0: gs } },
  });
  const annot = ctx.obj({
    Type: 'Annot', Subtype: 'Highlight', Rect: rect, QuadPoints: quads.flat().map(round), C: rgb, F: 4,
    NM: PDFString.of(id), T: PDFHexString.fromText(String(a.author ?? '')), M: PDFString.fromDate(new Date()),
    ...(typeof a.contents === 'string' && a.contents ? { Contents: PDFHexString.fromText(a.contents) } : {}),
    AP: { N: ctx.register(ap) },
  });
  pages[n - 1].node.addAnnot(ctx.register(annot));
}

async function run(steps: PdfStep[], root: string): Promise<unknown[]> {
  let o: Open | null = null;
  let next = Date.now();
  const id = () => `moki-${(next++).toString(36)}`;
  const out: unknown[] = [];
  for (const { tool, args: a } of steps) {
    if (tool === 'doc_open') {
      const file = isAbsolute(String(a.path)) ? String(a.path) : join(root, String(a.path));
      if (!existsSync(file)) throw new Error('PDF not found.');
      const bytes = readFileSync(file);
      let doc: PDFDocument;
      try { doc = await PDFDocument.load(bytes, { updateMetadata: false }); } catch (e) {
        throw new Error(/encrypt/i.test(String(e)) ? 'This PDF is protected: Moki cannot change it without PdfCraft.' : 'Moki could not read this PDF.');
      }
      o = new Open(file, doc);
      out.push({ doc: 1 });
      continue;
    }
    if (!o) throw new Error('No PDF open.');
    const pages = o.doc.getPages();
    switch (tool) {
      case 'comment_add': await highlight(o, a, id()); break;
      case 'comment_reply': {
        const parent = find(o, a.id);
        if (!parent.ref) throw new Error('This comment cannot take replies.');
        const ctx = o.doc.context;
        const note = ctx.obj({
          Type: 'Annot', Subtype: 'Text', Rect: nums(parent.dict, 'Rect'), F: 32, IRT: parent.ref, RT: 'R', Open: false, Name: 'Comment',
          NM: PDFString.of(id()), T: PDFHexString.fromText(String(a.author ?? '')), M: PDFString.fromDate(new Date()), Contents: PDFHexString.fromText(String(a.text ?? '')),
        });
        pages[parent.page - 1].node.addAnnot(ctx.register(note));
        break;
      }
      case 'comment_edit': find(o, a.id).dict.set(PDFName.of('Contents'), PDFHexString.fromText(String(a.contents ?? ''))); break;
      case 'comment_delete': {
        const target = find(o, a.id);
        // The comment and its replies (notes "in reply to" it).
        const gone = annotations(o.doc).filter((x) => x.id === target.id || (target.ref && x.dict.get(PDFName.of('IRT'))?.toString() === target.ref.toString()));
        for (const p of pages) {
          const annots = p.node.Annots();
          if (!annots) continue;
          for (let i = annots.size() - 1; i >= 0; i--) if (gone.some((g) => g.dict === annots.lookup(i))) annots.remove(i);
        }
        break;
      }
      case 'page_rotate':
        for (const n of a.pages as number[]) { const p = pages[n - 1]; if (!p) throw new Error('Invalid page.'); p.setRotation(degrees((p.getRotation().angle + Number(a.degrees)) % 360)); }
        o.changedPages();
        break;
      case 'page_delete':
        for (const n of [...(a.pages as number[])].sort((x, y) => y - x)) { if (!pages[n - 1]) throw new Error('Invalid page.'); o.doc.removePage(n - 1); }
        o.changedPages();
        break;
      case 'page_move': {
        const from = (a.pages as number[])[0] - 1;
        const to = Number(a.to) - 1;
        if (!pages[from] || to < 0 || to >= pages.length) throw new Error('Invalid page.');
        const [copy] = await o.doc.copyPages(o.doc, [from]);
        o.doc.removePage(from);
        o.doc.insertPage(to, copy);
        o.changedPages();
        break;
      }
      case 'page_insert_blank': {
        const at = Number(a.at) - 1;
        if (at < 0 || at > pages.length) throw new Error('Invalid page.');
        const near = pages[Math.max(0, at - 1)];
        o.doc.insertPage(at, near ? [near.getWidth(), near.getHeight()] : undefined);
        o.changedPages();
        break;
      }
      case 'doc_set_info':
        if (a.key === 'Title') o.doc.setTitle(String(a.value ?? ''));
        else if (a.key === 'Author') o.doc.setAuthor(String(a.value ?? ''));
        break;
      case 'doc_save': {
        const target = typeof a.path === 'string' ? (isAbsolute(a.path) ? a.path : join(root, a.path)) : o.file;
        writeFileSync(target, await o.doc.save());
        break;
      }
      case 'comment_list': out.push(await list(o)); continue;
      default: throw new Error(`Moki cannot do "${tool}" without PdfCraft.`);
    }
    out.push({});
  }
  return out;
}

export const runPdfLocal: PdfRunner = (steps, root) => run(steps, root);
