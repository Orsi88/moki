// The notebook: the note window, with tabs. One per group. Loose notes show the
// ones opened here (closable, + for a new one); a project shows all its notes
// (+ for a new one). A tab, once shown, stays mounted; notes save on their own,
// also when a tab is closed.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import { favoriteNotes, looseNotes, noteTitle, type NoteRef } from '../side-menu';
import { NoteDialog } from './NoteDialog';
import { IconPlus, IconX } from './Icons';

interface Props {
  project: string | null; // null: the loose notes
  path: string | null; // the note asked for (project)
  loose: string | null; // the note asked for (loose): an id, or 'new'
  projects: { id: string; name: string }[];
}

// A tab: a saved note, or a new one (ref null) until its first save. The id stays when a new note is saved,
// so the note is not opened again while it is being written.
interface Tab { id: string; ref: NoteRef | null }

let counter = 0;
const newTab = (): Tab => ({ id: `new-${++counter}`, ref: null });
const tabOf = (ref: NoteRef): Tab => ({ id: 'loose' in ref ? `loose:${ref.loose}` : `file:${ref.path}`, ref });
const same = (a: NoteRef | null, b: NoteRef) => Boolean(a) && ('loose' in b ? a !== null && 'loose' in a && a.loose === b.loose : a !== null && 'path' in a && a.path === b.path);

export function Notebook({ project, path, loose, projects }: Props) {
  const first = (): Tab => (project ? (path ? tabOf({ project, path }) : newTab()) : loose && loose !== 'new' ? tabOf({ loose }) : newTab());
  const [opened, setOpened] = useState<Tab[]>(() => [first()]); // loose: the tabs; project: the tabs opened here
  const [notes, setNotes] = useState<string[]>([]); // project: all its notes
  const [titles, setNoteTitles] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState(() => opened[0].id);
  const [shown, setShown] = useState<Set<string>>(() => new Set([activeId])); // tabs mounted so far
  const [, setTitles] = useState(0); // loose titles change as they are saved
  const starts = useRef(new Map<string, NoteRef | null>()); // the note each tab's editor was opened with

  const loadNotes = useCallback(() => {
    if (!project) return;
    void api.noteTitles(project).then((items) => setNoteTitles(Object.fromEntries(items.map((item) => [item.path, item.title])))).catch(() => setNoteTitles({}));
    api.tree(project).then((nodes) => {
      const folder = nodes.find((n) => n.path === 'notes');
      const favorites = new Set(favoriteNotes().filter((n) => n.project === project).map((n) => n.path));
      setNotes((folder?.children ?? []).filter((n) => n.type === 'file' && /^notes\/[^/]+\.md$/.test(n.path)).map((n) => n.path)
        .sort((a, b) => Number(favorites.has(b)) - Number(favorites.has(a))));
    }).catch(() => setNotes([]));
  }, [project]);
  useEffect(() => { loadNotes(); window.addEventListener('focus', loadNotes); return () => window.removeEventListener('focus', loadNotes); }, [loadNotes]);

  // A project shows every note; one opened here keeps its tab (and id).
  const tabs: Tab[] = project
    ? [
      ...notes.map((p) => opened.find((x) => same(x.ref, { project, path: p })) ?? tabOf({ project, path: p })),
      ...opened.filter((x) => !x.ref || ('path' in x.ref && !notes.includes(x.ref.path))),
    ]
    : opened;

  const show = (id: string) => { setActiveId(id); setShown((s) => new Set(s).add(id)); };
  const add = (tab: Tab) => {
    const there = tab.ref ? tabs.find((x) => same(x.ref, tab.ref as NoteRef)) : undefined;
    if (there) { show(there.id); return; }
    setOpened((all) => [...all, tab]);
    show(tab.id);
  };

  // Another note of this group, sent from the main window.
  useEffect(() => window.qa?.onNotebookOpen?.((target) => {
    if (project ? target.project !== project : target.project) return;
    if (target.path && project) { loadNotes(); add(tabOf({ project, path: target.path })); return; }
    if (target.loose && target.loose !== 'new') { add(tabOf({ loose: target.loose })); return; }
    add(newTab());
  }));

  const close = (tab: Tab) => {
    const rest = tabs.filter((x) => x.id !== tab.id);
    if (!rest.length) { window.close(); return; }
    setOpened((all) => all.filter((x) => x.id !== tab.id));
    setShown((s) => { const n = new Set(s); n.delete(tab.id); return n; });
    if (activeId === tab.id) show(rest[Math.max(0, tabs.indexOf(tab) - 1)].id);
  };

  // Each save says where the note is: a new one gets its place; a loose note sent to a project goes to that project's notebook.
  const saved = (tab: Tab, ref: NoteRef) => {
    setTitles((n) => n + 1);
    if (!project && !('loose' in ref)) {
      void api.openNoteWindow(ref);
      close(tab);
      return;
    }
    if (same(tab.ref, ref)) return;
    setOpened((all) => (all.some((x) => x.id === tab.id) ? all.map((x) => (x.id === tab.id ? { ...x, ref } : x)) : [...all, { id: tab.id, ref }]));
    if (project) loadNotes();
  };

  const label = (tab: Tab): string => {
    if (!tab.ref) return t('New note');
    if ('path' in tab.ref) return titles[tab.ref.path] ?? noteTitle(tab.ref.path);
    const id = tab.ref.loose;
    return looseNotes().find((n) => n.id === id)?.title || t('Note');
  };
  const closable = (tab: Tab) => !project || !tab.ref;

  return (
    <div className="notebook">
      <div className="notebook-tabs" role="tablist" aria-label={project ? projects.find((p) => p.id === project)?.name ?? project : t('Loose notes')}>
        {tabs.map((tab) => (
          <div key={tab.id} role="tab" aria-selected={tab.id === activeId} className={`notebook-tab${tab.id === activeId ? ' active' : ''}`}
            draggable={Boolean(tab.ref)} onDragStart={(e) => { if (tab.ref) { e.dataTransfer.setData('application/x-moki-note', JSON.stringify(tab.ref)); e.dataTransfer.effectAllowed = 'copy'; } }}>
            <button type="button" className="notebook-tab-label" onClick={() => show(tab.id)} title={label(tab)}>
              <span>{label(tab)}</span>
            </button>
            {closable(tab) && (
              <button type="button" className="notebook-tab-close" onClick={() => close(tab)} title={t('Close tab')} aria-label={t('Close tab')}><IconX size={12} /></button>
            )}
          </div>
        ))}
        <button type="button" className="icon-btn notebook-new" onClick={() => add(newTab())} title={t('New note')} aria-label={t('New note')}><IconPlus size={15} /></button>
      </div>
      {tabs.filter((tab) => shown.has(tab.id)).map((tab) => {
        // The editor keeps the note it was opened with; a new note finds its file on its own as it saves.
        if (!starts.current.has(tab.id)) starts.current.set(tab.id, tab.ref);
        const start = starts.current.get(tab.id) ?? null;
        return (
          <div key={tab.id} className="notebook-page" hidden={tab.id !== activeId}>
            <NoteDialog
              project={start && 'path' in start ? start.project : project}
              path={start && 'path' in start ? start.path : null}
              looseId={start && 'loose' in start ? start.loose : null}
              projects={projects}
              floating
              active={tab.id === activeId}
              onClose={() => window.close()}
              onSaved={(ref) => saved(tab, ref)}
            />
          </div>
        );
      })}
    </div>
  );
}
