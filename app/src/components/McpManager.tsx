// Settings › MCP servers. Workspace: the catalog every project of the workspace is
// offered (add, edit, test, import, delete). This project: the workspace servers it
// turns on or off, and the servers only it has. Both use the same service
// (scripts/lib/mcp.ts). Credentials are never typed here: values are ${VARIABLE}.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type McpEntry, type McpScope, type McpServer, type ProjectSummary } from '../api';
import { t } from '../i18n';

interface Props { project: ProjectSummary | null }

type Filter = 'all' | 'ok' | 'failing' | 'untested';
type Tab = 'config' | 'env' | 'tools' | 'access';
interface Draft { id: string; name: string; description: string; transport: 'stdio' | 'http'; command: string; args: string; url: string; pairs: string; access: 'read' | 'execute'; enabledByDefault: boolean }

const EMPTY: Draft = { id: '', name: '', description: '', transport: 'stdio', command: '', args: '', url: '', pairs: '', access: 'read', enabledByDefault: true };
const toDraft = (s: McpServer): Draft => ({
  id: s.id, name: s.name, description: s.description, transport: s.transport, command: s.command, args: s.args.join('\n'), url: s.url,
  pairs: Object.entries(s.transport === 'http' ? s.headers : s.env).map(([k, v]) => `${k}=${v}`).join('\n'), access: s.access, enabledByDefault: s.enabledByDefault,
});
const fromDraft = (d: Draft): Partial<McpServer> => {
  const pairs = Object.fromEntries(d.pairs.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return {
    ...(d.id ? { id: d.id } : {}), name: d.name, description: d.description, transport: d.transport, command: d.command,
    args: d.args.split('\n').map((a) => a.trim()).filter(Boolean), url: d.url,
    env: d.transport === 'stdio' ? pairs : {}, headers: d.transport === 'http' ? pairs : {}, access: d.access, enabledByDefault: d.enabledByDefault,
  };
};

function Status({ entry }: { entry: McpEntry }) {
  if (!entry.status) return <span className="pill">{t('Not tested')}</span>;
  return entry.status.ok
    ? <span className="pill pill-completed">{t('{n} tools', { n: entry.status.tools.length })}</span>
    : <span className="pill pill-blocked" title={entry.status.error}>{t('Failing')}</span>;
}

export function McpManager({ project }: Props) {
  const [scope, setScope] = useState<McpScope>(project ? 'project' : 'workspace');
  const [servers, setServers] = useState<McpEntry[]>([]);
  const [found, setFound] = useState<{ source: string; name: string; config: unknown }[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ draft: Draft; scope: McpScope } | null>(null);
  const [tab, setTab] = useState<Tab>('config');
  const [importing, setImporting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const onProject = scope === 'project' && project != null;
  const projectId = onProject ? project.id : null;

  const load = useCallback(() => {
    api.mcpCatalog(projectId).then((c) => setServers(c.servers)).catch((e: Error) => setError(e.message));
    api.foundMcpServers(project?.id ?? null).then(setFound).catch(() => setFound([]));
  }, [projectId, project?.id]);
  useEffect(() => { setEditing(null); setError(''); setInfo(''); load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(''); setInfo('');
    try { await fn(); if (done) setInfo(done); load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const matches = (s: McpEntry) => (!query || `${s.name} ${s.id} ${s.description}`.toLowerCase().includes(query.toLowerCase()))
    && (filter === 'all' || (filter === 'untested' ? !s.status : filter === 'ok' ? s.status?.ok : s.status && !s.status.ok));
  const inherited = useMemo(() => servers.filter((s) => s.origin === 'workspace'), [servers]);
  const own = useMemo(() => servers.filter((s) => s.origin === 'project'), [servers]);
  const current = editing?.draft.id ? servers.find((s) => s.id === editing.draft.id) : undefined;

  const save = () => editing && act(async () => {
    const saved = await api.saveMcpServer(editing.scope, editing.scope === 'project' ? projectId : null, fromDraft(editing.draft));
    setEditing({ ...editing, draft: toDraft(saved) });
  }, t('Saved.'));
  const remove = (s: McpEntry, where: McpScope) => {
    const used = s.usedBy.length ? `\n\n${t('It is on in: {projects}', { projects: s.usedBy.join(', ') })}` : '';
    if (!window.confirm(`${t('Delete the MCP server {name}?', { name: s.name })}${used}`)) return;
    void act(async () => { await api.removeMcpServer(where, where === 'project' ? projectId : null, s.id); setEditing(null); }, t('Deleted.'));
  };
  const test = (s: McpEntry, where: McpScope) => act(async () => {
    const r = await api.testMcpServer(where, where === 'project' ? projectId : null, s.id);
    if (!r.ok) throw new Error(r.error ?? t('The test failed.'));
    setInfo(t('{name} answered with {n} tools.', { name: s.name, n: r.tools.length }));
  });
  const importText = (text: string) => act(async () => {
    const r = await api.importMcpServers(onProject ? 'project' : 'workspace', projectId, text);
    setImporting(false); setPasted('');
    const notes = [...r.replaced.map((x) => t('Credential replaced by a variable: {what}', { what: x })), ...r.problems];
    if (notes.length) window.alert(notes.join('\n'));
  }, t('Imported.'));

  const row = (s: McpEntry, where: McpScope) => (
    <li key={s.id} className={`mcp-row${editing?.draft.id === s.id ? ' on' : ''}`}>
      {where === 'workspace' && onProject && (
        <input type="checkbox" checked={s.enabled} disabled={busy} aria-label={t('On in this project')} onChange={(e) => act(() => api.setProjectMcp(project.id, s.id, e.target.checked))} />
      )}
      <button type="button" className="mcp-row-main" onClick={() => { setEditing({ draft: toDraft(s), scope: where }); setTab('config'); }}>
        <span className="mcp-name">{s.name}</span>
        <span className="muted small">{s.transport === 'http' ? 'HTTP' : 'stdio'} · {s.id}{s.access === 'execute' ? ` · ${t('executes')}` : ''}</span>
      </button>
      {where === 'workspace' && onProject ? <span className="muted small">{s.enabled ? t('On') : t('Off')}{s.changed ? '' : ` ${t('(default)')}`}</span> : <Status entry={s} />}
    </li>
  );

  const d = editing?.draft;
  const readOnly = Boolean(editing && onProject && editing.scope === 'workspace'); // a project never edits the workspace's servers
  const set = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });

  return (
    <div className="mcp">
      <div className="mcp-list">
        <h1>{t('MCP servers')}</h1>
        <p className="muted">{onProject
          ? t('The workspace servers this project uses, and the ones only this project has. Agents, operations and the IDE get only the servers that are on.')
          : t('Servers offered to every project of this workspace. Each project turns them on or off; servers that execute start off.')}</p>
        {project && (
          <div className="dialog-tabs ds-scope" role="tablist">
            <button type="button" role="tab" aria-selected={!onProject} className={`dialog-tab${!onProject ? ' on' : ''}`} onClick={() => setScope('workspace')}>{t('Workspace')}</button>
            <button type="button" role="tab" aria-selected={onProject} className={`dialog-tab${onProject ? ' on' : ''}`} onClick={() => setScope('project')}>{project.name}</button>
          </div>
        )}
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        {info && <div className="result" role="status"><p className="result-title">{info}</p></div>}

        <div className="mcp-tools">
          <input type="search" placeholder={t('Search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {!onProject && (
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t('Filter')}>
              <option value="all">{t('All')}</option><option value="ok">{t('Working')}</option><option value="failing">{t('Failing')}</option><option value="untested">{t('Not tested')}</option>
            </select>
          )}
          <button type="button" className="btn" disabled={busy} onClick={() => { setEditing({ draft: { ...EMPTY }, scope: onProject ? 'project' : 'workspace' }); setTab('config'); }}>{onProject ? t('Add project MCP') : t('Add')}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setImporting((v) => !v)}>{t('Import JSON')}</button>
        </div>

        {importing && (
          <div className="mcp-import">
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'{ "mcpServers": { "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] } } }'} />
            <p className="muted small">{t('Claude Code, Cursor or VS Code format. A credential written in it becomes a ${VARIABLE}: set the variable on this computer.')}</p>
            <button type="button" className="btn" disabled={busy || !pasted.trim()} onClick={() => importText(pasted)}>{t('Import')}</button>
          </div>
        )}

        {onProject ? (
          <>
            <h2 className="mcp-section">{t('Inherited from workspace')} <span className="muted small">{inherited.length}</span></h2>
            {inherited.length ? <ul className="mcp-rows">{inherited.filter(matches).map((s) => row(s, 'workspace'))}</ul> : <p className="muted small">{t('The workspace has no MCP servers yet.')}</p>}
            <h2 className="mcp-section">{t('Project only')} <span className="muted small">{own.length}</span></h2>
            {own.length ? <ul className="mcp-rows">{own.filter(matches).map((s) => row(s, 'project'))}</ul> : <p className="muted small">{t('No servers only for this project.')}</p>}
            <h2 className="mcp-section">{t('Use them in the AI tools')}</h2>
            <p className="muted small">{t('Claude Code and Cursor started from Moki get the servers that are on, plus Moki\'s own server for this project.')}</p>
            <div className="mcp-tools">
              {project.repository && (
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => {
                  if (!window.confirm(t('Write the servers that are on to {folder}/.cursor/mcp.json?\n\nOnly Moki\'s entries (moki, moki-*) change; yours stay. The current file is backed up to .moki-backup/ first.', { folder: project.repository ?? '' }))) return;
                  void act(async () => { const r = await api.syncCursorMcp(project.id, true); setInfo(r.changed ? t('Cursor updated: {file}', { file: r.file }) : t('Cursor already had these servers.')); });
                }}>{t('Sync with Cursor in {folder}', { folder: project.repository.split(/[\\/]/).pop() ?? '' })}</button>
              )}
              {(['claude', 'cursor'] as const).map((tool) => (
                <button key={tool} type="button" className="btn btn-ghost" disabled={busy} onClick={() => act(async () => {
                  const r = await api.copyMcpConfig(project.id, tool);
                  if (!r.copied) window.prompt(t('Copy the configuration'), r.text);
                }, t('Configuration copied.'))}>{tool === 'claude' ? t('Copy for Claude Code') : t('Copy for Cursor')}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            {servers.length ? <ul className="mcp-rows">{servers.filter(matches).map((s) => row(s, 'workspace'))}</ul> : <p className="muted small">{t('No MCP servers yet. Add one or import a configuration.')}</p>}
            {found.length > 0 && (
              <>
                <h2 className="mcp-section">{t('Found in the AI tools')}</h2>
                <ul className="mcp-rows">
                  {found.map((f) => (
                    <li key={`${f.source}:${f.name}`} className="mcp-row">
                      <span className="mcp-row-main"><span className="mcp-name">{f.name}</span><span className="muted small">{f.source}</span></span>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || servers.some((s) => s.name === f.name)} onClick={() => importText(JSON.stringify({ mcpServers: { [f.name]: f.config } }))}>{t('Import into Moki')}</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {editing && d && (
        <aside className="mcp-panel">
          <div className="mcp-panel-head">
            <h2>{d.id ? d.name : t('New MCP server')}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>{t('Close')}</button>
          </div>
          {readOnly && <p className="muted small">{t('This server belongs to the workspace: change it in the Workspace tab. To use another configuration here, add a project MCP.')}</p>}
          <div className="dialog-tabs" role="tablist">
            {([['config', t('Configuration')], ['env', d.transport === 'http' ? t('Headers') : t('Environment')], ['tools', t('Tools')], ['access', t('Permissions')]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`dialog-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <fieldset disabled={readOnly || busy} className="mcp-form">
            {tab === 'config' && (
              <>
                <label className="field"><span className="label">{t('Server name')}</span><input value={d.name} onChange={(e) => set({ name: e.target.value })} /></label>
                {d.id && <p className="muted small">{t('Id: {id} (agents use it; it never changes)', { id: d.id })}</p>}
                <label className="field"><span className="label">{t('Description')}</span><input value={d.description} onChange={(e) => set({ description: e.target.value })} /></label>
                <div className="field"><span className="label">{t('Transport')}</span>
                  <div className="dialog-tabs">
                    {(['stdio', 'http'] as const).map((tr) => <button key={tr} type="button" className={`dialog-tab${d.transport === tr ? ' on' : ''}`} onClick={() => set({ transport: tr })}>{tr === 'http' ? 'HTTP' : 'stdio'}</button>)}
                  </div>
                </div>
                {d.transport === 'stdio' ? (
                  <>
                    <label className="field"><span className="label">{t('Command')}</span><input value={d.command} placeholder="npx" onChange={(e) => set({ command: e.target.value })} /></label>
                    <label className="field"><span className="label">{t('Arguments (one per line)')}</span><textarea rows={4} value={d.args} placeholder="@playwright/mcp@latest" onChange={(e) => set({ args: e.target.value })} /></label>
                  </>
                ) : (
                  <label className="field"><span className="label">URL</span><input value={d.url} placeholder="https://example.com/mcp" onChange={(e) => set({ url: e.target.value })} /></label>
                )}
              </>
            )}
            {tab === 'env' && (
              <label className="field">
                <span className="label">{d.transport === 'http' ? t('Headers (NAME=value, one per line)') : t('Environment variables (NAME=value, one per line)')}</span>
                <textarea rows={6} value={d.pairs} placeholder={d.transport === 'http' ? 'Authorization=Bearer ${GITHUB_TOKEN}' : 'API_TOKEN=${MY_API_TOKEN}'} onChange={(e) => set({ pairs: e.target.value })} />
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
                : <p className="muted small">{d.id ? t('Not tested yet: press Test to start the server and list its tools.') : t('Save the server first.')}</p>
            )}
            {tab === 'access' && (
              <>
                <div className="field"><span className="label">{t('What it can do')}</span>
                  <div className="choice-grid">
                    {([['read', t('Reads data'), t('Queries only; agents use it freely')], ['execute', t('Executes'), t('Changes things outside Moki; a step that uses it waits for your approval')]] as const).map(([id, title, hint]) => (
                      <label key={id} className={`choice${d.access === id ? ' on' : ''}`}>
                        <input type="radio" name="mcp-access" checked={d.access === id} onChange={() => set({ access: id, enabledByDefault: id === 'read' ? d.enabledByDefault : false })} />
                        <span className="choice-title">{title}</span><span className="choice-hint">{hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="field inline">
                  <input type="checkbox" checked={d.enabledByDefault} onChange={(e) => set({ enabledByDefault: e.target.checked })} />
                  <span>{editing.scope === 'workspace' ? t('On in projects that did not choose') : t('On in this project')}</span>
                </label>
              </>
            )}
          </fieldset>
          <div className="mcp-actions">
            {!readOnly && <button type="button" className="btn" disabled={busy || !d.name.trim()} onClick={save}>{t('Save')}</button>}
            {current && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setTab('tools'); void test(current, editing.scope); }}>{busy ? t('Testing…') : t('Test')}</button>}
            {current && !readOnly && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remove(current, editing.scope)}>{t('Delete')}</button>}
          </div>
        </aside>
      )}
    </div>
  );
}
