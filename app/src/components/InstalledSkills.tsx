// Skills already on this computer: one section per project that has its own, then the ones
// for every project. Each row says where it lives. Adding a skill stays on the other tab.

import { useCallback, useEffect, useState } from 'react';
import { api, type GlobalItems, type ProjectItems, type ProjectSummary } from '../api';
import { t } from '../i18n';
import { IconFolder } from './Icons';
import { SkillCat } from './SkillCat';

interface Props { projects: ProjectSummary[] }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function InstalledSkills({ projects }: Props) {
  const [items, setItems] = useState<Record<string, ProjectItems> | null>(null);
  const [globalItems, setGlobalItems] = useState<GlobalItems | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [backup, setBackup] = useState('');

  const load = useCallback(() => {
    Promise.all([Promise.all(projects.map((p) => api.projectItems(p.id))), api.globalItems()])
      .then(([local, global]) => { setItems(Object.fromEntries(projects.map((p, i) => [p.id, local[i]]))); setGlobalItems(global); })
      .catch((e) => setError(message(e)));
  }, [projects]);
  useEffect(load, [load]);

  const removeProject = async (project: ProjectSummary, name: string) => {
    const where = project.repository
      ? t("the repository {folder}?\n\nThis CHANGES its .claude (the current .claude is backed up to the project's backups/ first).", { folder: project.repository })
      : t('the project {name}?', { name: project.name });
    if (!window.confirm(`${t('Remove the skill "{name}" from', { name })} ${where} ${t('It goes to the trash.')}`)) return;
    setBusy(`project:${project.id}:${name}`); setError(''); setBackup('');
    try { setBackup((await api.removeProjectItem(project.id, 'skill', name, Boolean(project.repository))).backup ?? ''); load(); }
    catch (e) { setError(message(e)); } finally { setBusy(''); }
  };

  const removeGlobal = async (name: string, linkedBy: string[]) => {
    const used = linkedBy.length ? `\n\n${t('Linked by: {projects}. Those projects stop naming it in their requests.', { projects: linkedBy.join(', ') })}` : '';
    if (!window.confirm(`${t('Remove the skill "{name}" from all projects? It goes to the trash.', { name })}${used}`)) return;
    setBusy(`global:${name}`); setError('');
    try { await api.removeGlobal('skill', name); load(); } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };

  const withSkills = projects.filter((p) => (items?.[p.id]?.skills.length ?? 0) > 0);
  const globalSkills = globalItems?.skills ?? [];
  const empty = items && globalItems && !withSkills.length && !globalSkills.length;

  return (
    <>
      {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
      {backup && <p className="small">{t('Backup of the previous .claude:')} <code>{backup}</code></p>}
      {empty && <p className="muted small">{t('No skills installed yet.')}</p>}

      {withSkills.map((project) => { const projectItems = items![project.id]; return (
        <section key={project.id} className="field">
          <div className="skill-card-head">
            <span className="label">{project.name} ({projectItems.skills.length})</span>
            <span className="statusbar-spacer" />
            {projectItems.skillsFolder && <code className="small">{projectItems.skillsFolder}</code>}
          </div>
          <ul className="skill-list">
            {projectItems.skills.map((s) => (
              <li key={s.name} className="skill-card">
                <div className="skill-card-head">
                  <SkillCat name={s.name} />
                  <span className="choice-title">{s.name}</span>
                  <span className="chip">{t('Only this project')}</span>
                  <span className="statusbar-spacer" />
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => { void removeProject(project, s.name); }}>
                    {busy === `project:${project.id}:${s.name}` ? t('Removing…') : t('Remove')}
                  </button>
                </div>
                {s.description && <p className="skill-desc small">{s.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      ); })}

      {globalSkills.length > 0 && (
        <section className="field">
          <div className="skill-card-head">
            <span className="label">{t('All projects')} ({globalSkills.length})</span>
          </div>
          <ul className="skill-list">
            {globalSkills.map((s) => (
              <li key={s.name} className="skill-card">
                <div className="skill-card-head">
                  <SkillCat name={s.name} />
                  <span className="choice-title">{s.name}</span>
                  <span className="chip">{t('Global')}</span>
                  <span className="statusbar-spacer" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { api.openGlobal('skill', s.name).catch((e) => setError(message(e))); }} title={t('Open its folder')}><IconFolder size={15} /> {t('Open')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => { void removeGlobal(s.name, s.linkedBy); }}>
                    {busy === `global:${s.name}` ? t('Removing…') : t('Remove')}
                  </button>
                </div>
                {s.description && <p className="skill-desc small">{s.description}</p>}
                {s.linkedBy.length > 0 && (
                  <div className="chips">
                    <span className="chip" title={s.linkedBy.join(', ')}>{s.linkedBy.length === 1 ? t('Linked by 1 project') : t('Linked by {n} projects', { n: s.linkedBy.length })}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
