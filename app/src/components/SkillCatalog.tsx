// Choosing a skill to start from the project panel: the skill and the AI, the same
// cards as the agent and activity catalogs. The request then names that skill.

import { useState } from 'react';
import type { SkillInfo } from '../api';
import { t } from '../i18n';
import { CatIcon } from './CatIcon';
import { CatalogModal, matchesQuery } from './CatalogModal';
import { IconChevron } from './Icons';

interface Props {
  skills: SkillInfo[];
  selected: string;
  onPick: (skill: string) => void;
  onClose: () => void;
}

export function SkillCatalog({ skills, selected, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const list = skills.filter((s) => matchesQuery(query, s.name, s.description, s.status));

  return (
    <CatalogModal titleId="skill-catalog-title" title={t('Choose a skill')} onClose={onClose}
      search={{ value: query, onChange: setQuery, placeholder: t('Search skills') }}>
      {!list.length && <p className="muted small">{t('No skill matches.')}</p>}
      <ul className="catalog-grid">
        {list.map((s) => (
          <li key={s.name}>
            <button type="button" className={`catalog-card${s.name === selected ? ' on' : ''}`} aria-pressed={s.name === selected} title={s.description || undefined} onClick={() => { onPick(s.name); onClose(); }}>
              <span className="catalog-top">
                <span className="catalog-num">{t('Skill')}</span>
                {s.status && <span className="catalog-skill">{s.status}</span>}
              </span>
              <span className="catalog-main">
                <span className="catalog-emblem" aria-hidden="true"><CatIcon id="puzzle" size={64} /></span>
                <span className="catalog-text">
                  <span className="catalog-title">{s.name}</span>
                  {s.description && <span className="catalog-hint">{s.description}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CatalogModal>
  );
}

export function SkillPick({ skills, value, onChange }: { skills: SkillInfo[]; value: string; onChange: (skill: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pp-field">
      <span className="pp-field-label">{t('Skill')}</span>
      <button type="button" className={`pp-pick${value ? '' : ' empty'}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {value && <CatIcon id="puzzle" size={26} />}
        <span className="pp-pick-label">{value || t('Choose a skill')}</span>
        <IconChevron size={14} />
      </button>
      {open && <SkillCatalog skills={skills} selected={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}
