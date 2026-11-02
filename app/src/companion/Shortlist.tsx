// The IDE panel's lists show the starred items and the most used ones; the rest is found by searching.
// Stars are the workspace's (scripts/lib/favorites.ts), the same as in the app.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FavoriteKind } from '../api';
import { t } from '../i18n';
import { StarButton } from '../components/Favorites';
import { call } from './bridge';

export function useShortlist<T>(kind: FavoriteKind, items: T[], idOf: (item: T) => string, textOf: (item: T) => string) {
  const [stars, setStars] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    call<Record<FavoriteKind, string[]>>('favorites').then((a) => setStars(a[kind] ?? [])).catch(() => setStars([]));
    call<Record<FavoriteKind, string[]>>('mostUsed').then((a) => setUsed(a[kind] ?? [])).catch(() => setUsed([]));
  }, [kind]);
  const toggle = useCallback((id: string) => {
    const on = !stars.includes(id);
    setStars((now) => (on ? [...now, id] : now.filter((x) => x !== id)));
    call<string[]>('setFavorite', kind, id, on).then(setStars).catch(() => { /* the star goes back on the next load */ });
  }, [stars, kind]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (q) return items.filter((i) => textOf(i).toLowerCase().includes(q));
    const keep = items.filter((i) => stars.includes(idOf(i)) || used.includes(idOf(i)));
    // Nothing starred or used yet: the first few, so the tab is not empty.
    return (keep.length ? keep : items.slice(0, 5)).sort((a, b) => Number(stars.includes(idOf(b))) - Number(stars.includes(idOf(a))));
  }, [items, q, stars, used]); // eslint-disable-line react-hooks/exhaustive-deps -- idOf/textOf are stable per tab
  const star = (id: string, name: string) => <StarButton on={stars.includes(id)} name={name} onToggle={() => toggle(id)} />;
  const search = items.length > 0 && (
    <>
      <input type="search" className="mk-search" value={query} placeholder={t('Search')} aria-label={t('Search')} onChange={(e) => setQuery(e.target.value)} />
      {!q && items.length > shown.length && <p className="muted small">{t('Search to find the other {n}', { n: items.length - shown.length })}</p>}
    </>
  );
  return { shown, star, search };
}
