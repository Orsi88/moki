// Diagrams live in a fenced block. The renderer never executes them; the app draws
// them, and saving a drawing writes the same fence back.

export type DiagramLang = 'mermaid' | 'excalidraw';

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

export const MERMAID_STARTER = 'flowchart LR\n  A --> B';

export const EXCALIDRAW_STARTER = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: 'moki',
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
}, null, 2);

type TextPart = { kind: 'text'; text: string };
type DiagramPart = { kind: 'diagram'; lang: DiagramLang; body: string };
type ImagePart = { kind: 'image'; alt: string; src: string };
export type SourcePart = TextPart | DiagramPart | ImagePart;

const DIAGRAM_FENCE = /```(mermaid|excalidraw)[^\n]*\n([\s\S]*?)```/gi;

// A fence only counts when it starts the text handed to the parser. The raw slice is
// what the parser must consume; the body is what gets stored and written back.
export function takeDiagramFence(src: string): { raw: string; lang: DiagramLang; body: string } | null {
  const match = /^```(mermaid|excalidraw)[^\n]*\r?\n([\s\S]*?)\r?\n```/.exec(src);
  if (!match) return null;
  const lang = match[1].toLowerCase() === 'excalidraw' ? 'excalidraw' : 'mermaid';
  return { raw: match[0], lang, body: match[2].replace(/\s+$/, '') };
}

// Closed mermaid and excalidraw fences become cards. Any other fence, and a fence
// still being typed, stays in the text so the source can be finished.
export function splitDiagramFences(md: string): SourcePart[] {
  const parts: SourcePart[] = [];
  let last = 0;
  for (const match of md.matchAll(DIAGRAM_FENCE)) {
    const at = match.index ?? 0;
    parts.push({ kind: 'text', text: md.slice(last, at) });
    const lang = match[1].toLowerCase() === 'excalidraw' ? 'excalidraw' : 'mermaid';
    parts.push({ kind: 'diagram', lang, body: match[2].replace(/\n$/, '') });
    last = at + match[0].length;
  }
  parts.push({ kind: 'text', text: md.slice(last) });
  return parts;
}

export function joinDiagramFences(parts: SourcePart[]): string {
  return joinSource(parts);
}

// Images embedded in the note stay in the file, but the writing view shows the picture.
// A data URL in a text field becomes a wall of text and the note can no longer be edited.
export function splitSource(md: string): SourcePart[] {
  const out: SourcePart[] = [];
  for (const part of splitDiagramFences(md)) {
    if (part.kind !== 'text') { out.push(part); continue; }
    let last = 0;
    for (const match of part.text.matchAll(/!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/g)) {
      const at = match.index ?? 0;
      out.push({ kind: 'text', text: part.text.slice(last, at) });
      out.push({ kind: 'image', alt: match[1], src: match[2] });
      last = at + match[0].length;
    }
    out.push({ kind: 'text', text: part.text.slice(last) });
  }
  return out;
}

export function joinSource(parts: SourcePart[]): string {
  return parts.map((part) => {
    if (part.kind === 'text') return part.text;
    if (part.kind === 'image') return `![${part.alt}](${part.src})`;
    return '```' + part.lang + '\n' + part.body.replace(/\s+$/, '') + '\n```';
  }).join('');
}

export function replaceDiagram(md: string, index: number, lang: DiagramLang, body: string): string {
  let n = 0;
  return md.replace(FENCE, (full, info: string) => {
    const name = info.trim().split(/\s+/)[0].toLowerCase();
    if (name !== 'mermaid' && name !== 'excalidraw') return full;
    if (n++ !== index) return full;
    return '```' + lang + '\n' + body.replace(/\s+$/, '') + '\n```';
  });
}
