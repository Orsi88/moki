// Settings. Agents: the library, plus agents installed for one project or for
// every project, and the only place an agent is created. Operations: agents
// linked by arrows into multi-agent operations. Skills: what is
// already installed (and where), and adding a skill. Templates: the look of the files
// activities and agents generate (header, footer, fonts, colours, watermark). MCP servers:
// one catalog for the workspace, each server global or for the projects chosen (components/McpManager.tsx).

import { useEffect, useState } from 'react';
import { api, type ProjectSummary, type SkillScope, type TerminalRef, type ToolInfo } from '../api';
import { t } from '../i18n';
import { recall, remember } from '../prefs';
import { AgentForm } from '../components/AgentForm';
import { type SkillDialogTab } from '../components/SkillsDialog';
import { Library } from './Library';
import { DocumentStyleForm } from '../components/DocumentStyleForm';
import { SkillsPage } from '../components/SkillsPage';
import { Operations } from './Operations';
import { McpManager } from '../components/McpManager';
import { ActivitiesPage } from '../components/ActivitiesPage';

export type SettingsTab = 'agents' | 'activities' | 'operations' | 'skills' | 'mcp' | 'documents';

interface Props {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
  /** The open project, when settings was opened from one. */
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  tools: ToolInfo[];
  onTerminal: (terminal: TerminalRef, projectId: string) => void;
}

export function Settings({ tab, onTab, onClose, onBack, backLabel, project, projects: given, tools, onTerminal }: Props) {
  // Every project of the workspace, for the tabs' pickers (opened from a project, Settings is given only that one).
  const [projects, setProjects] = useState<ProjectSummary[]>(given);
  useEffect(() => { api.projects().then((all) => { if (all.length) setProjects(all); }).catch(() => {}); }, []);
  const [skillsTab, setSkillsTab] = useState<SkillDialogTab>('installed');
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [installedTick, setInstalledTick] = useState(0);
  const [scope, setScope] = useState<SkillScope>(() => (recall('qa-skill-scope') === 'global' ? 'global' : 'project'));
  // Settings is for the whole workspace: the tabs that work on one project (Agents, Skills, Templates)
  // choose it inside the tab; it starts on the project Settings was opened from.
  const target = project ?? projects[0] ?? null;

  const openSkills = (next: SkillDialogTab) => { setSkillsTab(next); onTab('skills'); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="settings">
      <div className="settings-bar">
        {onBack && <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>{backLabel}</button>}
        <div className="dialog-tabs settings-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'agents'} className={`dialog-tab${tab === 'agents' ? ' on' : ''}`} onClick={() => onTab('agents')}>{t('Agents')}</button>
          <button type="button" role="tab" aria-selected={tab === 'activities'} className={`dialog-tab${tab === 'activities' ? ' on' : ''}`} onClick={() => onTab('activities')}>{t('Activities')}</button>
          <button type="button" role="tab" aria-selected={tab === 'operations'} className={`dialog-tab${tab === 'operations' ? ' on' : ''}`} onClick={() => onTab('operations')}>{t('Operations')}</button>
          <button type="button" role="tab" aria-selected={tab === 'skills'} className={`dialog-tab${tab === 'skills' ? ' on' : ''}`} onClick={() => onTab('skills')}>{t('Skills')}</button>
          <button type="button" role="tab" aria-selected={tab === 'mcp'} className={`dialog-tab${tab === 'mcp' ? ' on' : ''}`} onClick={() => onTab('mcp')}>{t('MCP servers')}</button>
          <button type="button" role="tab" aria-selected={tab === 'documents'} className={`dialog-tab${tab === 'documents' ? ' on' : ''}`} onClick={() => onTab('documents')}>{t('Templates')}</button>
        </div>
      </div>
      <div className="settings-body">
        {tab === 'documents' ? <DocumentStyleForm />
          : tab === 'mcp' ? <McpManager key={target?.id ?? 'none'} project={target} projects={projects} />
          : tab === 'operations' ? <Operations tools={tools} />
          : tab === 'activities' ? <ActivitiesPage />
          : tab === 'agents'
          ? (
            <Library
              embedded
              installedTick={installedTick}
              onBack={() => {}}
              backLabel=""
              onCreate={() => setCreatingAgent(true)}
              creating={creatingAgent}
              onBrowse={() => setCreatingAgent(false)}
              create={target ? (
                <>
                  <h1>{t('Create agent')}</h1>
                  <p className="muted">{t('Describe an agent in your own words and choose which installed skills it may use.')}</p>
                  <div className="field">
                    <span className="label">{t('Create for')}</span>
                    <div className="choice-grid scope-grid">
                      {([
                        ['project', target.repository ? t('This repository only') : t('This project only'), target.repository ? `${target.repository}/.claude/agents` : target.name],
                        ['global', t('All projects'), t('your user folder (~/.claude/agents)')],
                      ] as const).map(([id, title, hint]) => (
                        <label key={id} className={`choice${scope === id ? ' on' : ''}`}>
                          <input type="radio" name="agent-scope" checked={scope === id} onChange={() => { setScope(id); remember('qa-skill-scope', id); }} />
                          <span className="choice-title">{title}</span>
                          <span className="choice-hint">{hint}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <AgentForm key={`${target.id}:${scope}`} project={target} scope={scope} onCreated={() => setInstalledTick((n) => n + 1)} onFindSkills={() => { setCreatingAgent(false); openSkills('add'); }} />
                </>
              ) : <p className="muted">{t('Create a project before installing skills or agents.')}</p>}
            />
          )
          : !target ? (
            <div className="settings-skills">
              <h1>{t('Skills')}</h1>
              <p className="muted">{t('Create a project before installing skills or agents.')}</p>
            </div>
          ) : (
            <>
              <SkillsPage
                key={skillsTab}
                startOnAdd={skillsTab === 'add'}
                project={target}
                projects={projects}
                tools={tools}
                onTerminal={(terminal) => onTerminal(terminal, target.id)}
              />
            </>
          )}
      </div>
    </div>
  );
}
