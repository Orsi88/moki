// Top-right of the start screen: the language the AI talks in, and light or dark.
// Siglas only, no labels. The theme applies to the whole app.

import { useState } from 'react';
import { IconMoon, IconSun } from './Icons';
import { lang, setLang, t, type Lang } from '../i18n';
import { recall, remember } from '../prefs';
import { currentTheme, persistTheme, type Theme } from '../theme';

export const UI_LANGUAGES: [string, string][] = [
  ['English', 'EN'],
  ['Portuguese (pt-BR)', 'PT-BR'],
  ['Spanish', 'ES'],
];

interface Props {
  language: string;
  theme: Theme;
  onLanguage: (language: string) => void;
  onTheme: (theme: Theme) => void;
}

export function PrefsCorner({ language, theme, onLanguage, onTheme }: Props) {
  const light = theme === 'light';
  return (
    <div className="home-corner">
      <select className="lang-select" aria-label={t('Language the AI talks to you in')} title={t('Language the AI talks to you in')} value={language}
        onChange={(e) => onLanguage(e.target.value)}>
        {UI_LANGUAGES.map(([id, short]) => <option key={id} value={id}>{short}</option>)}
      </select>
      <button type="button" className={`theme-toggle${light ? ' is-light' : ''}`}
        aria-label={light ? t('Light') : t('Dark')} aria-pressed={light}
        title={light ? t('Light') : t('Dark')} onClick={() => onTheme(light ? 'dark' : 'light')}>
        <span className="theme-toggle-knob">{light ? <IconSun size={13} /> : <IconMoon size={13} />}</span>
      </button>
    </div>
  );
}

const UI_OF: Record<string, Lang> = { English: 'en', 'Portuguese (pt-BR)': 'pt-BR', Spanish: 'es' };

const savedConversation = (): string => {
  const saved = recall('qa-language');
  if (saved && saved in UI_OF) return saved;
  return lang === 'pt-BR' ? 'Portuguese (pt-BR)' : lang === 'es' ? 'Spanish' : 'English';
};

// The corner with its own state: the chosen language (also the app's) and theme are remembered.
export function StartPrefs() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [conversation, setConversation] = useState(savedConversation);
  const chooseLanguage = (language: string) => {
    remember('qa-language', language);
    setLang(UI_OF[language] ?? 'en');
    setConversation(language);
  };
  const chooseTheme = (next: Theme) => { persistTheme(next); setTheme(next); };
  return <PrefsCorner language={conversation} theme={theme} onLanguage={chooseLanguage} onTheme={chooseTheme} />;
}
