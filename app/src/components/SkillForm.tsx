// "Create skill": the QA describes the skill in plain words and the chosen AI tool
// drafts it as a proposal in the project folder (skill-proposals/<name>). After
// reviewing it, the QA installs the proposal where the scope says.

import { useCallback, useEffect, useState } from 'react';
import { api, type ProjectSummary, type SkillScope, type TerminalRef, type ToolInfo } from '../api';
import { preferredTool } from '../prefs';
import { conversationLanguage, t } from '../i18n';
import { IconCheck, IconInfo } from './Icons';
import { DEFAULT_SKILL_CAT, setSkillCat } from '../icons/cats';
import { CatIcon } from './CatIcon';
import { CatPicker } from './CatPicker';
import { SkillCat } from './SkillCat';

interface Props { project: ProjectSummary; scope: SkillScope; tools: ToolInfo[]; onTerminal: (t: TerminalRef) => void }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SkillForm({ project, scope, tools, onTerminal }: Props) {
  const usable = tools.filter((t) => t.available && (t.kind === 'terminal' || t.kind === 'editor'));
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [cat, setCat] = useState(DEFAULT_SKILL_CAT); // its icon in the cat library
  const [picking, setPicking] = useState(false);
  const [tool, setTool] = useState(() => preferredTool(usable)?.id ?? '');
  const [proposals, setProposals] = useState<{ name: string; description: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => { api.skillProposals(project.id).then(setProposals).catch(() => { /* keep */ }); }, [project.id]);
  useEffect(load, [load]);

  const create = async () => {
    setBusy('create'); setError(''); setInfo('');
    setSkillCat(name, cat);
    try {
      const r = await api.proposeSkill(project.id, { name, prompt, tool, language: conversationLanguage() });
      if (r.terminal) { onTerminal(r.terminal); return; }
      if (r.opened) setInfo(r.message ?? ''); else setError(r.message ?? t('Could not open the AI tool.'));
    } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };

  const install = async (n: string) => {
    const toClaude = scope === 'project' && Boolean(project.repository);
    const where = scope !== 'project' ? t('all projects (your user folder)')
      : toClaude ? t("the project {name}?\n\nThis CHANGES {folder}/.claude: the skill is written to its skills folder (the current .claude is backed up to the project's backups/ first)", { name: project.name, folder: project.repository })
      : t('the project {name}', { name: project.name });
    if (!window.confirm(`${t('Install the proposal "{name}" for {where}', { name: n, where })}${toClaude ? '.' : '?'}\n\n${t('Review its SKILL.md first: a skill can instruct the AI to run commands.')}`)) return;
    setBusy(n); setError(''); setInfo('');
    try {
      const r = await api.installProposal(project.id, n, scope, toClaude);
      setInfo(`${t('Installed {name} in {folders}', { name: r.name, folders: r.folders.join(', ') })}${r.backup ? `. ${t('Backup of the previous .claude:')} ${r.backup}` : ''}`);
    } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };

  const missing = [
    !name.trim() && t('give the skill a name'),
    !prompt.trim() && t('describe what it does'),
    !tool && t('install an AI tool'),
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="info-note" role="note">
        <IconInfo size={16} />
        <span>{t('The AI tool writes a proposal to')} <code>skill-proposals/</code> {t('in this project and nothing is installed. Review it in the file tree, then install it below.')}</span>
      </div>

      <div className="skill-name-row">
        <div className="field">
          <span className="label">{t('Icon')}</span>
          <button type="button" className="skill-cat skill-cat-lg" onClick={() => setPicking(true)} title={t('Choose an icon')} aria-label={t('Choose an icon')}>
            <CatIcon id={cat} size={52} />
          </button>
        </div>
        <label className="field">
          <span className="label">{t('Name')}</span>
          <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. api-contract-check')} />
        </label>
      </div>
      {picking && <CatPicker selected={cat} onPick={setCat} onClose={() => setPicking(false)} />}

      <label className="field">
        <span className="label">{t('What should the skill do?')}</span>
        <textarea rows={6} maxLength={8000} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation(); }}
          placeholder={t('e.g. Compare two OpenAPI files, list every breaking change and say which endpoints need new tests.')} />
      </label>

      <label className="field">
        <span className="label">{t('AI tool')}</span>
        <select value={tool} onChange={(e) => setTool(e.target.value)} disabled={!usable.length}>
          {!usable.length && <option value="">{t('No AI tool installed')}</option>}
          {usable.map((ai) => <option key={ai.id} value={ai.id}>{t(ai.label)}</option>)}
        </select>
      </label>

      {(info || error) && (
        <div className={`result${error ? ' warn' : ''}`} role="status">
          <p className="result-title">{error || <><IconCheck size={17} /> {info}</>}</p>
        </div>
      )}

      <div className="form-actions">
        {missing.length > 0 && <span className="muted small">{t('To continue:')} {missing.join(' · ')}.</span>}
        <button type="button" className="btn" disabled={Boolean(busy) || missing.length > 0} onClick={() => { void create(); }}>
          {busy === 'create' ? t('Opening…') : t('Create proposal')}
        </button>
      </div>

      <div className="field">
        <span className="label">{t('Proposals in this project')}</span>
        <button type="button" className="link" onClick={load}>{t('Refresh')}</button>
        {!proposals.length ? <p className="muted small">{t('None yet.')}</p> : (
          <ul className="skill-list">
            {proposals.map((p) => (
              <li key={p.name} className="skill-card">
                <div className="skill-card-head">
                  <SkillCat name={p.name} />
                  <span className="choice-title">{p.name}</span>
                  <span className="statusbar-spacer" />
                  <button type="button" className="btn btn-sm" disabled={Boolean(busy)} onClick={() => { void install(p.name); }}>
                    {busy === p.name ? t('Installing…') : t('Install')}
                  </button>
                </div>
                {p.description && <p className="skill-desc small">{p.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
