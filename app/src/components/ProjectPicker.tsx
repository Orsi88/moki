// The project a Settings tab works on (Skills, Agents, Templates), chosen inside that tab:
// Settings itself is for the whole workspace, so there is no project picker on its bar.
import { type ProjectSummary } from '../api';
import { t } from '../i18n';

interface Props { projects: ProjectSummary[]; value: string; onChange: (id: string) => void; label?: string }

export function ProjectPicker({ projects, value, onChange, label }: Props) {
  if (projects.length < 2) return null;
  return (
    <label className="project-picker">
      <span className="label">{label ?? t('Project')}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}
