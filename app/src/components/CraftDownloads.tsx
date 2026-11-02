// Download of the ArtCraft Launcher apps (fixed list of the main process). Moki downloads the release file,
// checks its SHA-256 and shows the folder; it never installs or runs it. The destination is chosen in the
// system save dialog, never here.

import { useEffect, useState } from 'react';
import { api, type CraftDownloadInfo } from '../api';
import { t } from '../i18n';
import { IconX } from './Icons';

export function CraftDownloads({ onClose }: { onClose: () => void }) {
  const [apps, setApps] = useState<{ id: string; label: string }[]>([]);
  const [review, setReview] = useState<CraftDownloadInfo | null>(null); // the download waiting for the person's OK
  const [pick, setPick] = useState(0); // index of the chosen option (0 = recommended)
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => { api.craftApps().then(setApps).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const check = async (id: string) => {
    setBusy(id); setError(''); setDone(''); setPick(0);
    try { setReview(await api.craftDownloadInfo(id)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };
  const confirm = async () => {
    if (!review) return;
    setBusy(review.id); setError('');
    try {
      const r = await api.craftDownload(review.id, review.tag, review.options[pick].file);
      if (r) setDone(t('Downloaded and verified at {path}. Open the file yourself to install.', { path: r.path }));
      setReview(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setReview(null); } finally { setBusy(''); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="craft-title">
        <header className="modal-head">
          <div>
            <h2 id="craft-title">{t('Download ArtCraft apps')}</h2>
            <p className="muted small">{t('Moki downloads the file for this computer from the official GitHub release and checks its SHA-256. It does not install or run it.')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={Boolean(busy)} title={t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        <div className="modal-body">
          {review ? (
            <fieldset className="small">
              <legend>{t('{app} {tag} — choose the file for this computer. Moki verifies the SHA-256 and does not run it.', { app: review.label, tag: review.tag })}</legend>
              {review.options.map((o, i) => (
                <div key={o.file}>
                  <label>
                    <input type="radio" name="craft-file" checked={pick === i} onChange={() => setPick(i)} />{' '}
                    {t('{file} · {size} MB', { file: o.file, size: (o.size / 1048576).toFixed(1) })}
                    {i === 0 && <> <strong>{t('Recommended for this computer')}</strong></>}
                  </label>
                </div>
              ))}
              <p className="muted small">{t('From {url}', { url: review.options[pick].url })}</p>
            </fieldset>
          ) : (
            <ul className="skill-rows">
              {apps.map((a) => (
                <li key={a.id} className="skill-row">
                  <div>
                    <strong>{a.label}</strong>
                    {a.id === 'artcraft-launcher' && <span className="muted small">{t('Recommended: it installs and updates the others.')}</span>}
                  </div>
                  <button type="button" className="btn btn-sm" disabled={Boolean(busy)} onClick={() => { void check(a.id); }}>
                    {busy === a.id ? t('Checking…') : t('Download')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {busy && review && <p className="muted small">{t('Downloading…')}</p>}
          {done && <p className="small" role="status">{done}</p>}
          {error && <p className="error small" role="alert">{error}</p>}
        </div>
        {review && (
          <footer className="modal-foot">
            <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setReview(null)}>{t('Cancel')}</button>
            <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => { void confirm(); }}>{busy ? t('Downloading…') : t('Download')}</button>
          </footer>
        )}
      </div>
    </div>
  );
}
