// AI tool catalog: every AI tool Moki can open, as cards, to choose "where" in the
// side panel. Same look as the activity catalog. Tools not found on this computer
// are shown greyed out, so the QA knows they exist; choosing one opens Settings › My AIs to install it.
// AiPick is the field that opens it: the one AI picker of the project panel (call an agent,
// start an activity, the AI of each step of an operation).

import { useState, type ReactNode } from 'react';
import type { ToolInfo, ToolKind } from '../api';
import { t } from '../i18n';
import { CatIcon } from './CatIcon';
import { CatalogModal } from './CatalogModal';
import { IconChevron, IconCode, IconTerminal } from './Icons';

interface Props {
  tools: ToolInfo[]; // terminal and editor tools, installed or not
  selected: string;
  onPick: (id: string) => void;
  onClose: () => void;
  onInstall?: () => void; // Settings › My AIs (a tool not found here)
}

const toolName = (tool: ToolInfo) => t(tool.label).replace(/ \(.*\)$/, '');
// What opens in one click with the project loaded; web chat and "just show the request" need the full wizard.
export const QUICK_KINDS: ToolKind[] = ['terminal', 'editor'];
const KIND_ICON: Partial<Record<ToolKind, ReactNode>> = { terminal: <IconTerminal size={15} />, editor: <IconCode size={15} /> };

export function ToolCatalog({ tools, selected, onPick, onClose, onInstall }: Props) {
  // Installed first, in the tool list's order.
  const list = [...tools.filter((x) => x.available), ...tools.filter((x) => !x.available)];

  return (
    <CatalogModal titleId="tool-catalog-title" title={t('Where should the AI work?')} hint={t('The AI tools Moki can open. Only the ones found on this computer can be chosen.')} onClose={onClose}>
      <ul className="catalog-grid">
        {list.map((tool) => (
          <li key={tool.id}>
            <button type="button" className={`catalog-card${tool.id === selected ? ' on' : ''}${tool.available ? '' : ' missing'}`} disabled={!tool.available && !onInstall}
              aria-pressed={tool.id === selected} onClick={() => { onClose(); if (tool.available) onPick(tool.id); else onInstall?.(); }}>
              <span className="catalog-top">
                <span className="catalog-num">{tool.kind === 'editor' ? t('Editor') : t('Terminal')}</span>
                {tool.command && <span className="catalog-skill">{tool.command}</span>}
              </span>
              <span className="catalog-main">
                <span className="catalog-emblem" aria-hidden="true"><CatIcon id={tool.kind === 'editor' ? 'code' : 'terminal'} size={64} /></span>
                <span className="catalog-text">
                  <span className="catalog-title">{toolName(tool)}</span>
                  <span className="catalog-hint">{tool.kind === 'editor'
                    ? t('Opens your editor with its AI. The request is copied: paste it in the AI chat.')
                    : t('Opens in a terminal tab here, with the project context loaded.')}</span>
                </span>
              </span>
              <span className="catalog-tags">
                <span className={`catalog-tag${tool.available ? '' : ' muted-tag'}`}>{tool.available ? t('Installed') : t('Not installed')}</span>
                {!tool.available && onInstall && <span className="catalog-tag">{t('Install in Settings › My AIs')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CatalogModal>
  );
}

// ids: only these tools (the AIs an operation can run); hideLabel: the label is only the button's name (a row already says what it is for).
export function AiPick({ tools, value, onChange, onInstall, label, hint = true, ids, hideLabel }: {
  tools: ToolInfo[]; value: string; onChange: (id: string) => void; onInstall?: () => void; label: string; hint?: boolean; ids?: string[]; hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pickable = tools.filter((x) => QUICK_KINDS.includes(x.kind) && (!ids || ids.includes(x.id)));
  const tool = pickable.find((x) => x.id === value);
  return (
    <div className="pp-field">
      {!hideLabel && <span className="pp-field-label">{label}</span>}
      <button type="button" className={`pp-pick${tool ? '' : ' empty'}`} onClick={() => setOpen(true)} aria-haspopup="dialog" {...(hideLabel ? { 'aria-label': label } : {})}>
        <span className="pp-pick-kind" aria-hidden="true">{tool && KIND_ICON[tool.kind]}</span>
        <span className="pp-pick-label">{tool ? toolName(tool) : t('Choose an AI')}</span>
        <IconChevron size={14} />
      </button>
      {hint && tool?.kind === 'editor' && <span className="pp-hint">{t('Opens your editor with its AI. The request is copied: paste it in the AI chat.')}</span>}
      {open && <ToolCatalog tools={pickable} selected={value} onPick={onChange} onClose={() => setOpen(false)} onInstall={onInstall} />}
    </div>
  );
}
