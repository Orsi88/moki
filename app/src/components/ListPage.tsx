// The list every Settings tab opens on (Agents, Skills, Templates; MCP servers and
// Operations to follow): title and intro with the create button, filter tabs, a search bar
// with the tab's own filters and a count, then the items. Choosing an item opens its detail,
// which has a back arrow (ListBack) to return here.

import type { ReactNode } from 'react';
import { t } from '../i18n';
import { IconArrowLeft } from './Icons';

export function ListHead({ title, intro, action }: { title: string; intro: string; action?: ReactNode }) {
  return (
    <header className="list-head">
      <div>
        <h1>{title}</h1>
        <p className="muted">{intro}</p>
      </div>
      {action}
    </header>
  );
}

export interface ListTab<T extends string> { id: T; label: string; count?: number }

export function ListTabs<T extends string>({ tabs, value, onChange, label }: { tabs: ListTab<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="dialog-tabs list-tabs" role="tablist" aria-label={label}>
      {tabs.map((tb) => (
        <button key={tb.id} type="button" role="tab" aria-selected={value === tb.id} className={`dialog-tab${value === tb.id ? ' on' : ''}`} onClick={() => onChange(tb.id)}>
          {tb.label}{tb.count !== undefined && <span className="list-tab-count">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}

// The search bar: the text search, then the tab's own filters (children) and the count.
export function ListTools({ query, onQuery, placeholder, count, children }: { query: string; onQuery: (q: string) => void; placeholder: string; count?: string; children?: ReactNode }) {
  return (
    <div className="list-tools">
      <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {children}
      {count && <span className="muted small list-count">{count}</span>}
    </div>
  );
}

// Only an arrow; its name says where it goes ("Back to Agents").
export function BackArrow({ label, onBack }: { label: string; onBack: () => void }) {
  const name = t('Back to {list}', { list: label });
  return <button type="button" className="icon-btn back-arrow" onClick={onBack} title={name} aria-label={name}><IconArrowLeft size={18} /></button>;
}

export function ListBack({ label, onBack, children }: { label: string; onBack: () => void; children?: ReactNode }) {
  return (
    <div className="list-back">
      <BackArrow label={label} onBack={onBack} />
      {children}
    </div>
  );
}

// Whether an item matches the search: every word in its name or description.
export function matchesQuery(query: string, ...texts: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = texts.join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

// "1 agent" / "{n} agents": both keys are translated.
export const countLabel = (n: number, one: string, many: string) => (n === 1 ? t(one) : t(many, { n }));
