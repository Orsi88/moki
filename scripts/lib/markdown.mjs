// Small Markdown-to-HTML renderer shared by the PDF generator and the desktop
// app. HTML in the source is escaped, so the output never contains raw markup
// from the document. No dependencies.

export const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A backslash keeps a punctuation character literal (\* is "*", not emphasis).
const hide = (text) => text.replace(/\\([!-/:-@[-`{-~])/g, (_, c) => String.fromCharCode(0xe000 + c.charCodeAt(0)));
const unhide = (html) => html.replace(/[\ue000-\ue07f]/g, (c) => escHtml(String.fromCharCode(c.charCodeAt(0) - 0xe000)));

// Set only while markdownToHtml runs (it is synchronous): turns a relative image path into a data: URI, or null.
let resolveImage = null;

function inline(text) {
  return unhide(escHtml(hide(text))
    // Relative images become data: URIs through the caller's resolver; the line below still accepts only raster data: URIs.
    .replace(/!\[([^\]]*)\]\(([^)\s:]+)\)/g, (m, alt, src) => {
      const uri = resolveImage?.(src.replace(/&amp;/g, '&'));
      return uri ? `![${alt}](${uri})` : m;
    })
    // Only embedded raster images (Word previews); no remote or file images.
    .replace(/!\[([^\]]*)\]\((data:image\/(?:png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    // <https://...>: an autolink (http and https only; the text is already escaped).
    .replace(/&lt;(https?:\/\/[^\s<>]+?)&gt;/g, '<a href="$1">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>'));
}

// A cell that is just << joins the cell on its left and ^^ the cell above (merged cells in Word previews),
// so the merged area is drawn as one cell. "\<<" is a literal "<<".
function table(head, rows) {
  const grid = [head, ...rows].map((cells, r) => cells.map((text, c) => ({ text, r, c, colspan: 1, rowspan: 1, owner: null })));
  for (const row of grid) {
    for (const cell of row) {
      const near = cell.text === '<<' ? row[cell.c - 1] : cell.text === '^^' && cell.r > 1 ? grid[cell.r - 1][cell.c] : null; // no rowspan out of the header
      if (!near) continue;
      cell.owner = near.owner ?? near;
      if (cell.text === '<<' && cell.owner.r === cell.r) cell.owner.colspan++;
      if (cell.text === '^^' && cell.owner.c === cell.c) cell.owner.rowspan++;
    }
  }
  const tr = (row, tag) => `<tr>${row.filter((cell) => !cell.owner).map((cell) => `<${tag}${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ''}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''}>${/^(<<|\^\^)$/.test(cell.text) ? '' : inline(cell.text)}</${tag}>`).join('')}</tr>`;
  return `<table><thead>${tr(grid[0], 'th')}</thead><tbody>${grid.slice(1).map((row) => tr(row, 'td')).join('')}</tbody></table>`;
}

// Small Markdown subset: headings (# and setext), paragraphs, nested lists, tables,
// blockquotes, code blocks, horizontal rules. Enough for generated reports.
// options.image: (src) => data: URI or null, for relative image paths (the desktop app reads them inside the project).
/** @param {string} md @param {{ image?: ((src: string) => string | null) | null }} [options] */
export function markdownToHtml(md, { image = null } = {}) {
  resolveImage = image;
  try { return render(md); } finally { resolveImage = null; }
}

function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||(?<!\\)\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escHtml(buf.join('\n'))}</code></pre>`);
    } else if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${inline(line.slice(level).trim())}</h${level}>`);
      i++;
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(table(head, rows));
    } else if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const html = [];
      const stack = []; // open lists: { tag, indent }
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        const indent = m[1].replace(/\t/g, '    ').length;
        const tag = /\d/.test(m[2]) ? 'ol' : 'ul';
        // Deeper by 2+ spaces opens a nested list; less indented closes lists back to that level.
        while (stack.length > 1 && indent < stack.at(-1).indent) html.push(`</li></${stack.pop().tag}>`);
        const top = stack.at(-1);
        if (!top || indent >= top.indent + 2) { html.push(`<${tag}><li>`); stack.push({ tag, indent }); }
        else if (top.tag !== tag) { html.push(`</li></${stack.pop().tag}><${tag}><li>`); stack.push({ tag, indent }); }
        else html.push('</li><li>');
        // "- [ ] item" / "- [x] item": a checklist item (the box is drawn, not editable here).
        const task = m[3].match(/^\[([ xX])\]\s+(.*)$/);
        html.push(task ? `<input type="checkbox" class="task" disabled${task[1] === ' ' ? '' : ' checked'}> ${inline(task[2])}` : inline(m[3]));
        i++;
      }
      while (stack.length) html.push(`</li></${stack.pop().tag}>`);
      out.push(html.join(''));
    } else if (!line.trim()) {
      i++;
    } else {
      const buf = [];
      let level = 0;
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s+)/.test(lines[i])) {
        // Setext heading: text underlined with === (level 1) or --- (level 2). A lone --- is a rule (handled above).
        if (buf.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i])) { level = lines[i].trim()[0] === '=' ? 1 : 2; i++; break; }
        buf.push(lines[i++]);
      }
      if (level) { out.push(`<h${level}>${inline(buf.join(' ').trim())}</h${level}>`); continue; }
      // A line ending in two spaces is a line break inside the paragraph.
      out.push(`<p>${inline(buf.join('\n')).replace(/ {2,}\n/g, '<br>').replace(/\n/g, ' ')}</p>`);
    }
  }
  return out.join('\n');
}
