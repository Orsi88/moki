// What the start-screen sidebar remembers on this computer: which projects stay
// pinned, notes that were not sent to a project, the project notes opened
// most recently and the favorite notes. Pins, hidden projects, recent and favorite
// project notes are kept per workspace; loose notes belong to no workspace.

import { recall, remember } from './prefs';

const PINS = 'qa-pinned-projects';
const HIDDEN = 'qa-hidden-projects';
const NOTES = 'qa-recent-notes';
const LOOSE = 'qa-loose-notes';
const FAVORITES = 'qa-favorite-notes';
const LOOSE_FAVORITES = 'qa-favorite-loose-notes';
const RECENT_FILES = 'qa-recent-files';
const NOTE_LIMIT = 6;

// The active workspace; the default one keeps the original keys.
let scope = '';
export const setMenuWorkspace = (id: string): void => { scope = id && id !== 'default' ? `:${id}` : ''; };
const PINS_KEY = () => PINS + scope;
const HIDDEN_KEY = () => HIDDEN + scope;
const NOTES_KEY = () => NOTES + scope;
const FAVORITES_KEY = () => FAVORITES + scope;

export interface RecentNote { project: string; path: string; title: string; at: number }
export interface RecentFile { project: string; path: string }
export type NoteRef = { project: string; path: string } | { loose: string };
export interface LooseNote { id: string; title: string; text: string; at: number }

const readList = (key: string): unknown[] => {
  try { const v = JSON.parse(recall(key) ?? ''); return Array.isArray(v) ? v : []; } catch { return []; }
};

export const recentFiles = (): RecentFile[] => readList(RECENT_FILES + scope).flatMap((item) => {
  const file = (item ?? {}) as Partial<RecentFile>;
  return typeof file.project === 'string' && typeof file.path === 'string' ? [{ project: file.project, path: file.path }] : [];
});
export const touchRecentFile = (project: string, path: string): void => {
  const next = [{ project, path }, ...recentFiles().filter((file) => file.project !== project || file.path !== path)].slice(0, 20);
  remember(RECENT_FILES + scope, JSON.stringify(next));
};

export const pinnedIds = (): string[] => readList(PINS_KEY()).filter((id): id is string => typeof id === 'string');

export const togglePin = (id: string): string[] => {
  const cur = pinnedIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
  remember(PINS_KEY(), JSON.stringify(next));
  return next;
};

export const hiddenIds = (): string[] => readList(HIDDEN_KEY()).filter((id): id is string => typeof id === 'string');

// Hides the project from this computer's list. The folder stays. A pin is dropped so it does not come back pinned.
export const hideProject = (id: string): string[] => {
  const next = hiddenIds().includes(id) ? hiddenIds() : [id, ...hiddenIds()];
  remember(HIDDEN_KEY(), JSON.stringify(next));
  remember(PINS_KEY(), JSON.stringify(pinnedIds().filter((x) => x !== id)));
  return next;
};

export const showProject = (id: string): string[] => {
  const next = hiddenIds().filter((x) => x !== id);
  remember(HIDDEN_KEY(), JSON.stringify(next));
  return next;
};

// A deleted project leaves no pin, hidden entry or recent note behind.
export const forgetProject = (id: string): void => {
  remember(RECENT_FILES + scope, JSON.stringify(recentFiles().filter((file) => file.project !== id)));
  remember(PINS_KEY(), JSON.stringify(pinnedIds().filter((x) => x !== id)));
  remember(HIDDEN_KEY(), JSON.stringify(hiddenIds().filter((x) => x !== id)));
  remember(NOTES_KEY(), JSON.stringify(recentNotes().filter((n) => n.project !== id)));
  remember(FAVORITES_KEY(), JSON.stringify(favoriteNotes().filter((n) => n.project !== id)));
};

export const noteTitle =(path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/, '').replace(/-/g, ' ');

