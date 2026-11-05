// One Markdown field. A drawing or diagram is a card inside the formatted editor,
// not a second box that splits this one. The file still stores the fence.

import { type ClipboardEvent, type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';

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
  return (
    <textarea ref={editorRef} className={className} spellCheck autoFocus={autoFocus} value={value} placeholder={placeholder}
      onChange={(e) => { onChange(e.target.value); onEdit?.(e.target.value, e.target.selectionStart); }}
      onKeyDown={onKeyDown} onClick={onClick} onBlur={onBlur} onPaste={onPaste} onDrop={onDrop} />
  );
}
