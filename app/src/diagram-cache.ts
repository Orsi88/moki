// In-memory cache of drawn diagrams (SVG strings), so a note that is opened again
// does not redraw Mermaid or Excalidraw. Pure: no DOM, no drawing library.
// The key holds the whole source, never a hash, so a lookup cannot return the SVG
// of another source. Only successful drawings are stored.
import type { MermaidDrawer } from './diagram-mount.ts';

export interface CachedDiagram {
  svg: string;
  // Mermaid's render id, found again inside the SVG (root id, scoped CSS, markers).
  id?: string;
}

export const MAX_ENTRIES = 50;
export const MAX_BYTES = 4 * 1024 * 1024;

export const diagramKey = (lang: string, theme: string, source: string) => JSON.stringify([lang, theme, source]);

// Map keeps insertion order: the first key is the least recently used one.
export function createDiagramCache(maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES) {
  const map = new Map<string, CachedDiagram>();
  let bytes = 0;
  // Strings are UTF-16 in memory.
  const weigh = (key: string, value: CachedDiagram) => (key.length + value.svg.length + (value.id?.length ?? 0)) * 2;
  const drop = (key: string) => {
    const old = map.get(key);
    if (!old) return;
    bytes -= weigh(key, old);
    map.delete(key);
  };
  return {
    get(key: string): CachedDiagram | undefined {
      const hit = map.get(key);
      if (!hit) return undefined;
      map.delete(key);
      map.set(key, hit);
      return hit;
    },
    set(key: string, value: CachedDiagram) {
      drop(key);
      const size = weigh(key, value);
      if (size > maxBytes) return;
      map.set(key, value);
      bytes += size;
      while (map.size > maxEntries || bytes > maxBytes) drop(map.keys().next().value as string);
    },
    clear() { map.clear(); bytes = 0; },
    get size() { return map.size; },
    get bytes() { return bytes; },
  };
}

export const diagramCache = createDiagramCache();

// Two copies of one Mermaid SVG in the page would share ids. A hit is served under
// the id of the new render, so each copy keeps its own scoped CSS and markers.
export const withId = (hit: CachedDiagram, id: string) => (hit.id ? hit.svg.split(hit.id).join(id) : hit.svg);

// A hit skips `drawer.render` (and the Mermaid import behind it). A failed render
// throws through and is not stored.
export function cachedMermaid(drawer: MermaidDrawer, theme: string, cache = diagramCache): MermaidDrawer {
  return {
    render: async (id, source) => {
      const key = diagramKey('mermaid', theme, source);
      const hit = cache.get(key);
      if (hit) return withId(hit, id);
      const svg = await drawer.render(id, source);
      cache.set(key, { svg, id });
      return svg;
    },
  };
}
