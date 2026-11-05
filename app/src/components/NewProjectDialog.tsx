// "Create and customize…" (start screen): the name typed there, optional tags and how the context
// starts (empty, growing with the activities, or planned with the AI), in one window; creating it opens
// the project with "Set up" (description, skills, agents). Enter on the name skips all of this.

import { useEffect, useState, type FormEvent } from 'react';
import type { Starter, Tag } from '../api';
import { recall, remember } from '../prefs';
import { t } from '../i18n';
import { TagPicker } from './TagPicker';
import { IconX } from './Icons';

interface Props {
  name: string; // typed on the start screen; editable here
  catalog: Tag[];
  onCatalog: (tags: Tag[]) => void;
  onCreate: (name: string, starter: Starter, tags: string[]) => Promise<void>;
  onClose: () => void;
}

const STARTS: { id: Starter; title: () => string; text: () => string }[] = [
  { id: 'minimal', title: () => t('Empty'), text: () => t('Standard folders; context files appear as the activities need them.') },
  { id: 'blank', title: () => t('Planned with the AI'), text: () => t('The AI asks what the project needs and proposes a plan.') },
];

export function NewProjectDialog({ name: typed, catalog, onCatalog, onCreate, onClose }: Props) {
  const [name, setName] = useState(typed);
  const [starter, setStarter] = useState<Starter>(recall('qa-starter') === 'blank' ? 'blank' : 'minimal'); // the last choice is the default
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    remember('qa-starter', starter);
    try { await onCreate(name, starter, tags); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal new-project" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={(e) => { void submit(e); }}>
        <header className="modal-head">
          <div>
            <h2 id="new-project-title">{t('Customize the project')}</h2>
            <p className="muted small">{t('After creating it, you set up its description, skills and agents.')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>{t('Project name')}</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Billing Portal" maxLength={80} />
          </label>
          <div className="field" role="radiogroup" aria-label={t('Context')}>
            <span>{t('Context')}</span>
            <div className="model-cards">
              {STARTS.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={starter === m.id} className={`model-card${starter === m.id ? ' on' : ''}`} onClick={() => setStarter(m.id)}>
                  <strong>{m.title()}</strong>
                  <span className="muted small">{m.text()}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t('Tags')} <span className="muted small">{t('(optional)')}</span></span>
            <TagPicker catalog={catalog} value={tags} onChange={setTags} onCatalog={onCatalog} />
          </div>
          {error && <p className="error small">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="btn" disabled={busy || !name.trim()}>{busy ? t('Creating…') : t('Create and set up')}</button>
        </footer>
      </form>
    </div>
  );
}
