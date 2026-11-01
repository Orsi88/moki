// The Moki panel in the IDE: the bridge first (api.ts needs window.qa), then the
// language and the light or dark palette from VS Code, then the page.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installBridge } from './bridge';
import { setLang } from '../i18n';
import { applyTheme } from '../theme';
import { CompanionApp } from './CompanionApp';
import '../styles.css';
import './companion.css';

installBridge();
setLang(document.documentElement.dataset.lang === 'pt-BR' ? 'pt-BR' : 'en');

// VS Code marks its theme on <body>; Moki's palette follows it.
const followTheme = () => applyTheme(document.body.classList.contains('vscode-light') ? 'light' : 'dark');
followTheme();
new MutationObserver(followTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <CompanionApp />
  </StrictMode>,
);
