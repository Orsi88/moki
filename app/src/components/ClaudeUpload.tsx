// Upload of skills and agents: a .claude folder (or a project that contains one, a skills/ or agents/ folder,
// a single skill) or the same in a .zip. Choosing reads and previews only; nothing is written until the user
// marks items and confirms. The destination is the project (its linked folder's .claude, or the project folder)
// or every project (your user folder). Used by Settings › Skills › Add a skill (every project), by Set up project
// and by the start screen (every project, no project open).

import { useState } from 'react';
import { api, type ProjectSummary, type SkillScope, type UploadBlock, type UploadItem, type UploadPreview } from '../api';
import { t } from '../i18n';
import { IconCheck } from './Icons';

interface Props {
  project: ProjectSummary | null; // none: only every project can be chosen
  scopes: SkillScope[]; // the destinations offered; the first is the starting one
  onInstalled?: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const key = (i: UploadItem) => `${i.kind}:${i.name}`;

// Blocking reasons come from the main process as codes; the texts are translated here.
const reasonText = (i: UploadItem): string => {
  const b = i.blocked;
  if (!b) return '';
  const map: Record<UploadBlock, string> = {
    'invalid-name': t('Invalid name: use lowercase letters, numbers and hyphens.'),
    'no-skill-md': t('The folder has no SKILL.md.'),
    'no-description': t('It has no description in its header: add a "description:" line to the file header and upload again.'),
    secret: t('A secret was found ({kind} in {file}). The value is not shown; remove it from the file to import.', { kind: b.detail ?? '', file: b.file ?? '' }),
    'moki-name': t('Same name as a skill or agent that comes with Moki.'),
    installed: t('Already installed here: it is not replaced.'),
  };
  return map[b.reason];
};
const ignoredText = (reason: 'config' | 'symlink' | 'other'): string => ({
  config: t('Not imported: settings, hooks, commands and MCP files can run commands or change the AI tool.'),
  symlink: t('Symbolic link: not followed.'),
  other: t('Not part of a skill or an agent.'),
})[reason];

export function ClaudeUpload({ project, scopes, onInstalled }: Props) {
  const [scope, setScope] = useState<SkillScope>(scopes[0]);
  const [view, setView] = useState<UploadPreview | null>(null);
  const [marked, setMarked] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ installed: { kind: string; name: string; folders: string[] }[]; backup?: string } | null>(null);
  const id = project?.id ?? '';

  const show = (v: UploadPreview) => { setView(v); setMarked(v.items.filter((i) => !i.blocked).map(key)); };

  const pick = async (source: 'folder' | 'zip') => {
    setBusy('pick'); setError(''); setDone(null);
    try { const v = await api.claudeUploadPick(source, id, scope); if (v) show(v); } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };
  const changeScope = async (next: SkillScope) => {
    setScope(next); setDone(null);
    if (!view) return;
    try { show(await api.claudeUploadPreview(id, next)); } catch (e) { setError(message(e)); }
  };

  const install = async () => {
    if (!view || !marked.length) return;
    const repo = scope === 'project' ? view.linked : '';
    const where = scope === 'global' ? t('all projects (your user folder)')
      : repo ? t("the repository {folder}. This CHANGES {folder}/.claude (the current .claude is backed up to the project's backups/ first)", { folder: repo })
      : t('the project {name}', { name: project?.name ?? '' });
    if (!window.confirm(`${t('Install {n} item(s) for {where}?', { n: marked.length, where })}\n\n${t('A skill can instruct the AI to run commands — review what you upload before using it.')}`)) return;
    setBusy('apply'); setError('');
    try {
      setDone(await api.claudeUploadApply(id, scope, marked, Boolean(repo)));
      setView(null); setMarked([]);
      onInstalled?.();
    } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };

  const flip = (k: string) => setMarked((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]));
  const hasAgents = view?.items.some((i) => i.kind === 'agent') ?? false;

  return (
    <div className="claude-upload">
      <p className="muted small">{t('Upload a .claude folder, a project that contains one, a skills or agents folder, a single skill, or the same in a .zip. Nothing is installed until you choose the items and confirm.')}</p>

      {scopes.length > 1 && (
        <div className="field inline">
          <span className="label">{t('Install for')}</span>
          <div className="choice-grid scope-grid">
            {scopes.map((s) => (
              <label key={s} className={`choice${scope === s ? ' on' : ''}`}>
                <input type="radio" name="upload-scope" checked={scope === s} disabled={Boolean(busy)} onChange={() => { void changeScope(s); }} />
                <span className="choice-title">{s === 'project' ? (project?.repository ? t('This repository only') : t('This project only')) : t('All projects')}</span>
                <span className="choice-hint">{s === 'project' ? (project?.repository ? `${project.repository}/.claude` : project?.name) : t('your user folder, every AI tool')}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {scope === 'global' && <p className="muted small">{t('Skills for all projects appear in a project’s requests after you link them in Set up project.')}</p>}

      <div className="row-actions">
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => { void pick('folder'); }}>{t('Choose a folder')}</button>
        <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => { void pick('zip'); }}>{t('Choose a .zip file')}</button>
        {busy === 'pick' && <span className="muted small">{t('Reading…')}</span>}
      </div>

      {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
      {done && (
        <div className="result" role="status">
          <p className="result-title"><IconCheck size={17} /> {t('Installed {n} item(s)', { n: done.installed.length })}</p>
          <ul className="small upload-list">{done.installed.flatMap((i) => i.folders.map((f) => <li key={f}><code>{f}</code></li>))}</ul>
          {done.backup && <p className="small">{t('Backup of the previous .claude:')} <code>{done.backup}</code></p>}
        </div>
      )}

      {view && (
        <>
          {view.items.length === 0 ? <p className="muted small">{t('No skills or agents found in what you chose.')}</p> : (
            <ul className="skill-list">
              {view.items.map((i) => (
                <li key={key(i)} className="skill-card">
                  <label className="check-row skill-card-head">
                    <input type="checkbox" checked={marked.includes(key(i))} disabled={Boolean(i.blocked) || Boolean(busy)} onChange={() => flip(key(i))} />
                    <span className="choice-title">{i.name || t('(no name)')}</span>
                    <span className="chip">{i.kind === 'skill' ? t('Skill') : t('Agent')}</span>
                    <span className="muted small">{t('{n} file(s)', { n: i.files })}</span>
                  </label>
                  {i.description && <p className="skill-desc small">{i.description}</p>}
                  {i.blocked && <p className="small warn-text">{t('Cannot be installed:')} {reasonText(i)}</p>}
                  {i.discarded.length > 0 && <p className="small warn-text">{t('Left out for safety (secrets and local settings):')} {i.discarded.join(', ')}</p>}
                </li>
              ))}
            </ul>
          )}
          {hasAgents && <p className="muted small">{t('An uploaded agent only finds skills of the same destination: upload the skills it uses together with it.')}</p>}
          {view.ignored.length > 0 && (
            <details className="small">
              <summary>{t('{n} item(s) not imported', { n: view.ignored.length })}</summary>
              <ul className="upload-list">{view.ignored.map((g) => <li key={g.path}><code>{g.path}</code> — {ignoredText(g.reason)}</li>)}</ul>
            </details>
          )}
          <div className="row-actions">
            <button type="button" className="btn" disabled={!marked.length || Boolean(busy)} onClick={() => { void install(); }}>{busy === 'apply' ? t('Installing…') : t('Install the chosen items')}</button>
          </div>
        </>
      )}
    </div>
  );
}
