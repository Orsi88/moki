import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { runPdfLocal } from '../desktop/pdf-local.ts';
import { pdfScript, toComments, type PdfChange } from '../desktop/pdfcraft.ts';

// A small PDF with one line of text per page (Helvetica 18pt at 72, 700), its xref offsets computed.
function smallPdf(lines: string[]): Buffer {
  const objs: string[] = [];
  const pageIds = lines.map((_, i) => 3 + i * 2);
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${lines.length} >>`);
  const font = 3 + lines.length * 2;
  lines.forEach((line, i) => {
    const stream = `BT /F1 18 Tf 72 700 Td (${line}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('without PdfCraft, Moki highlights, comments, replies, edits and deletes in the PDF itself', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moki-pdf-local-'));
  try {
    writeFileSync(join(dir, 'doc.pdf'), smallPdf(['Requisito de login', 'Segunda pagina']));
    const apply = async (change: PdfChange | null, saveAs?: string) => toComments((await runPdfLocal(pdfScript('doc.pdf', change, 'ana', saveAs), dir)).at(-1));

    assert.deepEqual(await apply(null), []);
    // A selection: one quad in points from the top-left of the page (the line is 92pt from the top).
    let list = await apply({ op: 'highlight', marks: [{ page: 1, quads: [[72, 76, 230, 76, 72, 96, 230, 96]] }], contents: 'Falta senha expirada', color: 'green' });
    assert.equal(list.length, 1);
    const [first] = list;
    assert.equal(first.type, 'Highlight');
    assert.equal(first.author, 'ana');
    assert.equal(first.contents, 'Falta senha expirada');
    assert.equal(first.color, '#45c46b');
    assert.deepEqual(first.rect, [72, 76, 230, 96]); // the same coordinates PdfCraft reports

    // By search: the word's place on the page, from its text.
    list = await apply({ op: 'highlight', page: 1, find: 'login', all: false, color: 'yellow' });
    assert.equal(list.length, 2);
    const found = list[1].rect ?? [];
    assert.ok(found[0] > 150 && found[2] < 260 && found[1] > 70 && found[3] < 100, JSON.stringify(found));
    await assert.rejects(apply({ op: 'highlight', page: 2, find: 'login', all: false, color: 'yellow' }), /was not found on page 2/);

    list = await apply({ op: 'reply', id: first.id, text: 'Vou incluir' });
    assert.deepEqual(list[0].replies.map((r) => [r.author, r.contents]), [['ana', 'Vou incluir']]);
    list = await apply({ op: 'edit', id: first.id, contents: 'Falta o caso de senha expirada' });
    assert.equal(list[0].contents, 'Falta o caso de senha expirada');
    const second = list[1].id;
    list = await apply({ op: 'delete', id: first.id });
    assert.deepEqual(list.map((c) => c.id), [second]); // the comment and its reply are gone

    // Page edits go to the copy; the highlight keeps its appearance (every viewer draws it).
    await apply({ op: 'rotate-pages', pages: [2], degrees: 90 }, 'doc-edited.pdf');
    await runPdfLocal(pdfScript('doc-edited.pdf', { op: 'insert-blank', at: 3 }, 'ana'), dir);
    await runPdfLocal(pdfScript('doc-edited.pdf', { op: 'move-page', page: 3, to: 1 }, 'ana'), dir);
    await runPdfLocal(pdfScript('doc-edited.pdf', { op: 'set-info', title: 'Revisão', author: 'Ana' }, 'ana'), dir);
    const edited = await PDFDocument.load(readFileSync(join(dir, 'doc-edited.pdf')));
    assert.equal(edited.getPageCount(), 3);
    assert.equal(edited.getPage(2).getRotation().angle, 90);
    assert.equal(edited.getTitle(), 'Revisão');
    const saved = (await PDFDocument.load(readFileSync(join(dir, 'doc.pdf')))).getPage(0).node.Annots();
    const mark = saved?.lookup(0, PDFDict);
    assert.equal(mark?.lookup(PDFName.of('Subtype'))?.toString(), '/Highlight');
    assert.ok(mark?.lookup(PDFName.of('AP')), 'it carries its appearance');
    await runPdfLocal(pdfScript('doc-edited.pdf', { op: 'delete-pages', pages: [1] }, 'ana'), dir);
    assert.equal((await PDFDocument.load(readFileSync(join(dir, 'doc-edited.pdf')))).getPageCount(), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
