// The + of the tab bar: first the categories (Terminal, AI, File, ArtCraft apps); choosing one
// shows its options in place of the list, with a Back row. Arrows move, → or Enter opens a
// category, ← or Esc goes back (Esc on the categories closes the menu).

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ToolInfo } from '../api';
import { t } from '../i18n';
import { FileIcon } from '../icons';
import { IconAgent, IconArrowLeft, IconBox, IconChevron, IconExternal, IconFile, IconPlay, IconTerminal } from './Icons';

type Category = 'terminal' | 'ai' | 'file' | 'craft';

// What "File" creates; the service makes the Office ones empty (desktop/service.ts, BLANK_FILES).
export const NEW_FILE_TYPES = [
  { ext: '.md', label: () => t('Note (.md)') },
  { ext: '.txt', label: () => t('Text (.txt)') },
  { ext: '.xlsx', label: () => t('Spreadsheet (.xlsx)') },
  { ext: '.docx', label: () => t('Word document (.docx)') },
];

interface Props {
  at: { left: number; top: number };
  tools: ToolInfo[];
  onTerminal: (tool: string) => void; // '' = the user's shell
  onFile: (ext: string) => void;
  onCraft: () => void;
  onClose: () => void;
}

// ↑ ↓ between the menu's buttons (the list is rebuilt on each level, so the DOM is the source).
const moveFocus = (e: KeyboardEvent<HTMLUListElement>, step: number) => {
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  items[(i + step + items.length) % items.length]?.focus();
  e.preventDefault();
};

export function NewMenu({ at, tools, onTerminal, onFile, onCraft, onClose }: Props) {
  const [category, setCategory] = useState<Category | null>(null);

  const categories: { id: Category; icon: ReactNode; label: string }[] = [
    { id: 'terminal', icon: <IconTerminal size={15} />, label: t('Terminal') },
    { id: 'ai', icon: <IconAgent size={15} />, label: t('AI') },
    { id: 'file', icon: <IconFile size={15} />, label: t('File') },
    { id: 'craft', icon: <IconBox size={15} />, label: t('ArtCraft apps') },
  ];
  const item = (key: string, icon: ReactNode, label: string, onClick: () => void, extra?: ReactNode, disabled = false, first = false) => (
    <li key={key}>
      <button type="button" role="menuitem" autoFocus={first} disabled={disabled} onClick={onClick}>{icon} {label}{extra}</button>
    </li>
  );

  const options = (): ReactNode[] => {
    if (category === 'terminal') return [item('shell', <IconTerminal size={15} />, t('Terminal'), () => onTerminal(''), <span className="muted small">{t('your shell')}</span>, false, true)];
    if (category === 'ai') {
      return tools.filter((ai) => ai.kind === 'terminal').map((ai, i) => item(ai.id, <IconPlay size={15} />, ai.label, () => onTerminal(ai.id),
        <span className="muted small">{ai.available ? ai.command : ai.installable ? t('not installed · click to install') : t('not installed')}</span>,
        !ai.available && !ai.installable, i === 0));
    }
    if (category === 'file') return NEW_FILE_TYPES.map((f, i) => item(f.ext, <FileIcon name={`x${f.ext}`} size={15} />, f.label(), () => onFile(f.ext), undefined, false, i === 0));
    return [item('download', <IconExternal size={15} />, t('Download ArtCraft apps…'), onCraft, undefined, false, true)];
  };
  const back = () => setCategory(null);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') moveFocus(e, 1);
    else if (e.key === 'ArrowUp') moveFocus(e, -1);
    else if ((e.key === 'Escape' || e.key === 'ArrowLeft') && category) { e.preventDefault(); back(); }
    else if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowRight' && !category) {
      const id = (document.activeElement as HTMLElement | null)?.dataset.category as Category | undefined;
      if (id) { e.preventDefault(); setCategory(id); }
    }
  };

  return (
    <div className="menu-backdrop" onMouseDown={onClose}>
      <ul className="term-menu new-menu" role="menu" aria-label={category ? categories.find((c) => c.id === category)?.label : t('New')} style={at}
        onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        {category ? (
          <>
            <li><button type="button" role="menuitem" className="new-menu-back" onClick={back}><IconArrowLeft size={15} /> {t('Back')}</button></li>
            <li className="ws-menu-sep" />
            {options()}
          </>
        ) : categories.map((c, i) => (
          <li key={c.id}>
            <button type="button" role="menuitem" aria-haspopup="menu" data-category={c.id} autoFocus={i === 0} onClick={() => setCategory(c.id)}>
              {c.icon} {c.label}<span className="new-menu-more"><IconChevron size={14} /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
