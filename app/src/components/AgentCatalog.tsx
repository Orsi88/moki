// "Call an agent" in the project panel: the agents of the project as cards, same look as the
// activity and tool catalogs, and an optional "what about?" line. Picking one opens the chosen
// AI as that agent for a conversation (the "talk" action, scripts/lib/core.ts), not an activity.

import { useEffect, useState } from 'react';
import type { AgentInfo } from '../api';
import { t } from '../i18n';
import { CatIcon } from './CatIcon';
import { IconX } from './Icons';

interface Props {
  agents: AgentInfo[]; // usable and on in this project
  tool: string; // the AI it opens in, for the intro
  onPick: (agent: string, note: string) => void;
  onClose: () => void;
}

export function AgentCatalog({ agents, tool, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const list = agents.filter((a) => !q || `${a.name} ${a.description} ${a.category}`.toLowerCase().includes(q));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal catalog" role="dialog" aria-modal="true" aria-labelledby="agent-catalog-title">
        <header className="modal-head">
          <div>
            <h2 id="agent-catalog-title">{t('Who do you want to talk to?')}</h2>
            <p className="muted small">{t('A conversation with the agent in {tool}, about anything: no activity starts and nothing is written unless you ask.', { tool })}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        <div className="modal-body">
          <div className="agent-catalog-tools">
            <input type="text" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={t('What about? (optional)')} aria-label={t('What about? (optional)')} autoFocus />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search agents')} aria-label={t('Search agents')} />
          </div>
          {!list.length && <p className="muted small">{agents.length ? t('No agent matches.') : t('No agent is on in this project. Agents reach projects through their tags in Settings › Agents.')}</p>}
          <ul className="catalog-grid">
            {list.map((a) => (
              <li key={a.name}>
                <button type="button" className="catalog-card" title={a.description || undefined} onClick={() => { onPick(a.name, note.trim()); onClose(); }}>
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
        </div>
      </div>
    </div>
  );
}
