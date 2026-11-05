// The formatted editor's code fence: the same card as the reading view (language, copy,
// then the text). The language is the fence info, so the file stays Markdown.

import { useState } from 'react';
import { CodeBlock } from '@tiptap/extension-code-block';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { CODE_LANGS } from '../code-embed';
import { t } from '../i18n';
import { IconCopy } from './Icons';

function CodeBlockCardView({ node, updateAttributes }: ReactNodeViewProps) {
  const lang = typeof node.attrs.language === 'string' ? node.attrs.language : '';
  const [copied, setCopied] = useState(false);
  const known = CODE_LANGS.some(([value]) => value === lang);
  const copy = () => {
    const written = navigator.clipboard?.writeText(node.textContent);
    void Promise.resolve(written).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <NodeViewWrapper className="code-embed">
      <div className="code-embed-bar" contentEditable={false}>
        <select className="code-lang" aria-label={t('Code')} value={lang}
          onChange={(event) => updateAttributes({ language: event.target.value || null })}>
          <option value="">{t('Text')}</option>
          {!known && lang && <option value={lang}>{lang}</option>}
          {CODE_LANGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" className="icon-btn" title={copied ? t('Copied') : t('Copy')} aria-label={copied ? t('Copied') : t('Copy')} onClick={copy}>
          <IconCopy size={15} />
        </button>
      </div>
      <pre><NodeViewContent className="code-embed-body" /></pre>
    </NodeViewWrapper>
  );
}

export const MokiCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockCardView, {
      stopEvent: ({ event }) => {
        const target = event.target;
        return target instanceof Element && Boolean(target.closest('.code-embed-bar'));
      },
    });
  },
});
