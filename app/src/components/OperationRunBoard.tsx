// An operation run on its board, as it was drawn when the run started: each card
// shows how its step is doing (done, running, waiting for you, failed...), the
// result it ended with and how many times it ran; the arrows the run took are
// highlighted. A step the run never reached is "pending" while it goes on and
// "skipped" once it ended (a branch not taken, not a failure). Read-only: a click
// on a card selects it (the run view shows its details beside the board).

import type { CSSProperties } from 'react';
import type { OperationRun, OperationVisit, ToolInfo } from '../api';
import { t } from '../i18n';
import { arrowPath, CARD_W, cardHeight, LANE_HEAD } from './opsBoard';

export type CardState = OperationVisit['status'] | 'asking' | 'pending' | 'skipped';

export const visitText = (v: OperationVisit) => (v.status === 'running' && v.question ? t('Waiting for you') : ({
  'awaiting-approval': t('Waiting for your approval'), ready: t('Ready to start'), running: t('In progress'), done: t('Step done'),
  failed: t('Failed'), cancelled: t('Cancelled'),
} as Record<string, string>)[v.status] ?? v.status);

export const hasBoard = (run: OperationRun) => run.steps.length > 0 && run.steps.every((s) => typeof s.x === 'number' && typeof s.y === 'number');

// How a step is doing: from its last visit, or whether the run can still reach it.
export function stateOf(run: OperationRun, stepId: string): CardState {
  const last = [...run.visits].reverse().find((v) => v.step === stepId);
  if (last) return last.status === 'running' && last.question ? 'asking' : last.status;
  return ['completed', 'cancelled'].includes(run.status) ? 'skipped' : 'pending';
}

const stateText: Record<string, () => string> = { asking: () => t('Waiting for you'), pending: () => t('Not reached yet'), skipped: () => t('Skipped') };

interface Props { run: OperationRun; tools: ToolInfo[]; selected: string; onSelect: (step: string) => void }

export function OperationRunBoard({ run, tools, selected, onSelect }: Props) {
  const steps = run.steps.map((s) => ({ ...s, x: s.x ?? 0, y: s.y ?? 0 }));
  const step = (id: string) => steps.find((s) => s.id === id);
  const card = (id: string) => { const s = step(id); return s && { x: s.x, y: s.y, outcomes: s.outcomes }; };
  const lanes = run.lanes ?? [];
  const width = Math.max(lanes.reduce((sum, l) => sum + l.width, 0), ...steps.map((s) => s.x + CARD_W + 60));
  const height = Math.max(LANE_HEAD + 120, ...steps.map((s) => s.y + cardHeight(s.outcomes) + 110));
  // The arrows the run went through: a visit and the visit it came from.
  const taken = new Set(run.visits.flatMap((v) => {
    const from = run.visits.find((x) => x.slot === v.from);
    return from ? [`${from.step}>${v.step}`] : [];
  }));
  const label = (id: string) => tools.find((x) => x.id === id)?.label.replace(/ \(.*\)$/, '') ?? id;

  return (
    <div className="ops-board-scroll ops-run-board">
      <div className="ops-board" style={{ width, height }}>
        {lanes.map((lane, i) => {
          const left = lanes.slice(0, i).reduce((sum, l) => sum + l.width, 0);
          return (
            <div key={lane.id} className="ops-lane" style={{ left, width: lane.width, height, '--lane': lane.color } as CSSProperties}>
              <div className="ops-lane-head"><span className="ops-lane-name">{lane.name}</span></div>
            </div>
          );
        })}
        <svg className="ops-arrows" width={width} height={height} aria-hidden="true">
          <defs>
            <marker id="ops-run-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" /></marker>
          </defs>
          {run.links.map((l, i) => {
            const a = card(l.from);
            const b = card(l.to);
            if (!a || !b) return null;
            const c = arrowPath(a, l.when ?? '', b);
            return <path key={i} className={`ops-arrow${l.gate === 'approval' ? ' gated' : ''}${taken.has(`${l.from}>${l.to}`) ? ' taken' : ''}`} d={c.d} markerEnd="url(#ops-run-head)" />;
          })}
        </svg>
        {run.links.map((l, i) => {
          const a = card(l.from);
          const b = card(l.to);
          if (!a || !b || !(l.when || l.gate === 'approval')) return null;
          const c = arrowPath(a, l.when ?? '', b);
          return (
            <span key={i} className={`ops-gate static${l.gate === 'approval' ? ' gated' : ''}`} style={{ left: c.mid.x, top: c.mid.y - 14 }}>
              {l.when && <span className="ops-gate-when">{l.when}</span>}{l.gate === 'approval' ? t('Approval') : ''}
            </span>
          );
        })}
        {steps.map((s) => {
          const state = stateOf(run, s.id);
          const visits = run.visits.filter((v) => v.step === s.id);
          const last = visits[visits.length - 1];
          const text = last && state !== 'asking' ? visitText(last) : stateText[state]?.() ?? '';
          return (
            <button key={s.id} type="button" data-step={s.id} data-state={state} className={`ops-card ops-run-card ${state}${selected === s.id ? ' on' : ''}`}
              style={{ left: s.x, top: s.y, width: CARD_W, height: cardHeight(s.outcomes) }} onClick={() => onSelect(s.id)}
              aria-label={t('Step {name}: {state}', { name: s.name, state: text })} aria-pressed={selected === s.id}>
              <span className="ops-card-head">
                <span className="ops-run-dot" aria-hidden="true" />
                <span className="ops-card-name">{s.name}</span>
                {visits.length > 1 && <span className="chip">×{visits.length}</span>}
              </span>
              <span className="ops-card-meta muted small">{label(s.ai)}</span>
              <span className="ops-run-card-state small">{text}</span>
              {last?.outcome && <span className="pill pill-outcome ops-card-pill">{last.outcome}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
