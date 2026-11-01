// The skills an agent uses: one row per skill with what it does, and a search field that
// adds one from the installed skills. Without onChange it only lists them. An agent keeps
// at least one skill (scripts/lib/agents.ts validateAgent).

import { useState } from 'react';
import type { SkillInfo } from '../api';
import { t } from '../i18n';
import { IconX } from './Icons';

interface Props { value: string[]; skills: SkillInfo[]; onChange?: (skills: string[]) => void }

const OFF = new Set(['planned', 'pending-migration']); // not available to run

export function SkillsField({ value, skills, onChange }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const about = (name: string) => skills.find((s) => s.name === name)?.description ?? '';
  const query = text.trim().toLowerCase();
  const options = skills.filter((s) => !value.includes(s.name) && !OFF.has(s.status)
    && (!query || s.name.includes(query) || s.description.toLowerCase().includes(query)));
  const add = (name: string) => { onChange?.([...value, name]); setText(''); };

  return (
    <div className="skills-field">
      <ul className="skill-rows">
        {value.map((name) => (
          <li key={name} className="skill-row">
            <div>
              <span className="skill-name">{name}</span>
              {about(name) && <span className="skill-about" title={about(name)}>{about(name)}</span>}
            </div>
            {onChange && (
              <button type="button" className="icon-btn" disabled={value.length < 2} onClick={() => onChange(value.filter((x) => x !== name))}
                title={value.length < 2 ? t('An agent keeps at least one skill.') : t('Remove')} aria-label={`${t('Remove')} ${name}`}><IconX size={14} /></button>
            )}
          </li>
        ))}
      </ul>
      {onChange && (
        <div className="skill-search">
          <input type="search" value={text} placeholder={t('Search a skill to add…')} aria-label={t('Add a skill')}
            onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && options[0]) { e.preventDefault(); add(options[0].name); } if (e.key === 'Escape') setOpen(false); }} />
          {open && (
            <ul className="skill-options" role="listbox" aria-label={t('Skills')}>
              {options.map((s) => (
                <li key={s.name} role="option" aria-selected={false}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); add(s.name); }}>
                    <span className="skill-name">{s.name}</span>
                    <span className="skill-about">{s.description}</span>
                  </button>
                </li>
              ))}
              {!options.length && <li className="muted small skill-none">{t('No other skill matches.')}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
