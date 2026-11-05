// The code fence as an embed: a bar with the language and copy, then the text.
// Highlight is for reading. Focusing the block flattens it so typing stays one field.

import { highlightParts } from './code-highlight';
import { t } from './i18n';

const LANGS: [string, string][] = [
  ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['json', 'JSON'],
  ['bash', 'Bash'], ['html', 'HTML'], ['css', 'CSS'], ['sql', 'SQL'], ['java', 'Java'],
  ['go', 'Go'], ['rust', 'Rust'], ['yaml', 'YAML'], ['c', 'C'], ['cpp', 'C++'],
];

function paint(code: HTMLElement, lang: string) {
  const text = code.textContent ?? '';
  code.replaceChildren();
  if (!text) { code.append(document.createElement('br')); return; }
  for (const token of highlightParts(text, lang)) {
    if (!token.kind) { code.append(token.text); continue; }
    const span = document.createElement('span');
    span.className = `tok-${token.kind}`;
    span.textContent = token.text;
    code.append(span);
  }
}

function flatten(code: HTMLElement) {
  if (!code.querySelector('span')) return;
  const text = code.textContent ?? '';
  code.textContent = text;
}

// `editable` is the formatted editor. The reading view keeps the same bar, without a caret.
export function dressCodeEmbeds(root: HTMLElement, editable: boolean) {
  for (const pre of root.querySelectorAll<HTMLElement>('pre:not([data-diagram])')) {
    const code = pre.querySelector('code') ?? pre.appendChild(document.createElement('code'));
    if (editable) code.contentEditable = 'true';
    if (!pre.querySelector('.code-embed-bar')) {
      const current = pre.dataset.lang ?? '';
      const bar = document.createElement('div');
      bar.className = 'code-embed-bar';
      bar.contentEditable = 'false';
      const select = document.createElement('select');
      select.className = 'code-lang';
      select.setAttribute('aria-label', t('Code'));
      if (!editable) select.disabled = true;
      const choices: [string, string][] = [['', t('Text')], ...LANGS];
      if (current && !choices.some(([value]) => value === current)) choices.push([current, current]);
      for (const [value, label] of choices) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      }
      select.value = current;
      select.addEventListener('mousedown', (event) => event.stopPropagation());
      select.addEventListener('change', () => {
        if (select.value) pre.dataset.lang = select.value;
        else delete pre.dataset.lang;
        if (document.activeElement !== code) paint(code, select.value);
        pre.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'icon-btn code-copy';
      copy.title = t('Copy');
      copy.setAttribute('aria-label', t('Copy'));
      copy.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
      copy.addEventListener('mousedown', (event) => event.stopPropagation());
      copy.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const written = navigator.clipboard?.writeText(code.textContent ?? '');
        void Promise.resolve(written).then(() => { copy.title = t('Copied'); copy.setAttribute('aria-label', t('Copied')); });
      });
      bar.append(select, copy);
      pre.prepend(bar);
      if (editable) {
        code.addEventListener('focusin', () => flatten(code));
        code.addEventListener('focusout', () => paint(code, pre.dataset.lang ?? ''));
      }
    }
    if (document.activeElement !== code) paint(code, pre.dataset.lang ?? '');
  }
}
