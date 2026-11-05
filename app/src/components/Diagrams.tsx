// Mermaid and Excalidraw blocks inside rendered Markdown. The HTML from the main
// process only carries the escaped source; drawing happens here. A drawing can be
// edited and is written back into its fence. Mermaid stays source.
import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { Excalidraw, exportToSvg, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { t } from '../i18n';
import { mountDiagramJobs, type DiagramJob } from '../diagram-mount';
import { type DiagramLang } from '../diagram-source';
import { IconCheck } from './Icons';

function sceneOf(source: string) {
  const parsed = JSON.parse(source) as { type?: string; elements?: unknown[]; appState?: object; files?: never };
  if (!parsed || parsed.type !== 'excalidraw' || !Array.isArray(parsed.elements)) throw new Error('invalid');
  return restore({ elements: parsed.elements as never, appState: parsed.appState ?? {}, files: parsed.files ?? ({} as never) }, null, null);
}

async function drawExcalidraw(host: HTMLElement, source: string) {
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

function DrawingEditor({ source, onSave, onClose }: { source: string; onSave: (body: string) => void; onClose: () => void }) {
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

export function openDrawing(source: string, onSave: (body: string) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = () => { root.unmount(); host.remove(); };
  root.render(<DrawingEditor source={source} onSave={(body) => { onSave(body); close(); }} onClose={close} />);
}

// The same zoom as a PDF: the picture starts fitted to the card, then grows or shrinks inside it.
function zoomControl(picture: HTMLElement) {
  let zoom = 1;
  const bar = document.createElement('div');
  bar.className = 'pdf-zoom';
  const out = document.createElement('button');
  const label = document.createElement('span');
  const inn = document.createElement('button');
  out.type = 'button';
  inn.type = 'button';
  out.className = 'icon-btn';
  inn.className = 'icon-btn';
  out.textContent = '−';
  inn.textContent = '+';
  label.className = 'small';
  out.title = t('Zoom out');
  inn.title = t('Zoom in');
  out.setAttribute('aria-label', t('Zoom out'));
  inn.setAttribute('aria-label', t('Zoom in'));
  const apply = () => {
    picture.style.setProperty('--diagram-zoom', String(zoom));
    label.textContent = `${Math.round(zoom * 100)}%`;
    out.disabled = zoom <= 0.5;
    inn.disabled = zoom >= 3;
  };
  const step = (by: number) => (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    zoom = Math.min(3, Math.max(0.5, Math.round((zoom + by) * 100) / 100));
    apply();
  };
  out.addEventListener('click', step(-0.25));
  inn.addEventListener('click', step(0.25));
  bar.append(out, label, inn);
  apply();
  return bar;
}

function failed(host: HTMLElement) {
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = t('This diagram could not be drawn.');
  host.replaceChildren(note);
}

// Turns each diagram block into a picture. `onSave` writes an edited drawing back.
// The order lives in mountDiagramJobs: the card replaces the source before Mermaid loads.
export async function mountDiagrams(root: HTMLElement, onSave?: (index: number, lang: DiagramLang, body: string) => void) {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre.diagram, div.diagram')];
  const jobs: (DiagramJob & { block: HTMLElement })[] = [];
  blocks.forEach((block, index) => {
    const lang = block.dataset.diagram === 'excalidraw' ? 'excalidraw' : block.dataset.diagram === 'mermaid' ? 'mermaid' : '';
    if (!lang) return;
    jobs.push({ index, lang, source: block.dataset.source ?? block.querySelector('code')?.textContent ?? '', block });
  });
  if (!jobs.length) return;
  await mountDiagramJobs(jobs, {
    card: (job) => {
      const frame = document.createElement('div');
      frame.className = 'diagram';
      frame.dataset.diagram = job.lang;
      frame.dataset.source = job.source;
      frame.contentEditable = 'false';
      const picture = document.createElement('div');
      picture.className = 'diagram-picture';
      const bar = document.createElement('div');
      bar.className = 'diagram-bar';
      bar.addEventListener('mousedown', (event) => event.stopPropagation());
      const kind = document.createElement('span');
      kind.className = 'diagram-kind';
      kind.textContent = job.lang === 'excalidraw' ? t('Drawing') : t('Diagram');
      const actions = document.createElement('span');
      actions.className = 'diagram-actions';
      actions.append(zoomControl(picture));
      bar.append(kind, actions);
      frame.append(bar, picture);
      if (job.lang === 'excalidraw' && onSave) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-btn diagram-edit';
        button.title = t('Edit drawing');
        button.setAttribute('aria-label', t('Edit drawing'));
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openDrawing(frame.dataset.source ?? '', (body) => {
            frame.dataset.source = body;
            onSave(job.index, 'excalidraw', body);
            void drawExcalidraw(picture, body).catch(() => failed(picture));
          });
        });
        actions.append(button);
      }
      job.block.replaceWith(frame);
      return picture;
    },
    draw: (picture, source) => drawExcalidraw(picture, source),
    loadMermaid: async () => {
      const mermaid = (await import('mermaid')).default;
      const dark = document.documentElement.dataset.theme !== 'light';
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: dark ? 'dark' : 'neutral' });
      return { render: async (id, source) => (await mermaid.render(id, source)).svg };
    },
    show: (picture, svg) => {
      picture.innerHTML = svg;
      picture.querySelectorAll('script').forEach((node) => node.remove());
    },
    fail: failed,
  });
}
