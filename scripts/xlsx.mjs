// Writes and reads .xlsx deliverables from a layout (sheets, columns, widths,
// allowed values) so every AI tool produces the same file. No dependencies.
//
// Usage:
//   node scripts/xlsx.mjs write --layout <layout.json> --data <data.json> --out <file.xlsx> [--lang en|pt-BR] [--style <document-style.json>]  (default en)
//   The project's document style (scripts/lib/doc-style.mjs) sets the font, the header row colours
//   and the printed header and footer. Excel has no real watermark or page colour.
//   node scripts/xlsx.mjs read <file.xlsx> --layout <layout.json> [--out <data.json>]
//   node scripts/xlsx.mjs fill --template <model.xlsx> --data <rows.json> --out <file.xlsx> [--sheet <name>]
//   node scripts/xlsx.mjs inspect <file.xlsx>      (first rows of every sheet, to read a model's headers)
//
// data.json: { "<sheetKey>": [ { "<columnKey>": "value", ... }, ... ], ... }

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zip, unzip } from './lib/zip.mjs';
import { parseArgs } from './lib/repo.mjs';
import { BUILTIN_FORMATS, formatNumber } from './lib/numfmt.mjs';
import { DEFAULT_STYLE, fillVars, hasFooter, hasHeader, styleFor } from './lib/doc-style.mjs';

const esc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

export function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function colIndex(letters) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

const label = (obj, lang) => obj[lang] ?? obj.en ?? Object.values(obj)[0];

// Printed header/footer codes: &L &C &R zones, &P page, &N pages; a literal & is &&.
const hfZone = (value, vars) => fillVars(value, vars).replace(/&/g, '&&').replace(/\{page\}/g, '&P').replace(/\{pages\}/g, '&N');
const headerFooter = (style, vars) => {
  const part = (z) => `&L${hfZone(z.left, vars)}&C${hfZone(z.center, vars)}&R${hfZone(z.right, vars)}`;
  const head = hasHeader(style) && (style.header.left || style.header.center || style.header.right) ? `<oddHeader>${esc(part(style.header))}</oddHeader>` : '';
  const foot = hasFooter(style) ? `<oddFooter>${esc(part(style.footer))}</oddFooter>` : '';
  return head || foot ? `<pageMargins left="0.5" right="0.5" top="0.9" bottom="0.8" header="0.3" footer="0.3"/><headerFooter>${head}${foot}</headerFooter>` : '';
};
const argb = (c) => `FF${c.replace('#', '').toUpperCase()}`;

export function buildXlsx(layout, data, lang = 'en', { style = DEFAULT_STYLE, vars = {} } = {}) {
  const files = [];
  const sheetEntries = layout.sheets.map((sheet, i) => {
    const rows = data[sheet.key] || [];
    const lastCol = colName(sheet.columns.length - 1);
    const lastRow = Math.max(rows.length + 1, 2);
    const cell = (c, r, value, style) => `<c r="${colName(c)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value ?? '')}</t></is></c>`;
    const header = `<row r="1">${sheet.columns.map((col, c) => cell(c, 1, label(col.label, lang), 1)).join('')}</row>`;
    const body = rows.map((row, r) => `<row r="${r + 2}">${sheet.columns.map((col, c) => cell(c, r + 2, row[col.key], 2)).join('')}</row>`).join('');
    const cols = sheet.columns.map((col, c) => `<col min="${c + 1}" max="${c + 1}" width="${col.width || 20}" customWidth="1"/>`).join('');
    const validations = sheet.columns
      .map((col, c) => ({ col, c, values: col.values && layout.enums?.[col.values]?.[lang] }))
      .filter((v) => v.values)
      .map(({ c, values }) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(c)}2:${colName(c)}1000"><formula1>"${esc(values.join(','))}"</formula1></dataValidation>`);
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + `<cols>${cols}</cols>`
      + `<sheetData>${header}${body}</sheetData>`
      + `<autoFilter ref="A1:${lastCol}${lastRow}"/>`
      + (validations.length ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : '')
      + headerFooter(style, { ...vars, title: vars.title || label(sheet.title, lang) })
      + '</worksheet>';
    files.push([`xl/worksheets/sheet${i + 1}.xml`, xml]);
    const title = label(sheet.title, lang).slice(0, 31);
    return { title, ref: `A1:${lastCol}${lastRow}`, i };
  });

  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + sheetEntries.map((s) => `<sheet name="${esc(s.title)}" sheetId="${s.i + 1}" r:id="rId${s.i + 1}"/>`).join('')
    + '</sheets><definedNames>'
    + sheetEntries.map((s) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${s.i}" hidden="1">'${esc(s.title.replace(/'/g, "''"))}'!$${s.ref.replace(':', ':$').replace(/([A-Z]+)(\d+)/g, '$1$$$2')}</definedName>`).join('')
    + '</definedNames></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheetEntries.map((s) => `<Relationship Id="rId${s.i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<fonts count="2"><font><sz val="${style.font.size === DEFAULT_STYLE.font.size ? 10 : style.font.size}"/><color rgb="${argb(style.font.color)}"/><name val="${esc(style.font.family)}"/></font><font><b/><sz val="${style.font.size === DEFAULT_STYLE.font.size ? 10 : style.font.size}"/><color rgb="${argb(style.table.headerText)}"/><name val="${esc(style.font.family)}"/></font></fonts>`
    + `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${argb(style.table.header)}"/><bgColor indexed="64"/></patternFill></fill></fills>`
    + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left', 'right', 'top', 'bottom'].map((side) => `<${side} style="thin"><color rgb="${argb(style.table.border)}"/></${side}>`).join('')}<diagonal/></border></borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheetEntries.map((s) => `<Override PartName="/xl/worksheets/sheet${s.i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '</Types>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

  return zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', workbookRels],
    ['xl/styles.xml', styles],
    ...files,
  ]);
}

