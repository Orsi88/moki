// What the catalogs share (activities, agents, AI tools, operations): the dialog frame with its
// header and Esc, the search field, and the match rule of that search. One place, so every
// "choose one" list in the project panel looks and searches the same way.

import { useEffect, type ReactNode } from 'react';
import { t } from '../i18n';
import { IconX } from './Icons';

// A search matches when every typed word is somewhere in the given fields (no accents or case rules beyond lower case).
export const matchesQuery = (query: string, ...fields: string[]): boolean => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = fields.join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
};

export function SearchField({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (value: string) => void; placeholder: string; autoFocus?: boolean }) {
  return <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus} />;
}

interface Props {
  titleId: string;
  title: string;
  hint?: string;
  onClose: () => void;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  children: ReactNode;
}

export function CatalogModal({ titleId, title, hint, onClose, search, children }: Props) {
  // Esc closes only this catalog, even when it opened over another dialog (the activity wizard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal catalog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {hint && <p className="muted small">{hint}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        <div className="modal-body">
          {search && <div className="catalog-search"><SearchField {...search} autoFocus /></div>}
          {children}
        </div>
      </div>
    </div>
  );
}
