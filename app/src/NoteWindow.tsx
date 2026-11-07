// A note window (?view=note): only the notebook (and the editor it needs), never Home, Settings or the workspace screen.
import { useEffect, useState } from 'react';
import { api, hasBridge, pageParams, type ProjectSummary } from './api';
import { Notebook } from './components/Notebook';
import { t, useLang } from './i18n';
import { setMenuWorkspace } from './side-menu';

export function NoteWindow() {
  useLang();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  useEffect(() => {
    if (!hasBridge()) { setError(t('Moki must be opened with the qa command.')); return; }
    Promise.all([api.projects(), api.workspaces()])
      .then(([list, spaces]) => { setProjects(list); setMenuWorkspace(spaces.active); setReady(true); })
      .catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <div className="notice"><img src="./favicon.svg" alt="" width={40} height={40} /><h1>{t('Something went wrong')}</h1><p>{error}</p></div>;
  if (!ready) return <div className="notice muted">{t('Loading…')}</div>;
  const params = pageParams();
  return (
    <div className="note-float">
      <Notebook project={params.get('project')} path={params.get('path')} loose={params.get('loose')} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
