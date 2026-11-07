// Excalidraw side of the diagrams: drawing a scene to SVG and the editor dialog.
// Loaded on demand by Diagrams.tsx, so the library stays out of the app's first chunk.
import { useRef, useState } from 'react';
import { Excalidraw, exportToSvg, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { t } from '../i18n';
import { IconCheck } from './Icons';

function sceneOf(source: string) {
  const parsed = JSON.parse(source) as { type?: string; elements?: unknown[]; appState?: object; files?: never };
  if (!parsed || parsed.type !== 'excalidraw' || !Array.isArray(parsed.elements)) throw new Error('invalid');
  return restore({ elements: parsed.elements as never, appState: parsed.appState ?? {}, files: parsed.files ?? ({} as never) }, null, null);
}

export async function exportDrawing(host: HTMLElement, source: string) {
  const restored = sceneOf(source);
  const paper = String(restored.appState.viewBackgroundColor || '');
  const plain = !paper || paper.toLowerCase() === '#ffffff' || paper.toLowerCase() === '#fff';
  const svg = await exportToSvg({
    elements: restored.elements,
    appState: { ...restored.appState, exportBackground: !plain, viewBackgroundColor: plain ? 'transparent' : paper },
    files: restored.files,
    exportPadding: 16,
  });
  host.replaceChildren(svg);
}

export function DrawingEditor({ source, onSave, onClose }: { source: string; onSave: (body: string) => void; onClose: () => void }) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const [initial] = useState(() => {
    try {
      const restored = sceneOf(source);
      return { elements: restored.elements, appState: restored.appState, files: restored.files };
    } catch {
      return { elements: [], appState: { viewBackgroundColor: '#ffffff' } };
    }
  });
  const save = () => {
    const ex = api.current;
    if (!ex) return;
    onSave(serializeAsJSON(ex.getSceneElements(), ex.getAppState(), ex.getFiles(), 'local'));
  };
  return (
    <div className="drawing-editor" role="dialog" aria-label={t('Drawing')}>
      <div className="drawing-editor-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="btn btn-icon" onClick={save} title={t('Save drawing')} aria-label={t('Save drawing')}><IconCheck size={16} /></button>
      </div>
      <div className="drawing-editor-canvas">
        <Excalidraw initialData={initial} excalidrawAPI={(next) => { api.current = next; }} />
      </div>
    </div>
  );
}