export const looseNotes = (): LooseNote[] => readList(LOOSE).flatMap((item) => {
  if (!item || typeof item !== 'object') return [];
  const n = item as Partial<LooseNote>;
  if (typeof n.id !== 'string' || typeof n.title !== 'string') return [];
  return [{ id: n.id, title: n.title, text: typeof n.text === 'string' ? n.text : '', at: typeof n.at === 'number' ? n.at : 0 }];
});

// A note that stays on this computer until it is sent to a project. Same id updates the existing one.
export const saveLooseNote = (note: { id?: string | null; title: string; text: string }): LooseNote => {
  const saved: LooseNote = { id: note.id || crypto.randomUUID(), title: note.title.trim(), text: note.text, at: Date.now() };
  const next = [saved, ...looseNotes().filter((n) => n.id !== saved.id)];
  try { window.localStorage.setItem(LOOSE, JSON.stringify(next)); } catch { throw new Error('Could not save the note on this computer.'); }
  return saved;
};

// A project note that was deleted: out of the recent list and the favorites.
export const forgetNote = (project: string, path: string): void => {
  remember(NOTES_KEY(), JSON.stringify(recentNotes().filter((n) => !(n.project === project && n.path === path))));
  remember(FAVORITES_KEY(), JSON.stringify(favoriteNotes().filter((n) => !(n.project === project && n.path === path))));
};

export const removeLooseNote = (id: string): void => {
  remember(LOOSE, JSON.stringify(looseNotes().filter((n) => n.id !== id)));
  remember(LOOSE_FAVORITES, JSON.stringify(favoriteLooseIds().filter((x) => x !== id)));
};

// Favorite notes: the star in the note, the tree and the start screen. Newest first.
export const favoriteNotes = (): { project: string; path: string }[] => readList(FAVORITES_KEY()).flatMap((item) => {
  const n = (item ?? {}) as { project?: unknown; path?: unknown };
  return typeof n.project === 'string' && typeof n.path === 'string' && n.path.startsWith('notes/') ? [{ project: n.project, path: n.path }] : [];
});
export const favoriteLooseIds = (): string[] => readList(LOOSE_FAVORITES).filter((id): id is string => typeof id === 'string');

export const isFavorite = (note: NoteRef): boolean => ('loose' in note
  ? favoriteLooseIds().includes(note.loose)
  : favoriteNotes().some((n) => n.project === note.project && n.path === note.path));

// Turns the star on or off; returns whether the note is now a favorite.
export const setFavorite = (note: NoteRef, on: boolean): boolean => {
  if ('loose' in note) {
    const rest = favoriteLooseIds().filter((x) => x !== note.loose);
    remember(LOOSE_FAVORITES, JSON.stringify(on ? [note.loose, ...rest] : rest));
  } else {
    const rest = favoriteNotes().filter((n) => !(n.project === note.project && n.path === note.path));
    remember(FAVORITES_KEY(), JSON.stringify(on ? [{ project: note.project, path: note.path }, ...rest] : rest));
  }
  return on;
};

export const recentNotes = (): RecentNote[] => readList(NOTES_KEY()).flatMap((item) => {
  if (!item || typeof item !== 'object') return [];
  const n = item as Partial<RecentNote>;
  if (typeof n.project !== 'string' || typeof n.path !== 'string' || !n.path.startsWith('notes/')) return [];
  return [{ project: n.project, path: n.path, title: typeof n.title === 'string' && n.title ? n.title : noteTitle(n.path), at: typeof n.at === 'number' ? n.at : 0 }];
});

// Opening or saving a note moves it to the front. The same file is not listed twice.
export const touchNote = (project: string, path: string, title: string): void => {
  if (!path.startsWith('notes/')) return;
  touchRecentFile(project, path);
  const next = [{ project, path, title: title.trim() || noteTitle(path), at: Date.now() },
    ...recentNotes().filter((n) => !(n.project === project && n.path === path))].slice(0, NOTE_LIMIT);
  remember(NOTES_KEY(), JSON.stringify(next));
};
