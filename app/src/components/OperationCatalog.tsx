// Choosing an operation, as cards with a search, same look as the activity, agent and tool
// catalogs. Every operation on this computer is listed. OperationPick is the field that opens it.

import { useState } from 'react';
import type { Operation } from '../api';
import { t } from '../i18n';
import { CatIcon } from './CatIcon';
import { CatalogModal, matchesQuery } from './CatalogModal';
import { IconChevron } from './Icons';

interface Props {
  operations: Operation[]; // every operation on this computer
  selected: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export const operationMatches = (query: string, o: Operation): boolean => matchesQuery(query, o.name, o.description);

export function OperationCatalog({ operations, selected, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const list = operations.filter((o) => operationMatches(query, o));

  return (
    <CatalogModal titleId="operation-catalog-title" title={t('Which operation do you want to start?')} hint={t('Every operation on this computer.')} onClose={onClose}
      search={{ value: query, onChange: setQuery, placeholder: t('Search operations') }}>
      {!list.length && <p className="muted small">{operations.length ? t('No operation matches.') : t('No operations yet. Create them in Settings › Operations.')}</p>}
      <ul className="catalog-grid">
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" className={`catalog-card${o.id === selected ? ' on' : ''}`} aria-pressed={o.id === selected} title={o.description || undefined} onClick={() => { onPick(o.id); onClose(); }}>
              <span className="catalog-top">
                <span className="catalog-num">{t('Operation')}</span>
                <span className="catalog-skill">{t('{n} steps', { n: o.steps.length })}</span>
              </span>
              <span className="catalog-main">
                <span className="catalog-emblem" aria-hidden="true"><CatIcon id="flow" size={64} /></span>
                <span className="catalog-text">
                  <span className="catalog-title">{o.name}</span>
                  {o.description && <span className="catalog-hint agent-catalog-hint">{o.description}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CatalogModal>
  );
}

export function OperationPick({ operations, value, onChange, label }: { operations: Operation[]; value: string; onChange: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const operation = operations.find((o) => o.id === value);
  return (
    <div className="pp-field">
      <span className="pp-field-label">{label}</span>
      <button type="button" className={`pp-pick${operation ? '' : ' empty'}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {operation && <CatIcon id="flow" size={26} />}
        <span className="pp-pick-label">{operation ? operation.name : t('Choose an operation')}</span>
        <IconChevron size={14} />
      </button>
      {operation?.description && <span className="pp-hint">{operation.description}</span>}
      {open && <OperationCatalog operations={operations} selected={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}
