// The search window (?view=search): only the search panel, so it never loads the editor, Settings or the workspace screen.
import { useEffect, useState } from 'react';
import { SearchPanel } from './components/SearchPanel';
import { pageParams } from './api';
import { t, useLang } from './i18n';
import { setMenuWorkspace } from './side-menu';

export function SearchWindow() {
  useLang();
  const [ready, setReady] = useState(false);
  useEffect(() => { setMenuWorkspace(pageParams().get('workspace') ?? ''); setReady(true); }, []);
  if (!ready) return <div className="notice muted">{t('Loading…')}</div>;
  return <div className="search-window"><SearchPanel onOpenProject={(id) => window.qa?.searchOpen?.(id, '')} onOpenFile={(id, path) => window.qa?.searchOpen?.(id, path)} onClose={() => window.close()} /></div>;
}
