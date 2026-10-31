// Settings. Agents: the library, plus agents installed for one project or for
// every project, and the only place an agent is created. Operations: agents
// linked by arrows into multi-agent operations. Skills: what is
// already installed (and where), and adding a skill. Documents: the look of the files
// activities and agents generate (header, footer, fonts, colours, watermark). MCP servers:
// the workspace catalog and what each project turns on (components/McpManager.tsx).

import { useEffect, useState } from 'react';
import { type ProjectSummary, type SkillScope, type TerminalRef, type ToolInfo } from '../api';
import { t } from '../i18n';
import { recall, remember } from '../prefs';
import { AgentForm } from '../components/AgentForm';
import { SkillsDialog, type SkillDialogTab } from '../components/SkillsDialog';
import { Library } from './Library';
import { DocumentStyleForm } from '../components/DocumentStyleForm';
import { Operations } from './Operations';
import { McpManager } from '../components/McpManager';

export type SettingsTab = 'agents' | 'operations' | 'skills' | 'mcp' | 'documents';

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

export function Settings({ tab, onTab, onClose, onBack, backLabel, project, projects, tools, onTerminal }: Props) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [skillsTab, setSkillsTab] = useState<SkillDialogTab>('installed');
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [installedTick, setInstalledTick] = useState(0);
  const [scope, setScope] = useState<SkillScope>(() => (recall('qa-skill-scope') === 'global' ? 'global' : 'project'));
  const target = project ?? projects.find((p) => p.id === pickedId) ?? projects[0] ?? null;
  const showPicker = !project && projects.length > 1;

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
          <button type="button" role="tab" aria-selected={tab === 'operations'} className={`dialog-tab${tab === 'operations' ? ' on' : ''}`} onClick={() => onTab('operations')}>{t('Operations')}</button>
          <button type="button" role="tab" aria-selected={tab === 'skills'} className={`dialog-tab${tab === 'skills' ? ' on' : ''}`} onClick={() => onTab('skills')}>{t('Skills')}</button>
          <button type="button" role="tab" aria-selected={tab === 'mcp'} className={`dialog-tab${tab === 'mcp' ? ' on' : ''}`} onClick={() => onTab('mcp')}>{t('MCP servers')}</button>
          <button type="button" role="tab" aria-selected={tab === 'documents'} className={`dialog-tab${tab === 'documents' ? ' on' : ''}`} onClick={() => onTab('documents')}>{t('Documents')}</button>
        </div>
        {showPicker && (
          <label className="settings-project">
            <span className="label">{t('Project')}</span>
            <select value={target?.id ?? ''} onChange={(e) => setPickedId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="settings-body">
        {tab === 'documents' ? <DocumentStyleForm key={target?.id ?? 'none'} project={target} />
          : tab === 'mcp' ? <McpManager key={target?.id ?? 'none'} project={target} />
          : tab === 'operations' ? <Operations tools={tools} />
          : tab === 'agents'
          ? (
            <Library
              embedded
              project={target}
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
              <SkillsDialog
                key={`${target.id}:${skillsTab}`}
                embedded
                initialTab={skillsTab}
                project={target}
                tools={tools}
                onClose={() => onTab('agents')}
                onTerminal={(terminal) => onTerminal(terminal, target.id)}
              />
            </>
          )}
      </div>
    </div>
  );
}
