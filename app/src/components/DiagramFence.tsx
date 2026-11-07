// A mermaid or excalidraw fence stays one block in the formatted editor. The file
// keeps the fence; the block draws it. The JSON is not text the editor can rewrite.

import { useEffect, useRef } from 'react';
import { Node, mergeAttributes, type MarkdownToken } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { takeDiagramFence, type DiagramLang } from '../diagram-source';
import { t } from '../i18n';
import { bindDiagramZoom, failed, openDrawing, paintDiagram } from './Diagrams';
import { IconEdit } from './Icons';

function DiagramFenceView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const lang: DiagramLang = node.attrs.lang === 'excalidraw' ? 'excalidraw' : 'mermaid';
  const body = String(node.attrs.body ?? '');
  const picture = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = picture.current;
    if (!host) return;
    let gone = false;
    host.replaceChildren();
    void paintDiagram(host, lang, body).then(() => {
      if (gone) return;
      const svg = host.querySelector('svg');
      if (svg?.viewBox.baseVal.width) { svg.removeAttribute('width'); svg.removeAttribute('height'); }
    }).catch(() => {
      if (gone) return;
      const note = document.createElement('p');
      note.className = 'muted small';
      note.textContent = t('This diagram could not be drawn.');
      host.replaceChildren(note);
    });
    return () => { gone = true; };
  }, [lang, body]);

  useEffect(() => {
    const card = picture.current?.closest<HTMLElement>('.diagram');
    if (!card) return;
    return bindDiagramZoom(card);
  }, []);

  return (
    <NodeViewWrapper className={`diagram${selected ? ' on' : ''}`} data-diagram={lang}>
      <div className="diagram-bar" contentEditable={false}
        onMouseDown={(event) => event.stopPropagation()}>
        <span className="diagram-kind">{lang === 'excalidraw' ? t('Drawing') : t('Diagram')}</span>
        <span className="diagram-actions">
          {lang === 'excalidraw' && (
            <button type="button" className="icon-btn diagram-edit" title={t('Edit drawing')} aria-label={t('Edit drawing')}
              onClick={() => { void openDrawing(body, (next) => updateAttributes({ body: next })).catch(() => { if (picture.current) failed(picture.current); }); }}>
              <IconEdit size={16} />
            </button>
          )}
        </span>
      </div>
      <div className="diagram-picture" ref={picture} title={t('Hold Ctrl and scroll to zoom')} />
    </NodeViewWrapper>
  );
}

export const DiagramFence = Node.create({
  name: 'diagramFence',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      lang: { default: 'mermaid' },
      body: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-diagram-fence]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-diagram-fence': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramFenceView, {
      ignoreMutation: () => true,
      stopEvent: ({ event }) => {
        const target = event.target;
        if (!(target instanceof Element)) return false;
        if (target.closest('button')) return true;
        return event.type === 'wheel' && 'ctrlKey' in event && Boolean((event as WheelEvent).ctrlKey) && Boolean(target.closest('.diagram'));
      },
    });
  },

  markdownTokenName: 'diagramFence',

  markdownTokenizer: {
    name: 'diagramFence',
    level: 'block',
    start: (src) => src.search(/```(?:mermaid|excalidraw)(?:\s|\r|\n)/),
    tokenize: (src) => {
      const taken = takeDiagramFence(src);
      if (!taken) return undefined;
      return { type: 'diagramFence', raw: taken.raw, lang: taken.lang, text: taken.body } as MarkdownToken;
    },
  },

  parseMarkdown(token) {
    const lang = token.lang === 'excalidraw' ? 'excalidraw' : 'mermaid';
    return { type: 'diagramFence', attrs: { lang, body: String(token.text ?? '') } };
  },

  renderMarkdown(node) {
    const lang = node.attrs?.lang === 'excalidraw' ? 'excalidraw' : 'mermaid';
    const body = String(node.attrs?.body ?? '').replace(/\s+$/, '');
    return '```' + lang + '\n' + body + '\n```';
  },
});
