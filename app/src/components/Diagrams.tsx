// Mermaid and Excalidraw blocks inside rendered Markdown. The HTML from the main
// process only carries the escaped source; drawing happens here. A drawing can be
// edited and is written back into its fence. Mermaid stays source.
import { createRoot } from 'react-dom/client';
import { t } from '../i18n';
import { mountDiagramJobs, type DiagramJob } from '../diagram-mount';
import { type DiagramLang } from '../diagram-source';

// Excalidraw is loaded on the first drawing (ExcalidrawScene.tsx), like Mermaid on the first diagram.
const scene = () => import('./ExcalidrawScene');
const drawExcalidraw = async (host: HTMLElement, source: string) => (await scene()).drawExcalidraw(host, source);

export async function paintDiagram(host: HTMLElement, lang: DiagramLang, source: string) {
  if (lang === 'excalidraw') {
    await drawExcalidraw(host, source);
    return;
  }
  const mermaid = (await import('mermaid')).default;
  const dark = document.documentElement.dataset.theme !== 'light';
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: dark ? 'dark' : 'neutral' });
  const id = `moki${Math.random().toString(36).slice(2, 10)}`;
  const { svg } = await mermaid.render(id, source);
  host.innerHTML = svg;
  host.querySelectorAll('script').forEach((node) => node.remove());
}

// Ctrl + scroll over the card. The same range as the +/- buttons. A passive
// listener cannot cancel the browser's own zoom, so this one is not passive.
export function bindDiagramZoom(host: HTMLElement): () => void {
  let zoom = 1;
  host.style.setProperty('--diagram-zoom', '1');
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const next = Math.min(3, Math.max(0.25, Math.round((zoom + (event.deltaY > 0 ? -0.15 : 0.15)) * 100) / 100));
    if (next === zoom) return;
    zoom = next;
    host.style.setProperty('--diagram-zoom', String(zoom));
  };
  host.addEventListener('wheel', onWheel, { passive: false });
  return () => host.removeEventListener('wheel', onWheel);
}

export function openDrawing(source: string, onSave: (body: string) => void) {
  void scene().then(({ DrawingEditor }) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const close = () => { root.unmount(); host.remove(); };
    root.render(<DrawingEditor source={source} onSave={(body) => { onSave(body); close(); }} onClose={close} />);
  });
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
