// Plain Markdown writing with mermaid and excalidraw fences folded into one line.
// The text around them stays a normal field. The file still stores the whole fence.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { joinDiagramFences, splitDiagramFences, type DiagramLang, type SourcePart } from '../diagram-source';
import { t } from '../i18n';
import { openDrawing } from './Diagrams';
import { IconEdit } from './Icons';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onEdit?: (segment: string, caret: number) => void;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  className: string;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClick?: (e: MouseEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop?: (e: DragEvent<HTMLTextAreaElement>) => void;
}

export function DiagramSourceEditor({ value, onChange, onEdit, editorRef, className, placeholder, autoFocus, onKeyDown, onClick, onBlur, onPaste, onDrop }: Props) {
  const parts = splitDiagramFences(value);
  const folded = parts.some((part) => part.kind === 'diagram');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editorRef.current?.isConnected) editorRef.current = first.current;
  });
  const write = (next: SourcePart[]) => onChange(joinDiagramFences(next));
  const editText = (index: number, text: string, caret: number) => {
    write(parts.map((part, i) => (i === index && part.kind === 'text' ? { kind: 'text', text } : part)));
    onEdit?.(text, caret);
  };
  const editBody = (index: number, body: string) => {
    write(parts.map((part, i) => (i === index && part.kind === 'diagram' ? { ...part, body } : part)));
  };
  const focus = (el: HTMLTextAreaElement | null) => { if (el) editorRef.current = el; };

  if (!folded) {
    return (
      <textarea ref={editorRef} className={className} spellCheck autoFocus={autoFocus} value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); onEdit?.(e.target.value, e.target.selectionStart); }}
        onKeyDown={onKeyDown} onClick={onClick} onBlur={onBlur} onPaste={onPaste} onDrop={onDrop} />
    );
  }

  return (
    <div className="source-flow">
      {parts.map((part, index) => part.kind === 'text' ? (
        <textarea key={index} ref={index === 0 ? first : undefined} className={className} spellCheck autoFocus={autoFocus && index === 0} value={part.text} placeholder={index === 0 ? placeholder : undefined}
          onFocus={(e) => focus(e.currentTarget)}
          onChange={(e) => editText(index, e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown} onClick={onClick} onBlur={onBlur} onPaste={onPaste} onDrop={onDrop} />
      ) : (
        <DiagramCard key={index} lang={part.lang} body={part.body} expanded={Boolean(open[index])}
          onToggle={() => setOpen((cur) => ({ ...cur, [index]: !cur[index] }))}
          onBody={(body) => editBody(index, body)}
          onDraw={(body) => editBody(index, body)} />
      ))}
    </div>
  );
}

function DiagramCard({ lang, body, expanded, onToggle, onBody, onDraw }: {
  lang: DiagramLang; body: string; expanded: boolean;
  onToggle: () => void; onBody: (body: string) => void; onDraw: (body: string) => void;
}) {
  const drawing = lang === 'excalidraw';
  const label = drawing ? t('Drawing') : t('Diagram');
  return (
    <div className="source-diagram">
      <div className="source-diagram-bar">
        <button type="button" className="source-diagram-main" onClick={drawing ? () => openDrawing(body, onDraw) : onToggle}>
          <span>{label}</span>
        </button>
        {drawing && <button type="button" className="icon-btn" onClick={() => openDrawing(body, onDraw)} title={t('Edit drawing')} aria-label={t('Edit drawing')}><IconEdit size={16} /></button>}
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded} onClick={onToggle}>{t('Code')}</button>
      </div>
      {expanded && (
        <textarea className="source-diagram-code" spellCheck={false} value={body} aria-label={t('Code')}
          onChange={(e) => onBody(e.target.value)} />
      )}
    </div>
  );
}
