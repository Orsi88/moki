// First screen: choose the workspace to open, like Obsidian's vault switcher.
// A workspace is a folder with its own projects, tags and settings.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type WorkspaceInfo } from '../api';
import { t } from '../i18n';
import { StartPrefs } from '../components/PrefsCorner';
import { AddButton } from '../components/AddButton';
import { IconArrowLeft, IconChevron, IconEdit, IconOpenProject, IconSettings, IconStar, IconTrash, IconX } from '../components/Icons';
import { featuredWorkspaces, recordWorkspaceUse, setWorkspaceFavorite, workspaceFavorites, workspaceUsage } from '../prefs';

interface Props { version: string; onOpen: (workspace: WorkspaceInfo) => void }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CAT = `./${encodeURIComponent('Curious Cat Peeking in a Box.png')}`;

export function WorkspacePicker({ version, onOpen }: Props) {
  const [list, setList] = useState<WorkspaceInfo[]>([]);
  const [active, setActive] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState<string | null>(null); // null: inside the Moki folder
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [managing, setManaging] = useState(false);
  const [listingAll, setListingAll] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(workspaceFavorites);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = () => api.workspaces().then((r) => { setList(r.list); setActive(r.active); }).catch((e) => setError(message(e))).finally(() => setReady(true));
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<WorkspaceInfo | null>) => {
    setBusy(true); setError('');
    try { const w = await fn(); if (w) { recordWorkspaceUse(w.id); onOpen(w); } } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  const create = (e: FormEvent) => { e.preventDefault(); void run(() => api.createWorkspace(name, location)); };
  const closeCreate = () => { setCreating(false); setName(''); setLocation(null); setError(''); };
  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    try { await api.renameWorkspace(renaming.id, renaming.name); setRenaming(null); await load(); } catch (err) { setError(message(err)); }
  };
  const forget = async (w: WorkspaceInfo) => {
    if (!window.confirm(t('Remove {name} from the list? Its folder and files stay on this computer: {path}', { name: w.name, path: w.path }))) return;
    try { await api.forgetWorkspace(w.id); await load(); } catch (e) { setError(message(e)); }
  };
  const pickLocation = () => { api.chooseWorkspaceLocation().then((p) => { if (p) setLocation(p); }).catch((e) => setError(message(e))); };
  const ranked = useMemo(() => {
    const usage = workspaceUsage();
    return [...list].sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0));
  }, [list]);
  const featured = featuredWorkspaces(list);
  const allVisible = ranked.filter((w) => `${w.name} ${w.path}`.toLowerCase().includes(workspaceSearch.toLowerCase().trim()));
  // The built-in workspace is always there. Create and open-folder stay on this screen only until the person adds another one; after that they live on Manage workspaces.
  const showSetup = ready && list.every((w) => w.isDefault);
  const closeManager = () => { setManaging(false); setRenaming(null); setWorkspaceSearch(''); };
  const closeAll = () => { setListingAll(false); setWorkspaceSearch(''); };
  const createDialog = (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) closeCreate(); }}>
      <form className="modal quick-project" role="dialog" aria-modal="true" aria-labelledby="workspace-title" onSubmit={create}>
        <header className="modal-head">
          <div>
            <h2 id="workspace-title">{t('Create a new workspace')}</h2>
            <p className="muted small">{t('A separate place for other projects, with its own tags and settings.')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={closeCreate} disabled={busy} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        <div className="modal-body">
          <label className="field">
            <strong>{t('Workspace name')}</strong>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Client X')} maxLength={60} onKeyDown={(e) => { if (e.key === 'Escape') closeCreate(); }} />
          </label>
          <div className="field">
            <span className="label">{t('Where')}</span>
            <span className="row-actions workspace-location">
              <code className="small">{location ?? t('In the Moki folder (workspaces/)')}</code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={pickLocation} disabled={busy}>{t('Change…')}</button>
              {location && <button type="button" className="icon-btn" onClick={() => setLocation(null)} title={t('Back to the Moki folder')}><IconX size={14} /></button>}
            </span>
          </div>
          {error && <p className="error small">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={closeCreate} disabled={busy}>{t('Cancel')}</button>
          <button type="submit" className="btn" disabled={busy || !name.trim()}>{busy ? t('Creating…') : t('Create workspace')}</button>
        </footer>
      </form>
    </div>
  );

  if (managing) return (
    <div className="picker workspace-management-page">
      <StartPrefs />
      <main className="workspace-management-main">
        <header className="workspace-management-header">
          <button type="button" className="icon-btn back-arrow" onClick={closeManager} title={t('Back')} aria-label={t('Back')}><IconArrowLeft size={18} /></button>
          <h1>{t('Manage workspaces')}</h1>
        </header>
        <input className="workspace-search" type="search" autoFocus aria-label={t('Search')} placeholder={t('Search')} value={workspaceSearch} onChange={(e) => setWorkspaceSearch(e.target.value)} />
        {error && <p className="error small" role="alert">{error}</p>}
        <div className="workspace-manager-list">
          {allVisible.map((w) => renaming?.id === w.id ? (
            <form key={w.id} className="workspace-manage-row workspace-manage-edit" onSubmit={(e) => { void rename(e); }}>
              <input autoFocus value={renaming.name} maxLength={60} aria-label={t('Workspace name')} onChange={(e) => setRenaming({ id: w.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
              <button type="submit" className="btn btn-sm" disabled={!renaming.name.trim()}>{t('Save')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>{t('Cancel')}</button>
            </form>
          ) : (
            <div key={w.id} className="workspace-manage-row">
              <div className="workspace-manage-info"><strong>{w.name}</strong><span className="muted small">{w.path}</span></div>
              <span className="workspace-manage-actions">
                <button type="button" className={`icon-btn workspace-action-star${favorites.includes(w.id) ? ' is-favorite' : ''}`} aria-pressed={favorites.includes(w.id)} aria-label={favorites.includes(w.id) ? t('Remove {name} from favorites', { name: w.name }) : t('Add {name} to favorites', { name: w.name })} onClick={() => setFavorites(setWorkspaceFavorite(w.id, !favorites.includes(w.id)))}><IconStar size={16} /></button>
                <button type="button" className="icon-btn workspace-action-edit" title={t('Rename')} aria-label={t('Rename {name}', { name: w.name })} onClick={() => setRenaming({ id: w.id, name: w.name })}><IconEdit size={16} /></button>
                <button type="button" className="icon-btn workspace-action-delete" disabled={w.isDefault} title={t('Remove from the list')} aria-label={t('Remove {name} from the list', { name: w.name })} onClick={() => { void forget(w); }}><IconTrash size={16} /></button>
              </span>
            </div>
          ))}
          {allVisible.length === 0 && <p className="muted small">{t('No workspaces found.')}</p>}
        </div>
        <div className="home-actions workspace-setup">
          <div className="home-action">
            <div>
              <strong>{t('Create a new workspace')}</strong>
              <p className="muted small">{t('A separate place for other projects, with its own tags and settings.')}</p>
            </div>
            <AddButton size="lg" title={t('Create')} onClick={() => setCreating(true)} />
          </div>
          <div className="home-action">
            <div>
              <strong>{t('Open a folder as a workspace')}</strong>
              <p className="muted small">{t('A folder you already have. Moki adds a projects folder inside it.')}</p>
            </div>
            <button type="button" className="home-action-icon" disabled={busy} onClick={() => { void run(() => api.openWorkspaceFolder()); }}
              title={t('Open a folder as a workspace')} aria-label={t('Open a folder as a workspace')}><IconOpenProject size={20} /></button>
          </div>
        </div>
        {creating && createDialog}
      </main>
    </div>
  );

  return (
    <div className="picker">
      <StartPrefs />
      <main className="picker-main">
        <img className="picker-cat" src={CAT} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <h1>Moki</h1>
        <p className="muted">{t('Choose a workspace')} · {t('Version {version}', { version })}</p>

        {error && <p className="error small" role="alert">{error}</p>}

        <ul className="picker-list">
          {featured.map((w) => (
            <li key={w.id} className="picker-row">
              {renaming?.id === w.id ? (
                <form className="picker-rename" onSubmit={(e) => { void rename(e); }}>
                  <input autoFocus value={renaming.name} maxLength={60} aria-label={t('Workspace name')}
                    onChange={(e) => setRenaming({ id: w.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
                  <button type="submit" className="btn btn-sm" disabled={!renaming.name.trim()}>{t('Save')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>{t('Cancel')}</button>
                </form>
              ) : <>
                <button type="button" className={`picker-open${w.id === active ? ' last' : ''}`} disabled={busy || w.missing}
                  onClick={() => { void run(() => api.selectWorkspace(w.id)); }} title={w.path}>
                  <span className="picker-name">{w.name}</span>
                  <span className="picker-meta">
                    {w.missing ? t('Folder not found') : `${w.projects} ${w.projects === 1 ? t('project') : t('projects')}`}
                    {w.id === active && <> · {t('last opened')}</>}
                  </span>
                  <span className="picker-path">{w.path}</span>
                  <IconChevron size={16} />
                </button>
              </>}
            </li>
          ))}
        </ul>
        <div className="picker-list-foot">
          <button type="button" className="picker-list-all" onClick={() => setListingAll(true)}>{t('Read all...')}</button>
        </div>
        <button type="button" className="btn btn-ghost picker-manage" onClick={() => setManaging(true)} title={t('Manage')} aria-label={t('Manage')}>
          <IconSettings size={18} />
        </button>

        {showSetup && (
          <div className="home-actions picker-actions">
            <div className="home-action">
              <div>
                <strong>{t('Create a new workspace')}</strong>
                <p className="muted small">{t('A separate place for other projects, with its own tags and settings.')}</p>
              </div>
              <AddButton size="lg" title={t('Create')} onClick={() => setCreating(true)} />
            </div>
            <div className="home-action">
              <div>
                <strong>{t('Open a folder as a workspace')}</strong>
                <p className="muted small">{t('A folder you already have. Moki adds a projects folder inside it.')}</p>
              </div>
              <button type="button" className="home-action-icon" disabled={busy} onClick={() => { void run(() => api.openWorkspaceFolder()); }}
                title={t('Open a folder as a workspace')} aria-label={t('Open a folder as a workspace')}><IconOpenProject size={20} /></button>
            </div>
          </div>
        )}
        {creating && createDialog}
        {listingAll && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeAll(); }}>
            <section className="modal workspace-manager" role="dialog" aria-modal="true" aria-labelledby="workspace-list-title">
              <header className="modal-head">
                <div><h2 id="workspace-list-title">{t('All workspaces')}</h2></div>
                <button type="button" className="icon-btn" onClick={closeAll} title={t('Close (Esc)')}><IconX size={18} /></button>
              </header>
              <div className="modal-body workspace-manager-list">
                <input className="workspace-search" type="search" autoFocus aria-label={t('Search')} placeholder={t('Search')} value={workspaceSearch} onChange={(e) => setWorkspaceSearch(e.target.value)} />
                {allVisible.map((w) => (
                  <button key={w.id} type="button" className="workspace-list-card" disabled={busy || w.missing} onClick={() => { closeAll(); void run(() => api.selectWorkspace(w.id)); }}>
                    <strong>{w.name}</strong>
                    <span className="muted small">{w.path}</span>
                    <span className="muted small">{w.projects} {w.projects === 1 ? t('project') : t('projects')}</span>
                  </button>
                ))}
                {allVisible.length === 0 && <p className="muted small">{t('No workspaces found.')}</p>}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
