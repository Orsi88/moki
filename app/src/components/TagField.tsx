// The tags of a workspace item (an agent, a template, an MCP server, an operation): which
// projects it applies to. The catalog has the workspace's tags and one tag per project
// (scripts/lib/tags.mjs); no tag = every project. Reuses the chips and the field of TagPicker.

import { useEffect, useMemo, useState } from 'react';
import { api, type Tag, type TagCatalog } from '../api';
import { t } from '../i18n';
import { TagPicker } from './TagPicker';

const PROJECT_COLOR = '#64748b';

// The catalog as tags: the workspace's own, then each project as "project:<id>".
export function asTags(catalog: TagCatalog | null): Tag[] {
  if (!catalog) return [];
  return [...catalog.tags, ...catalog.projects.map((p) => ({ id: p.id, name: p.name, color: PROJECT_COLOR, description: t('Project {name}', { name: p.name }) }))];
}

export function useTagCatalog(): [TagCatalog | null, () => void] {
  const [catalog, setCatalog] = useState<TagCatalog | null>(null);
  const load = () => { api.tagCatalog().then(setCatalog).catch(() => setCatalog(null)); };
  useEffect(load, []);
  return [catalog, load];
}

interface Props { value: string[]; onChange: (tags: string[]) => void; catalog: TagCatalog | null; onCatalog?: () => void; label?: string }

export function TagField({ value, onChange, catalog, onCatalog, label }: Props) {
  const tags = useMemo(() => asTags(catalog), [catalog]);
  return (
    <div className="field tag-field">
      {label !== '' && <span className="label">{label ?? t('Projects (tags)')}</span>}
      <TagPicker catalog={tags} value={value} onChange={onChange} onCatalog={() => onCatalog?.()} />
      <span className="muted small">{value.length ? t('Applies to the projects with any of these tags.') : t('No tag: applies to every project of the workspace.')}</span>
    </div>
  );
}

// A filter for lists: every item, or only the ones that reach the chosen tag or project.
export function TagFilter({ catalog, value, onChange }: { catalog: TagCatalog | null; value: string; onChange: (tag: string) => void }) {
  const tags = asTags(catalog);
  return (
    <select className="tag-filter" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('Filter by tag')}>
      <option value="">{t('All tags')}</option>
      {tags.map((tg) => <option key={tg.id} value={tg.id}>{tg.id.startsWith('project:') ? `📁 ${tg.name}` : `# ${tg.name}`}</option>)}
    </select>
  );
}

// Whether an item with these tags reaches the filter's tag: a project tag also matches items that reach that project.
export function matchesTag(itemTags: string[], filter: string, catalog: TagCatalog | null): boolean {
  if (!filter) return true;
  if (!itemTags.length) return true; // every project
  if (itemTags.includes(filter)) return true;
  const project = catalog?.projects.find((p) => p.id === filter);
  return Boolean(project) && itemTags.some((tg) => project!.tags.includes(tg)); // a tag the project carries
}
