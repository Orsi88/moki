// Choosing an agent of the project, as cards with a search (name, description, category), same
// look as the activity and tool catalogs. It is the one agent picker of the project panel
// (call an agent, start an activity) and of the activity wizard. When the agent is optional
// the first card is "no agent": the skill decides.

import { useState } from 'react';
import type { AgentInfo } from '../api';
import { t } from '../i18n';
import { CatIcon } from './CatIcon';
import { CatalogModal, matchesQuery } from './CatalogModal';
import { IconChevron } from './Icons';

interface Props {
  agents: AgentInfo[]; // usable and on in this project
  selected: string; // '' = no agent
  optional?: boolean; // offer "no agent"
  title?: string;
  hint?: string;
  onPick: (agent: string) => void;
  onClose: () => void;
}

export function AgentCatalog({ agents, selected, optional, title, hint, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const list = agents.filter((a) => matchesQuery(query, a.name, a.description, a.category));

  return (
    <CatalogModal titleId="agent-catalog-title" title={title ?? t('Who should do it?')} hint={hint ?? (optional ? t('An agent is a specialist with its own instructions. If you are not sure, let the skill decide.') : undefined)}
      onClose={onClose} search={{ value: query, onChange: setQuery, placeholder: t('Search agents') }}>
      {!list.length && <p className="muted small">{agents.length ? t('No agent matches.') : t('No agent is on in this project. Agents reach projects through their tags in Settings › Agents.')}</p>}
      <ul className="catalog-grid">
        {optional && (
          <li>
            <button type="button" className={`catalog-card${selected ? '' : ' on'}`} aria-pressed={!selected} onClick={() => { onPick(''); onClose(); }}>
              <span className="catalog-top"><span className="catalog-num">{t('Agent')}</span></span>
              <span className="catalog-main">
                <span className="catalog-emblem" aria-hidden="true"><CatIcon id="puzzle" size={64} /></span>
                <span className="catalog-text">
                  <span className="catalog-title">{t('Let the skill decide')}</span>
                  <span className="catalog-hint">{t('Recommended if you are not sure.')}</span>
                </span>
              </span>
            </button>
          </li>
        )}
        {list.map((a) => (
          <li key={a.name}>
            <button type="button" className={`catalog-card${a.name === selected ? ' on' : ''}`} aria-pressed={a.name === selected} title={a.description || undefined} onClick={() => { onPick(a.name); onClose(); }}>
              <span className="catalog-top">
                <span className="catalog-num">{a.source === 'custom' ? t('Yours') : t('Agent')}</span>
                {a.category && <span className="catalog-skill">{a.category}</span>}
              </span>
              <span className="catalog-main">
                <span className="catalog-emblem" aria-hidden="true"><CatIcon id="robot" size={64} /></span>
                <span className="catalog-text">
                  <span className="catalog-title">{a.name}</span>
                  {a.description && <span className="catalog-hint agent-catalog-hint">{a.description}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CatalogModal>
  );
}

// The field that opens the catalog: the same control wherever an agent is chosen.
export function AgentPick({ agents, value, onChange, optional, label, title, hint }: {
  agents: AgentInfo[]; value: string; onChange: (agent: string) => void; optional?: boolean; label: string; title?: string; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pp-field">
      <span className="pp-field-label">{label}</span>
      <button type="button" className={`pp-pick${value || optional ? '' : ' empty'}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {value && <CatIcon id="robot" size={26} />}
        <span className="pp-pick-label">{value || (optional ? t('Let the skill decide') : t('Choose an agent'))}</span>
        <IconChevron size={14} />
      </button>
      {open && <AgentCatalog agents={agents} selected={value} optional={optional} title={title} hint={hint} onPick={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}
