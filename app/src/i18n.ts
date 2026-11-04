// Interface language: English (the source text), Brazilian Portuguese or Spanish.
// Texts are looked up in the selected dictionary; a missing translation shows
// the English text. Changing the language re-renders the whole app (App subscribes
// with useLang), so texts must be translated while rendering, never in module constants.

import { useSyncExternalStore } from 'react';
import { recall, remember } from './prefs';
import ptBR from './i18n/pt-BR.json';
import es from './i18n/es.json';

export type Lang = 'en' | 'pt-BR' | 'es';

// Inlined on purpose. A dynamic import() is a separate file, and Electron loads this
// UI from file:// — that fetch fails, the failure was swallowed, and the app stayed
// in English no matter which language the user picked.
const DICTS: Record<Lang, Record<string, string> | null> = { en: null, 'pt-BR': ptBR, es };

let dict: Record<string, string> | null = null;
export let lang: Lang = 'en';
const listeners = new Set<() => void>();

function apply(next: Lang): Lang {
  lang = next === 'pt-BR' || next === 'es' ? next : 'en';
  dict = DICTS[lang];
  document.documentElement.lang = lang;
  return lang;
}
const saved = recall('qa-ui-language');
apply(saved === 'pt-BR' || saved === 'es' ? saved : 'en');

// t('Back to {name}', { name }) — placeholders in braces are replaced after translating.
export const t = (text: string, vars?: Record<string, string | number>): string => {
  const s = dict && Object.hasOwn(dict, text) ? dict[text] : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
};

export const setLang = (next: Lang): void => {
  remember('qa-ui-language', apply(next));
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useLang = (): Lang => useSyncExternalStore(subscribe, () => lang);

// The AI talks in the interface language until the user picks another one when opening the tool.
export const conversationLanguage = () => recall('qa-language') || (lang === 'pt-BR' ? 'Portuguese (pt-BR)' : lang === 'es' ? 'Spanish' : 'English');
