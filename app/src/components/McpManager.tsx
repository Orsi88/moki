// Settings › MCP servers: one catalog for the workspace. Each server says where it
// applies — every project (global) or only the projects chosen — and can be switched
// off without being deleted. Add, edit, test, import, delete; and give a project's
// servers to the AI tools (copy, sync with Cursor). Credentials are never typed here:
// values are ${VARIABLE} (scripts/lib/mcp.ts).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type McpEntry, type McpServer, type ProjectSummary } from '../api';
import { t } from '../i18n';

interface Props { project: ProjectSummary | null; projects: ProjectSummary[] }

type Filter = 'all' | 'global' | 'specific' | 'ok' | 'failing' | 'untested' | 'off';
type Tab = 'config' | 'env' | 'tools';
interface Draft { id: string; name: string; description: string; transport: 'stdio' | 'http'; command: string; args: string; url: string; pairs: string; access: 'read' | 'execute'; enabled: boolean; global: boolean; projects: string[] }

const EMPTY: Draft = { id: '', name: '', description: '', transport: 'stdio', command: '', args: '', url: '', pairs: '', access: 'read', enabled: true, global: true, projects: [] };
const toDraft = (s: McpServer): Draft => ({
  id: s.id, name: s.name, description: s.description, transport: s.transport, command: s.command, args: s.args.join('\n'), url: s.url,
  pairs: Object.entries(s.transport === 'http' ? s.headers : s.env).map(([k, v]) => `${k}=${v}`).join('\n'),
  access: s.access, enabled: s.enabled, global: !s.projects.length, projects: s.projects,
});
const fromDraft = (d: Draft): Partial<McpServer> => {
  const pairs = Object.fromEntries(d.pairs.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return {
    ...(d.id ? { id: d.id } : {}), name: d.name, description: d.description, transport: d.transport, command: d.command,
    args: d.args.split('\n').map((a) => a.trim()).filter(Boolean), url: d.url,
    env: d.transport === 'stdio' ? pairs : {}, headers: d.transport === 'http' ? pairs : {}, access: d.access, enabled: d.enabled,
    projects: d.global ? [] : d.projects,
  };
};

function Status({ entry }: { entry: McpEntry }) {
  if (!entry.enabled) return <span className="pill">{t('Off')}</span>;
  if (!entry.status) return <span className="pill">{t('Not tested')}</span>;
  return entry.status.ok
    ? <span className="pill pill-completed">{t('{n} tools', { n: entry.status.tools.length })}</span>
    : <span className="pill pill-blocked" title={entry.status.error}>{t('Failing')}</span>;
}

// Global, or the projects chosen: a list of checkboxes.
function WhereField({ global, chosen, projects, onChange }: { global: boolean; chosen: string[]; projects: { id: string; name: string }[]; onChange: (global: boolean, chosen: string[]) => void }) {
  return (
    <div className="field">
      <span className="label">{t('Where it applies')}</span>
      <div className="choice-grid mcp-where">
        <label className={`choice${global ? ' on' : ''}`}>
          <input type="radio" name="mcp-where" checked={global} onChange={() => onChange(true, chosen)} />
          <span className="choice-title">{t('Global')}</span>
          <span className="choice-hint">{t('Every project of this workspace')}</span>
        </label>
        <label className={`choice${!global ? ' on' : ''}`}>
          <input type="radio" name="mcp-where" checked={!global} onChange={() => onChange(false, chosen)} />
          <span className="choice-title">{t('Specific projects')}</span>
          <span className="choice-hint">{t('Only the projects you choose')}</span>
        </label>
      </div>
      {!global && (
        projects.length ? (
          <ul className="mcp-projects">
            {projects.map((p) => (
              <li key={p.id}>
                <label>
                  <input type="checkbox" checked={chosen.includes(p.id)} onChange={(e) => onChange(false, e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} />
                  <span>{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : <span className="muted small">{t('This workspace has no projects yet.')}</span>
      )}
    </div>
  );
}

export function McpManager({ project, projects: summaries }: Props) {
  const [servers, setServers] = useState<McpEntry[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>(summaries.map((p) => ({ id: p.id, name: p.name })));
  const [found, setFound] = useState<{ source: string; name: string; config: unknown }[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<Tab>('config');
  const [importing, setImporting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [importWhere, setImportWhere] = useState<{ global: boolean; chosen: string[] }>({ global: true, chosen: [] });
  const [target, setTarget] = useState(project?.id ?? summaries[0]?.id ?? ''); // the project for "Use them in the AI tools"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(() => {
    api.mcpCatalog().then((c) => { setServers(c.servers); setProjects(c.projects); }).catch((e: Error) => setError(e.message));
    api.foundMcpServers(project?.id ?? null).then(setFound).catch(() => setFound([]));
  }, [project?.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(''); setInfo('');
    try { await fn(); if (done) setInfo(done); load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const nameOf = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const whereLabel = (s: McpServer): string => {
    if (!s.projects.length) return t('Global');
    const names = s.projects.map((id) => nameOf.get(id) ?? id);
    return names.length > 2 ? t('{first} and {n} more', { first: names.slice(0, 2).join(', '), n: names.length - 2 }) : names.join(', ');
  };
  const matches = (s: McpEntry) => (!query || `${s.name} ${s.id} ${s.description} ${whereLabel(s)}`.toLowerCase().includes(query.toLowerCase()))
    && ({
      all: true, global: !s.projects.length, specific: s.projects.length > 0, off: !s.enabled,
      ok: Boolean(s.status?.ok), failing: Boolean(s.status && !s.status.ok), untested: !s.status,
    } as Record<Filter, boolean>)[filter];
  const current = draft?.id ? servers.find((s) => s.id === draft.id) : undefined;
  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const targetProject = summaries.find((p) => p.id === target) ?? null;

  const save = () => draft && act(async () => { setDraft(toDraft(await api.saveMcpServer(fromDraft(draft)))); }, t('Saved.'));
  const toggle = (s: McpEntry) => act(() => api.saveMcpServer({ ...s, enabled: !s.enabled }));
  const remove = (s: McpEntry) => {
    const used = s.usedBy.length ? `\n\n${t('It is on in: {projects}', { projects: s.usedBy.map((id) => nameOf.get(id) ?? id).join(', ') })}` : '';
    if (!window.confirm(`${t('Delete the MCP server {name}?', { name: s.name })}${used}`)) return;
    void act(async () => { await api.removeMcpServer(s.id); setDraft(null); }, t('Deleted.'));
  };
  const test = (s: McpEntry) => act(async () => {
    const r = await api.testMcpServer(s.id);
    if (!r.ok) throw new Error(r.error ?? t('The test failed.'));
    setInfo(t('{name} answered with {n} tools.', { name: s.name, n: r.tools.length }));
  });
  const importText = (text: string, where: string[]) => act(async () => {
    const r = await api.importMcpServers(text, where);
    setImporting(false); setPasted('');
    const notes = [...r.replaced.map((x) => t('Credential replaced by a variable: {what}', { what: x })), ...r.problems];
    if (notes.length) window.alert(notes.join('\n'));
  }, t('Imported.'));
  const missingProjects = Boolean(draft && !draft.global && !draft.projects.length);

  return (
    <div className="mcp">
      <div className="mcp-list">
        <h1>{t('MCP servers')}</h1>
        <p className="muted">{t('One list for the whole workspace. Each server applies to every project (global) or only to the projects you choose; agents, operations and the IDE get only the servers that apply to their project and are on.')}</p>
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        {info && <div className="result" role="status"><p className="result-title">{info}</p></div>}

        <div className="mcp-tools">
          <input type="search" placeholder={t('Search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t('Filter')}>
            <option value="all">{t('All')}</option><option value="global">{t('Global')}</option><option value="specific">{t('Specific projects')}</option>
            <option value="ok">{t('Working')}</option><option value="failing">{t('Failing')}</option><option value="untested">{t('Not tested')}</option><option value="off">{t('Off')}</option>
          </select>
          <button type="button" className="btn" disabled={busy} onClick={() => { setDraft({ ...EMPTY }); setTab('config'); }}>{t('Add')}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setImporting((v) => !v)}>{t('Import JSON')}</button>
        </div>

        {importing && (
          <div className="mcp-import">
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'{ "mcpServers": { "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] } } }'} />
            <p className="muted small">{t('Claude Code, Cursor or VS Code format. A credential written in it becomes a ${VARIABLE}: set the variable on this computer.')}</p>
            <WhereField global={importWhere.global} chosen={importWhere.chosen} projects={projects} onChange={(global, chosen) => setImportWhere({ global, chosen })} />
            <button type="button" className="btn" disabled={busy || !pasted.trim() || (!importWhere.global && !importWhere.chosen.length)}
              onClick={() => importText(pasted, importWhere.global ? [] : importWhere.chosen)}>{t('Import')}</button>
          </div>
        )}

        {servers.length ? (
          <ul className="mcp-rows">
            {servers.filter(matches).map((s) => (
              <li key={s.id} className={`mcp-row${draft?.id === s.id ? ' on' : ''}${s.enabled ? '' : ' off'}`}>
                <input type="checkbox" checked={s.enabled} disabled={busy} aria-label={t('On')} title={s.enabled ? t('On: click to switch it off') : t('Off: click to switch it on')} onChange={() => toggle(s)} />
                <button type="button" className="mcp-row-main" onClick={() => { setDraft(toDraft(s)); setTab('config'); }}>
                  <span className="mcp-name">{s.name}</span>
                  <span className="muted small">{s.transport === 'http' ? 'HTTP' : 'stdio'} · {s.id}{s.access === 'execute' ? ` · ${t('executes')}` : ''}</span>
                </button>
                <span className={`mcp-where-chip${s.projects.length ? '' : ' global'}`} title={whereLabel(s)}>{whereLabel(s)}</span>
                <Status entry={s} />
              </li>
            ))}
          </ul>
        ) : <p className="muted small">{t('No MCP servers yet. Add one or import a configuration.')}</p>}

        {found.length > 0 && (
          <>
            <h2 className="mcp-section">{t('Found in the AI tools')}</h2>
            <ul className="mcp-rows">
              {found.map((f) => (
                <li key={`${f.source}:${f.name}`} className="mcp-row">
                  <span className="mcp-row-main"><span className="mcp-name">{f.name}</span><span className="muted small">{f.source}</span></span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy || servers.some((s) => s.name === f.name)} onClick={() => importText(JSON.stringify({ mcpServers: { [f.name]: f.config } }), [])}>{t('Import into Moki')}</button>
                </li>
              ))}
            </ul>
          </>
        )}

        {summaries.length > 0 && (
          <>
            <h2 className="mcp-section">{t('Use them in the AI tools')}</h2>
            <p className="muted small">{t('Claude Code and Cursor started from Moki get the servers that are on, plus Moki\'s own server for this project.')}</p>
            <div className="mcp-tools">
              <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('Project')}>
                {summaries.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {targetProject?.repository && (
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => {
                  if (!window.confirm(t('Write the servers that are on to {folder}/.cursor/mcp.json?\n\nOnly Moki\'s entries (moki, moki-*) change; yours stay. The current file is backed up to .moki-backup/ first.', { folder: targetProject.repository ?? '' }))) return;
                  void act(async () => { const r = await api.syncCursorMcp(targetProject.id, true); setInfo(r.changed ? t('Cursor updated: {file}', { file: r.file }) : t('Cursor already had these servers.')); });
                }}>{t('Sync with Cursor in {folder}', { folder: targetProject.repository.split(/[\\/]/).pop() ?? '' })}</button>
              )}
              {(['claude', 'cursor'] as const).map((tool) => (
                <button key={tool} type="button" className="btn btn-ghost" disabled={busy || !targetProject} onClick={() => act(async () => {
                  const r = await api.copyMcpConfig(target, tool);
                  if (!r.copied) window.prompt(t('Copy the configuration'), r.text);
                }, t('Configuration copied.'))}>{tool === 'claude' ? t('Copy for Claude Code') : t('Copy for Cursor')}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {draft && (
        <aside className="mcp-panel">
          <div className="mcp-panel-head">
            <h2>{draft.id ? draft.name : t('New MCP server')}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>{t('Close')}</button>
          </div>
          <div className="dialog-tabs" role="tablist">
            {([['config', t('Configuration')], ['env', draft.transport === 'http' ? t('Headers') : t('Environment')], ['tools', t('Tools')]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`dialog-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <fieldset disabled={busy} className="mcp-form">
            {tab === 'config' && (
              <>
                <label className="field"><span className="label">{t('Server name')}</span><input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
                {draft.id && <p className="muted small">{t('Id: {id} (agents use it; it never changes)', { id: draft.id })}</p>}
                <WhereField global={draft.global} chosen={draft.projects} projects={projects} onChange={(global, chosen) => set({ global, projects: chosen })} />
                <label className="field"><span className="label">{t('Description')}</span><input value={draft.description} onChange={(e) => set({ description: e.target.value })} /></label>
                <div className="field"><span className="label">{t('Transport')}</span>
                  <div className="dialog-tabs">
                    {(['stdio', 'http'] as const).map((tr) => <button key={tr} type="button" className={`dialog-tab${draft.transport === tr ? ' on' : ''}`} onClick={() => set({ transport: tr })}>{tr === 'http' ? 'HTTP' : 'stdio'}</button>)}
                  </div>
                </div>
                {draft.transport === 'stdio' ? (
                  <>
                    <label className="field"><span className="label">{t('Command')}</span><input value={draft.command} placeholder="npx" onChange={(e) => set({ command: e.target.value })} /></label>
                    <label className="field"><span className="label">{t('Arguments (one per line)')}</span><textarea rows={4} value={draft.args} placeholder="@playwright/mcp@latest" onChange={(e) => set({ args: e.target.value })} /></label>
                  </>
                ) : (
                  <label className="field"><span className="label">URL</span><input value={draft.url} placeholder="https://example.com/mcp" onChange={(e) => set({ url: e.target.value })} /></label>
                )}
                <div className="field"><span className="label">{t('What it can do')}</span>
                  <div className="choice-grid">
                    {([['read', t('Reads data'), t('Queries only; agents use it freely')], ['execute', t('Executes'), t('Changes things outside Moki; a step that uses it waits for your approval')]] as const).map(([id, title, hint]) => (
                      <label key={id} className={`choice${draft.access === id ? ' on' : ''}`}>
                        <input type="radio" name="mcp-access" checked={draft.access === id} onChange={() => set({ access: id })} />
                        <span className="choice-title">{title}</span><span className="choice-hint">{hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="field inline">
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                  <span>{t('On')} <span className="muted small">{t('(off: kept here, given to no project)')}</span></span>
                </label>
              </>
            )}
            {tab === 'env' && (
              <label className="field">
                <span className="label">{draft.transport === 'http' ? t('Headers (NAME=value, one per line)') : t('Environment variables (NAME=value, one per line)')}</span>
                <textarea rows={6} value={draft.pairs} placeholder={draft.transport === 'http' ? 'Authorization=Bearer ${GITHUB_TOKEN}' : 'API_TOKEN=${MY_API_TOKEN}'} onChange={(e) => set({ pairs: e.target.value })} />
                <span className="muted small">{t('Credentials go as ${VARIABLE}: Moki never stores their values, it reads them from this computer\'s environment when the server starts.')}</span>
              </label>
            )}
            {tab === 'tools' && (
              current?.status
                ? (
                  <div>
                    <p className="small">{current.status.ok ? t('Working') : t('Failing')} · {new Date(current.status.at).toLocaleString()} · {current.status.ms} ms</p>
                    {current.status.error && <p className="error small">{current.status.error}</p>}
                    <ul className="mcp-tool-list">{current.status.tools.map((tool) => <li key={tool.name}><code>{tool.name}</code> <span className="muted small">{tool.description}</span></li>)}</ul>
                  </div>
                )
                : <p className="muted small">{draft.id ? t('Not tested yet: press Test to start the server and list its tools.') : t('Save the server first.')}</p>
            )}
          </fieldset>
          {missingProjects && <p className="muted small">{t('Choose at least one project, or make it global.')}</p>}
          <div className="mcp-actions">
            <button type="button" className="btn" disabled={busy || !draft.name.trim() || missingProjects} onClick={save}>{t('Save')}</button>
            {current && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setTab('tools'); void test(current); }}>{busy ? t('Testing…') : t('Test')}</button>}
            {current && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remove(current)}>{t('Delete')}</button>}
          </div>
        </aside>
      )}
    </div>
  );
}
