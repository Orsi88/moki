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
export type SourcePart = TextPart | DiagramPart;

const DIAGRAM_FENCE = /```(mermaid|excalidraw)[^\n]*\n([\s\S]*?)```/gi;

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
  return parts.map((part) => (part.kind === 'text' ? part.text : '```' + part.lang + '\n' + part.body.replace(/\s+$/, '') + '\n```')).join('');
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