// An empty workbook with one sheet, for "New › Spreadsheet" in the desktop app: no header row,
// no filter (buildXlsx always writes both, for deliverables).
export function blankXlsx(sheet = 'Sheet1') {
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org';
  return zip([
    ['[Content_Types].xml', `${head}<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', `${head}<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${head}<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${head}<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `${head}<worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData/></worksheet>`],
  ]);
}

// Element prefixes dropped (<x:row> becomes <row>): some .NET/Java tools write them.
const plain = (xml) => xml.replace(/<(\/?)[A-Za-z][\w.-]*:(?=[A-Za-z])/g, '<$1');
// Text of a string item: its <t> elements (not phonetic guides), with Excel's _xHHHH_ escapes decoded.
const itemText = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
  .map((t) => unesc(t[1])).join('').replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// Sheet names, part paths and visibility, in workbook order.
function sheetParts(files) {
  const text = (name) => (files.has(name) ? plain(files.get(name).toString('utf8')) : '');
  const rels = Object.fromEntries([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [m[0].match(/Id="([^"]+)"/)[1], m[0].match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, 'xl/')]));
  return [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => ({ name: unesc(m[0].match(/name="([^"]*)"/)[1]), path: rels[m[0].match(/r:id="([^"]+)"/)[1]], hidden: /state="(hidden|veryHidden)"/.test(m[0]) }));
}

// Every sheet of any .xlsx as a grid: rows[r][c], row 1 = rows[0]; number cells are numbers, the rest text.
// With display, number cells become { n: text } formatted as Excel/LibreOffice show them (dates, %, currency...),
// formulas without a saved result show the formula, and each sheet also has its merged areas, column widths,
// hidden rows/columns, cell alignment and whether it has images or charts.
// ponytail: cached values only (no recalculation, fonts or colors).
export function xlsxSheets(buf, { display = false, locale } = {}) {
  const files = unzip(buf);
  const text = (name) => (files.has(name) ? plain(files.get(name).toString('utf8')) : '');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => itemText(m[1]));
  const styles = text('xl/styles.xml');
  const custom = Object.fromEntries([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [m[0].match(/numFmtId="(\d+)"/)?.[1], unesc(m[0].match(/formatCode="([^"]*)"/)?.[1] ?? '')]));
  // Each cell style (s="<index>"): its number format and its alignment.
  const H = { left: 'left', center: 'center', centerContinuous: 'center', right: 'right', justify: 'justify', distributed: 'justify', fill: 'left' };
  const V = { top: 'top', center: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle' };
  const xfs = [...(styles.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? '').matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map((m) => {
    const id = m[1].match(/numFmtId="(\d+)"/)?.[1] ?? '0';
    const a = (m[2] ?? '').match(/<alignment\b[^>]*>/)?.[0] ?? '';
    const align = Object.fromEntries(Object.entries({ h: H[a.match(/horizontal="(\w+)"/)?.[1]], v: V[a.match(/vertical="(\w+)"/)?.[1]], wrap: /wrapText="(1|true)"/.test(a) }).filter(([, v]) => v));
    return { format: custom[id] ?? BUILTIN_FORMATS[id] ?? 'General', align: Object.keys(align).length ? align : undefined };
  });
  const date1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(text('xl/workbook.xml'));
  return sheetParts(files).map(({ name, path, hidden }) => {
    const xml = text(path);
    // Merged areas as [firstRow, firstCol, lastRow, lastCol], zero-based.
    const merges = [...xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map((m) => [Number(m[2]) - 1, colIndex(m[1]), Number(m[4]) - 1, colIndex(m[3])]);
    const mergeStarts = new Set(merges.map(([r, c]) => `${r}:${c}`));
    const rows = [];
    const hiddenRows = [];
    const align = {};
    let next = 0;
    for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number((row[1].match(/\br="(\d+)"/) || [])[1]);
      const at = r ? r - 1 : next;
      next = at + 1;
      if (/\bhidden="(1|true)"/.test(row[1])) hiddenRows.push(at);
      const cells = [];
      for (const c of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/r="([A-Z]+)\d+"/);
        const idx = ref ? colIndex(ref[1]) : cells.length;
        const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
        const inner = c[2] || '';
        const v = unesc((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? '');
        let value = v;
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = itemText(inner);
        else if (type === 'b' && v) value = v === '1' || v === 'true' ? 'TRUE' : 'FALSE';
        const formula = display && value === '' && (inner.match(/<f\b[^>]*>([\s\S]+?)<\/f>/) || [])[1];
        if (formula) value = `=${unesc(formula)}`;
        const style = xfs[Number((attrs.match(/\bs="(\d+)"/) || [])[1] ?? 0)];
        // Style-only cells (no content) are skipped: whole formatted columns would make a million empty rows.
        // An empty first cell of a merged area still gives the area its alignment.
        if (display && style?.align && (value !== '' || mergeStarts.has(`${at}:${idx}`))) align[`${at}:${idx}`] = style.align;
        if (value === '' && !inner.trim()) continue;
        const format = style?.format ?? 'General';
        if ((!type || type === 'n') && v !== '' && Number.isFinite(Number(v))) {
          value = display ? { n: formatNumber(Number(v), format, { locale, date1904 }) } : Number(v);
        } else if (type === 'd' && display && format !== 'General' && !Number.isNaN(Date.parse(v))) {
          value = { n: formatNumber(Date.parse(v.endsWith('Z') || v.length <= 10 ? v : `${v}Z`) / 86400000 + 25569 - (date1904 ? 1462 : 0), format, { locale, date1904 }) };
        }
        cells[idx] = value;
      }
      if (cells.length) rows[at] = Array.from(cells, (v) => v ?? '');
    }
    const grid = Array.from(rows, (cells) => cells ?? []);
    if (!display) return { name, hidden, rows: grid };
    // Column widths in pixels (Excel stores characters of about 7px) and hidden columns, for the used columns.
    // ponytail: the 7px character and 64px default are Calibri 11 values; other default fonts differ a little.
    const used = Math.max(grid.reduce((n, cells) => Math.max(n, cells.length), 0), ...merges.map((m) => m[3] + 1));
    const defaultWidth = Number(xml.match(/<sheetFormatPr\b[^>]*defaultColWidth="([\d.]+)"/)?.[1]);
    const cols = [...xml.matchAll(/<col\b[^>]*>/g)].map((m) => ({ min: Number(m[0].match(/min="(\d+)"/)?.[1]) - 1, max: Number(m[0].match(/max="(\d+)"/)?.[1]) - 1, width: Number(m[0].match(/width="([\d.]+)"/)?.[1]), hidden: /hidden="(1|true)"/.test(m[0]) }));
    const colOf = (c) => cols.find((col) => c >= col.min && c <= col.max);
    const widths = Array.from({ length: used }, (_, c) => (colOf(c)?.width > 0 ? Math.round(colOf(c).width * 7) : defaultWidth ? Math.round(defaultWidth * 7 + 5) : 64));
    const hiddenCols = Array.from({ length: used }, (_, c) => c).filter((c) => colOf(c)?.hidden);
    return { name, hidden, rows: grid, drawing: /<drawing\b/.test(xml), merges, widths, hiddenRows, hiddenCols, align };
  });
}

// Fills a user's own .xlsx model instead of building a new file, so its logo,
// colors, merges and other sheets stay as they are. rows: [{ "<header text>": "value" }].
// The header row is the one (in the first 50) that matches most keys; rows are
// written right below it with the styles of the model's first row under the header.
// ponytail: Excel tables (ListObjects), autofilter ranges and overwritten formulas are not adjusted; add when a model needs it.
export function fillXlsx(buf, rows, sheetName) {
  const files = unzip(buf);
  const parts = sheetParts(files);
  const index = sheetName ? parts.findIndex((p) => p.name === sheetName) : 0;
  if (index < 0) throw new Error(`sheet "${sheetName}" not found (sheets: ${parts.map((p) => p.name).join(', ')})`);
  const grid = xlsxSheets(buf)[index].rows;
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  let headerRow = -1;
  let best = 0;
  grid.slice(0, 50).forEach((cells, r) => {
    const hits = keys.filter((k) => cells.some((c) => norm(c) === norm(k))).length;
    if (hits > best) { best = hits; headerRow = r + 1; }
  });
  if (headerRow < 0) throw new Error('no row of the model matches the column names in the data');
  const colOf = Object.fromEntries(keys.map((k) => [k, grid[headerRow - 1].findIndex((c) => norm(c) === norm(k))]));
  const warnings = keys.filter((k) => colOf[k] < 0).map((k) => `column "${k}" not found in the model's header row ${headerRow}`);

  const path = parts[index].path;
  let xml = files.get(path).toString('utf8');
  const sheetRows = new Map();
  for (const m of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = new Map();
    for (const c of (m[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) cells.set(colIndex(c[1].match(/r="([A-Z]+)\d+"/)[1]), c[0]);
    sheetRows.set(Number(m[1].match(/\br="(\d+)"/)[1]), { attrs: m[1].replace(/\s*spans="[^"]*"/, ''), cells });
  }
  const sample = sheetRows.get(headerRow + 1);
  rows.forEach((data, i) => {
    const r = headerRow + 1 + i;
    if (!sheetRows.has(r)) sheetRows.set(r, { attrs: (sample?.attrs ?? ` r="${r}"`).replace(/\br="\d+"/, `r="${r}"`), cells: new Map() });
    const row = sheetRows.get(r);
    // Every header column is written, so sample text left in the model is cleared.
    const values = new Map(grid[headerRow - 1].flatMap((h, c) => (h ? [[c, '']] : [])));
    for (const [key, value] of Object.entries(data)) if (colOf[key] >= 0) values.set(colOf[key], value);
    for (const [c, value] of values) {
      const old = row.cells.get(c);
      if (old?.includes('<f>') || old?.includes('<f ')) warnings.push(`cell ${colName(c)}${r} had a formula; replaced by the value`);
      const style = (old ?? sample?.cells.get(c))?.match(/\bs="(\d+)"/)?.[1];
      row.cells.set(c, `<c r="${colName(c)}${r}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t xml:space="preserve">${esc(value ?? '')}</t></is></c>`);
    }
  });
  const leftover = grid.slice(headerRow + rows.length).findIndex((cells) => cells.some(Boolean));
  if (leftover >= 0) warnings.push(`row ${headerRow + rows.length + leftover + 1} below the data still has content from the model (example rows or a footer?)`);
  const sheetData = [...sheetRows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => {
    const cells = [...row.cells.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c).join('');
    return cells ? `<row${row.attrs}>${cells}</row>` : `<row${row.attrs}/>`;
  }).join('');
  xml = xml.replace(/<dimension\b[^>]*\/>/, '').replace(/<sheetData\b[^>]*?(?:\/>|>[\s\S]*<\/sheetData>)/, `<sheetData>${sheetData}</sheetData>`);
  files.set(path, Buffer.from(xml));
  return { buffer: zip([...files.entries()]), headerRow, warnings };
}

// Reads any .xlsx (including files re-saved by Excel/LibreOffice/Google Sheets)
// and maps sheets/columns back to layout keys using labels in any language.
export function readXlsx(buf, layout) {
  const sheets = xlsxSheets(buf);
  const result = {};
  const warnings = [];
  for (const def of layout.sheets) {
    const titles = Object.values(def.title).map((t) => t.slice(0, 31));
    const sheet = sheets.find((s) => titles.includes(s.name));
    if (!sheet) { warnings.push(`missing sheet "${titles.join('" / "')}"`); continue; }
    const grid = sheet.rows.filter((cells) => cells.length).map((cells) => cells.map(String));
    const header = grid[0] || [];
    const keyByIndex = header.map((h) => def.columns.find((col) => Object.values(col.label).includes((h || '').trim()))?.key);
    for (const col of def.columns) {
      if (!keyByIndex.includes(col.key)) warnings.push(`sheet "${sheet.name}": missing column "${Object.values(col.label).join('" / "')}"`);
    }
    header.forEach((h, i) => { if (h && !keyByIndex[i]) warnings.push(`sheet "${sheet.name}": extra column "${h}" (kept under "_extra")`); });
    result[def.key] = grid.slice(1)
      .filter((cells) => cells.some((v) => v !== undefined && v !== ''))
      .map((cells) => {
        const row = {};
        cells.forEach((v, i) => {
          if (keyByIndex[i]) row[keyByIndex[i]] = v ?? '';
          else if (header[i]) (row._extra ??= {})[header[i]] = v ?? '';
        });
        return row;
      });
  }
  return { data: result, warnings };
}

// Checks enum columns against the allowed values of either language.
export function checkValues(layout, data) {
  const problems = [];
  for (const sheet of layout.sheets) {
    (data[sheet.key] || []).forEach((row, r) => {
      for (const col of sheet.columns.filter((c) => c.values)) {
        const value = (row[col.key] ?? '').trim();
        const allowed = Object.values(layout.enums[col.values]).flat();
        if (value && !allowed.some((a) => value === a || value.endsWith(` ${a}`))) {
          problems.push(`${sheet.key} row ${r + 2}, ${col.key}: "${value}" is not an allowed value`);
        }
      }
    });
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { // also imported by the desktop app
  const args = parseArgs(process.argv.slice(2));
  const [command, input] = args._;
  const fail = (msg) => { console.error(msg); process.exit(1); };
  if (command === 'inspect') {
    if (!input) fail('Usage: inspect <file.xlsx>');
    for (const sheet of xlsxSheets(readFileSync(input))) {
      console.log(`# ${sheet.name}`);
      sheet.rows.slice(0, 15).forEach((cells, r) => { if (cells.some(Boolean)) console.log(`${r + 1}: ${JSON.stringify(cells)}`); });
    }
    process.exit(0);
  }
  if (command === 'fill') {
    if (!args.template || !args.data || !args.out) fail('Usage: fill --template <model.xlsx> --data <rows.json> --out <file.xlsx> [--sheet <name>]');
    const { buffer, headerRow, warnings } = fillXlsx(readFileSync(args.template), JSON.parse(readFileSync(args.data, 'utf8')), args.sheet);
    warnings.forEach((w) => console.warn(`warning: ${w}`));
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, buffer);
    console.log(`Wrote ${args.out} (header row ${headerRow})`);
    process.exit(0);
  }
  if (!args.layout) fail('Missing --layout <layout.json>');
  const layout = JSON.parse(readFileSync(args.layout, 'utf8'));

  if (command === 'write') {
    if (!args.data || !args.out) fail('Usage: write --layout <layout.json> --data <data.json> --out <file.xlsx> [--lang en|pt-BR]  (default en)');
    const data = JSON.parse(readFileSync(args.data, 'utf8'));
    const problems = checkValues(layout, data);
    problems.forEach((p) => console.warn(`warning: ${p}`));
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, buildXlsx(layout, data, args.lang || 'en', styleFor(args.out, { styleFile: args.style })));
    console.log(`Wrote ${args.out}`);
  } else if (command === 'read') {
    if (!input) fail('Usage: read <file.xlsx> --layout <layout.json> [--out <data.json>]');
    const { data, warnings } = readXlsx(readFileSync(input), layout);
    warnings.concat(checkValues(layout, data)).forEach((w) => console.warn(`warning: ${w}`));
    const json = `${JSON.stringify(data, null, 2)}\n`;
    if (args.out) { mkdirSync(dirname(args.out), { recursive: true }); writeFileSync(args.out, json); console.log(`Wrote ${args.out}`); } else process.stdout.write(json);
  } else fail('Command must be "write", "read", "fill" or "inspect".');
}
