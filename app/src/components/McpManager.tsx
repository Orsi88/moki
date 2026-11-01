// Settings › MCP servers: one catalog for the workspace, in the shape of the other tabs
// (ListPage): filter tabs, a search bar, the rows; a row opens the server's detail. Each row says where its server
// applies, right in the list: the Global switch (every project), or, switched off, the
// projects chosen in a small picker beside it, shown as chips under the row. A server
// can be switched off without being deleted. Add, edit, test, import, delete.
// Credentials are never typed here: values are ${VARIABLE} (scripts/lib/mcp.ts). The AI
// tools Moki starts get the servers of their project by themselves.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type McpEntry, type McpServer, type ProjectSummary } from '../api';
import { t } from '../i18n';
import { IconFolder, IconX } from './Icons';
import { BackArrow, ListHead, ListTabs, ListTools, countLabel, matchesQuery } from './ListPage';

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
  const [picker, setPicker] = useState<string | null>(null); // the server whose projects are being chosen
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(() => {
    api.mcpCatalog().then((c) => { setServers(c.servers); setProjects(c.projects); }).catch((e: Error) => setError(e.message));
    api.foundMcpServers(project?.id ?? null).then(setFound).catch(() => setFound([]));
  }, [project?.id]);
  useEffect(() => { load(); }, [load]);
  // Escape closes the project picker only (caught first, so Settings does not close too).
  useEffect(() => {
    if (!picker) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPicker(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picker]);

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
  const inFilter = (s: McpEntry, f: Filter) => ({
    all: true, global: !s.projects.length, specific: s.projects.length > 0, off: !s.enabled,
    ok: Boolean(s.status?.ok), failing: Boolean(s.status && !s.status.ok), untested: !s.status,
  } as Record<Filter, boolean>)[f];
  const matches = (s: McpEntry) => matchesQuery(query, s.name, s.id, s.description, whereLabel(s)) && inFilter(s, filter);
  const shown = servers.filter(matches);
  const current = draft?.id ? servers.find((s) => s.id === draft.id) : undefined;
  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });

  const save = () => draft && act(async () => { setDraft(toDraft(await api.saveMcpServer(fromDraft(draft)))); }, t('Saved.'));
  const toggle = (s: McpEntry) => act(() => api.saveMcpServer({ ...s, enabled: !s.enabled }));
  // Where a server applies: shown at once, then saved (a failure reloads the list as it is on disk).
  const place = (s: McpEntry, projects: string[]) => {
    setServers((all) => all.map((x) => (x.id === s.id ? { ...x, projects } : x)));
    void act(() => api.saveMcpServer({ ...s, projects }));
  };
  // Global on: every project. Off: the picker opens, and the server stays global until a first project is chosen.
  const setGlobal = (s: McpEntry, global: boolean) => {
    if (!global) { setPicker(s.id); return; }
    setPicker(null);
    place(s, []);
  };
  const linkProjects = (s: McpEntry, chosen: string[]) => { if (chosen.length) place(s, chosen); };
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

  if (draft) {
    return (
      <div className="list-page mcp-page">
        <header className="library-head">
          <div className="title-row"><BackArrow label={t('MCP servers')} onBack={() => { setDraft(null); setInfo(''); setError(''); }} /><h1>{draft.id ? draft.name : t('New MCP server')}</h1></div>
        </header>
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        {info && <div className="result" role="status"><p className="result-title">{info}</p></div>}
        <section className="agent-card mcp-panel">
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
        </section>
      </div>
    );
  }

  return (
    <div className="list-page mcp-list">
        <ListHead title={t('MCP servers')} intro={t('One list for the whole workspace. Each server applies to every project (global) or only to the projects you choose; agents, operations and the IDE get only the servers that apply to their project and are on.')}
          action={(
            <div className="row-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setImporting((v) => !v)}>{t('Import JSON')}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => { setDraft({ ...EMPTY }); setTab('config'); }}>{t('Add server')}</button>
            </div>
          )} />
        <ListTabs label={t('MCP servers')} value={filter} onChange={setFilter} tabs={([
          ['all', t('All')], ['global', t('Global')], ['specific', t('Specific projects')], ['ok', t('Working')], ['failing', t('Failing')], ['untested', t('Not tested')], ['off', t('Off')],
        ] as const).map(([id, label]) => ({ id, label, count: servers.filter((x) => inFilter(x, id)).length }))} />
        <ListTools query={query} onQuery={setQuery} placeholder={t('Search MCP servers')} count={countLabel(shown.length, '1 server', '{n} servers')} />
        {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
        {info && <div className="result" role="status"><p className="result-title">{info}</p></div>}

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
            {shown.map((s) => {
              const global = !s.projects.length && picker !== s.id;
              return (
                <li key={s.id} className={`mcp-row mcp-server${s.enabled ? '' : ' off'}`}>
                  <div className="mcp-row-line">
                    <input type="checkbox" checked={s.enabled} disabled={busy} aria-label={t('On')} title={s.enabled ? t('On: click to switch it off') : t('Off: click to switch it on')} onChange={() => toggle(s)} />
                    <button type="button" className="mcp-row-main" onClick={() => { setDraft(toDraft(s)); setTab('config'); }}>
                      <span className="mcp-name">{s.name}</span>
                      <span className="muted small">{s.transport === 'http' ? 'HTTP' : 'stdio'} · {s.id}{s.access === 'execute' ? ` · ${t('executes')}` : ''}</span>
                    </button>
                    <span className="mcp-global">
                      <span className="small">{t('Global')}</span>
                      <button type="button" role="switch" aria-checked={global} className={`switch${global ? ' on' : ''}`} disabled={busy}
                        aria-label={t('Global: {name} in every project', { name: s.name })} onClick={() => setGlobal(s, !global)}><span /></button>
                    </span>
                    <div className="mcp-pick-wrap">
                      <button type="button" className={`icon-btn mcp-pick-btn${picker === s.id ? ' on' : ''}`} disabled={busy || global}
                        title={global ? t('Switch Global off to choose projects') : t('Choose projects')} aria-label={t('Choose the projects of {name}', { name: s.name })}
                        aria-expanded={picker === s.id} onClick={() => setPicker((p) => (p === s.id ? null : s.id))}><IconFolder size={15} /></button>
                      {picker === s.id && (
                        <>
                          <div className="mcp-pick-backdrop" onMouseDown={() => setPicker(null)} />
                          <div className="mcp-pick" role="dialog" aria-label={t('Projects of {name}', { name: s.name })}>
                            <p className="small muted">{s.projects.length ? t('Projects that get {name}', { name: s.name }) : t('Choose the projects that get {name}', { name: s.name })}</p>
                            {projects.length ? (
                              <ul>
                                {projects.map((p, i) => {
                                  const on = s.projects.includes(p.id);
                                  const last = on && s.projects.length === 1; // a server for specific projects keeps at least one
                                  return (
                                    <li key={p.id}>
                                      <label title={last ? t('The last project: switch Global on instead') : ''}>
                                        <input type="checkbox" checked={on} disabled={last} autoFocus={i === 0}
                                          onChange={(e) => linkProjects(s, e.target.checked ? [...s.projects, p.id] : s.projects.filter((x) => x !== p.id))} />
                                        <span>{p.name}</span>
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : <p className="muted small">{t('This workspace has no projects yet.')}</p>}
                          </div>
                        </>
                      )}
                    </div>
                    <Status entry={s} />
                  </div>
                  {s.projects.length > 0 && (
                    <ul className="mcp-chips" aria-label={t('Projects of {name}', { name: s.name })}>
                      {s.projects.map((id) => (
                        <li key={id} className="mcp-chip">
                          {nameOf.get(id) ?? id}
                          {s.projects.length > 1 && (
                            <button type="button" disabled={busy} aria-label={t('Remove {project} from {name}', { project: nameOf.get(id) ?? id, name: s.name })}
                              onClick={() => linkProjects(s, s.projects.filter((x) => x !== id))}><IconX size={10} /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
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

    </div>
  );
}
