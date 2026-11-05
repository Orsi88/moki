// Drawn inside headless Chrome, then photographed once per diagram for the PDF.
// The page HTML supplies #specs. Nothing here reads the network.
import mermaid from 'mermaid';
import { exportToSvg, restore } from '@excalidraw/excalidraw';

async function draw(spec, box) {
  if (spec.lang === 'mermaid') {
    const { svg } = await mermaid.render(`mk${spec.id}`, spec.source);
    box.innerHTML = svg;
    return;
  }
  const scene = JSON.parse(spec.source);
  if (!scene || scene.type !== 'excalidraw' || !Array.isArray(scene.elements)) throw new Error('invalid drawing');
  const restored = restore({ elements: scene.elements, appState: scene.appState ?? {}, files: scene.files ?? {} }, null, null);
  const svg = await exportToSvg({
    elements: restored.elements,
    appState: { ...restored.appState, exportBackground: true, viewBackgroundColor: restored.appState.viewBackgroundColor || '#ffffff' },
    files: scene.files ?? {},
    exportPadding: 16,
  });
  box.append(svg);
}

async function main() {
  const specs = JSON.parse(document.getElementById('specs').textContent || '[]');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'neutral', fontFamily: 'Segoe UI, sans-serif' });
  const root = document.getElementById('out');
  for (const spec of specs) {
    const box = document.createElement('div');
    box.id = `d${spec.id}`;
    box.className = 'box';
    root.append(box);
    try { await draw(spec, box); } catch { box.dataset.failed = '1'; }
  }
  document.documentElement.dataset.ready = '1';
}

void main();
