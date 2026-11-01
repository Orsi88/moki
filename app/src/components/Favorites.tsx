// Favorites in the lists of Settings (scripts/lib/favorites.ts): the golden star on a card, and
// the starred items first. useFavorites(kind) reads the workspace's favorites of one kind once;
// a click changes the star at once and saves it.

import { useCallback, useEffect, useState } from 'react';
import { api, type FavoriteKind } from '../api';
import { t } from '../i18n';
import { IconStar } from './Icons';

export function useFavorites(kind: FavoriteKind) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => { api.favorites().then((all) => setIds(all[kind] ?? [])).catch(() => setIds([])); }, [kind]);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => {
    const on = !ids.includes(id);
    setIds((now) => (on ? [...now, id] : now.filter((x) => x !== id)));
    api.setFavorite(kind, id, on).then(setIds).catch(() => { /* the star goes back on the next load */ });
  }, [ids, kind]);
  // The starred items first; a stable sort keeps the order of the rest.
  const first = useCallback(<T,>(list: T[], idOf: (item: T) => string): T[] => [...list].sort((a, b) => Number(ids.includes(idOf(b))) - Number(ids.includes(idOf(a)))), [ids]);
  return { has, toggle, first };
}

export function StarButton({ on, name, onToggle, disabled }: { on: boolean; name: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`icon-btn star-btn${on ? ' on' : ''}`} disabled={disabled} aria-pressed={on}
      title={on ? t('Remove from favorites') : t('Add to favorites')} aria-label={t('Favorite: {name}', { name })} onClick={onToggle}>
      <IconStar size={16} />
    </button>
  );
}
