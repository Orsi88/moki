// Activity catalog: every activity as a card, with a search, to choose "what to do" in the
// side panel. An activity is an entry point; each one runs one of Moki's own skills (several
// activities can share a skill, e.g. "Project context" and "Prepare the project").
// Each card shows the activity's cat from the cat library (icons/cats.ts).
// ActivityPick is the field that opens it.

import { useState } from 'react';
import type { ActivityInfo } from '../api';
import { t } from '../i18n';
import { ACTIVITY_CAT } from '../icons/cats';
import { CatIcon } from './CatIcon';
import { CatalogModal, matchesQuery } from './CatalogModal';
import { IconChevron } from './Icons';

interface Props {
  activities: ActivityInfo[];
  selected: string;
  onPick: (id: string) => void;
  onClose: () => void;
  blocked?: (activity: ActivityInfo) => string | null; // a reason when it cannot be chosen here
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function ActivityCatalog({ activities, selected, onPick, onClose, blocked }: Props) {
  const [query, setQuery] = useState('');
  const everything = activities.filter((a) => a.id !== 'resume');
  const list = everything.filter((a) => matchesQuery(query, t(a.label), t(a.hint), a.skill, a.category));

  return (
    <CatalogModal titleId="catalog-title" title={t('What do you want to do?')} hint={t('Each activity runs one of the skills that come with Moki.')} onClose={onClose}
      search={{ value: query, onChange: setQuery, placeholder: t('Search activities') }}>
      {!list.length && <p className="muted small">{t('No activity matches.')}</p>}
      <ul className="catalog-grid">
        {list.map((a) => (
          <li key={a.id}>
            <button type="button" className={`catalog-card${a.id === selected ? ' on' : ''}`} disabled={!a.available || Boolean(blocked?.(a))}
              aria-pressed={a.id === selected} onClick={() => { onPick(a.id); onClose(); }}>
              <span className="catalog-top">
                <span className="catalog-num">{String(everything.indexOf(a) + 1).padStart(2, '0')}</span>
                <span className="catalog-skill">{a.skill}</span>
              </span>
              <span className="catalog-main">
                <span className="catalog-emblem" aria-hidden="true"><CatIcon id={ACTIVITY_CAT[a.id] ?? 'run'} size={64} /></span>
                <span className="catalog-text">
                  <span className="catalog-title">{t(a.label)}</span>
                  {a.hint && <span className="catalog-hint">{capitalize(t(a.hint))}</span>}
                </span>
              </span>
              <span className="catalog-tags">
                {!a.available ? <span className="catalog-tag muted-tag">{t('Not available yet')}</span>
                  : blocked?.(a) ? <span className="catalog-tag muted-tag">{blocked(a)}</span>
                  : a.needsFiles ? <span className="catalog-tag">{t('Uses inbox files')}</span>
                    : <span className="catalog-tag">{t('Starts right away')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CatalogModal>
  );
}

export function ActivityPick({ activities, value, onChange, label }: { activities: ActivityInfo[]; value: string; onChange: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const activity = activities.find((a) => a.id === value);
  return (
    <div className="pp-field">
      <span className="pp-field-label">{label}</span>
      <button type="button" className={`pp-pick${activity ? '' : ' empty'}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {activity && <CatIcon id={ACTIVITY_CAT[activity.id] ?? 'run'} size={26} />}
        <span className="pp-pick-label">{activity ? t(activity.label) : t('Choose an activity')}</span>
        <IconChevron size={14} />
      </button>
      {activity?.hint && <span className="pp-hint">{capitalize(t(activity.hint))}</span>}
      {activity?.needsFiles && <span className="pp-hint">{t('Next, you pick the inbox files it should use.')}</span>}
      {open && <ActivityCatalog activities={activities} selected={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}
