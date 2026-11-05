// The magnifier on the icon rail: searches the projects and the text files of the
// active workspace, by text and/or tags. It takes the place of the left list.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type SearchResult, type Tag } from '../api';
import { t } from '../i18n';
import { FileIcon } from '../icons';
import { TagChip } from './TagPicker';
import { IconBroom, IconChevron } from './Icons';
import { recentFiles, recentNotes } from '../side-menu';

interface Props {
  onOpenProject: (project: string) => void;
  onOpenFile: (project: string, path: string) => void;
  onClose: () => void;
}

const EMPTY: SearchResult = { projects: [], files: [], truncated: false };

// The match in bold.
function mark(text: string, q: string): ReactNode {
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

export function SearchPanel({ onOpenProject, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const tagPickerRef = useRef<HTMLDetailsElement>(null);
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<{ project: string; path: string; projectName: string }[]>([]);
  useEffect(() => { api.tags().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const picker = tagPickerRef.current;
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) picker.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  useEffect(() => {
    const loadRecent = () => { void api.projects().then((projects) => {
      const files = recentFiles();
      const olderNotes = recentNotes().filter((note) => !files.some((file) => file.project === note.project && file.path === note.path));
      setRecent([...files, ...olderNotes].slice(0, 20).flatMap((file) => {
        const project = projects.find((item) => item.id === file.project);
        return project ? [{ ...file, projectName: project.name }] : [];
      }));
    }).catch(() => setRecent([])); };
    loadRecent();
    window.addEventListener('storage', loadRecent);
    return () => window.removeEventListener('storage', loadRecent);
  }, []);

  useEffect(() => {
    if (!query.trim() && !tags.length) { setResult(EMPTY); setLoading(false); return; }
    let current = true;
    setLoading(true); setResult(EMPTY);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const projects = await api.projects();
          for (const project of projects) {
            if (!current) return;
            const r = await api.searchExpanded(query, tags, project.id);
            if (current) setResult((previous) => ({ projects: [...previous.projects, ...r.projects], files: [...previous.files, ...r.files], truncated: previous.truncated || r.truncated }));
          }
          if (current) setError('');
        } catch (e) { if (current) setError(e instanceof Error ? e.message : String(e)); }
        finally { if (current) setLoading(false); }
      })();
    }, 200);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, tags]);

  const q = query.trim().replace(/^(projeto|project|arquivo|file|conteudo|conteúdo|content):\s*/i, '');
  const searching = Boolean(q || tags.length);
  const toggle = (id: string) => setTags((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="search-panel" role="search">
      <div className="search-box">
        <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search projects, files or content')}
          aria-label={t('Search projects and files')} onKeyDown={(e) => { if (e.key === 'Escape') { if (query) setQuery(''); else onClose(); } }} />
        <button type="button" className="icon-btn" onClick={() => setQuery('')} title={t('Clear search')} aria-label={t('Clear search')}><IconBroom size={21} /></button>
      </div>
      <div className="search-tag-filter" role="group" aria-label={t('Filter by tag')}>
        {catalog.filter((tag) => tags.includes(tag.id)).map((tag) => <TagChip key={tag.id} tag={tag} onRemove={() => toggle(tag.id)} />)}
        <details className="search-tag-picker" ref={tagPickerRef}>
          <summary>{t('+ tag')}</summary>
          <div className="search-tag-options">
            {catalog.map((tag) => <button key={tag.id} type="button" aria-pressed={tags.includes(tag.id)} onClick={() => toggle(tag.id)}>
              <TagChip tag={tag} />{tags.includes(tag.id) && <span aria-hidden="true">✓</span>}
            </button>)}
            {catalog.length === 0 && <span className="muted small">{t('No tags available.')}</span>}
          </div>
        </details>
      </div>
      <div className="search-results">
        {!searching && recent.length > 0 && <>
          <div className="home-list-head">{t('Recent files')}</div>
          <ul>{recent.map((file) => <li key={`${file.project}/${file.path}`}>
            <button type="button" className="search-hit" onClick={() => onOpenFile(file.project, file.path)}>
              <span className="search-hit-head"><FileIcon name={file.path} size={14} /><span className="search-hit-name">{file.path.split('/').pop()}</span></span>
              <span className="search-hit-where">{file.projectName} · {file.path}</span>
            </button>
          </li>)}</ul>
        </>}
        {!searching && recent.length === 0 && <p className="muted small search-hint">{t('No recent files yet.')}</p>}
        {error && <p className="error small">{error}</p>}
        {searching && loading && <p className="muted small search-hint">{t('Searching…')}</p>}
        {searching && !loading && !result.projects.length && !result.files.length && !error && <p className="muted small search-hint">{t('Nothing found.')}</p>}
        {result.projects.length > 0 && <>
          <div className="home-list-head">{t('Projects')}</div>
          <ul>
            {result.projects.map((p) => (
              <li key={p.id}>
                <button type="button" className="home-project" onClick={() => onOpenProject(p.id)}>
                  <span className="home-project-name">{mark(p.name, q)}</span>
                  <span className="search-hit-where">{`projects/${p.id}`}</span>
                  <IconChevron size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>}
        {result.files.length > 0 && <>
          <div className="home-list-head">{t('Files')}</div>
          <ul>
            {result.files.map((f) => (
              <li key={`${f.project}/${f.path}`}>
                <button type="button" className="search-hit" onClick={() => onOpenFile(f.project, f.path)} title={`${f.projectName} · ${f.path}`}>
                  <span className="search-hit-head"><FileIcon name={f.path} size={14} /><span className="search-hit-name">{mark(f.path.split('/').pop() ?? f.path, q)}</span></span>
                  <span className="search-hit-where">{f.projectName} · {f.path}</span>
                  {f.snippet && <span className="search-hit-snippet">{mark(f.snippet, q)}</span>}
                </button>
              </li>
            ))}
          </ul>
          {result.truncated && <p className="muted small search-hint">{t('Showing the first results. Refine the search to see others.')}</p>}
        </>}
      </div>
    </div>
  );
}
