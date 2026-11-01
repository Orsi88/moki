// Settings › Operations: multi-agent operations, listed like the other tabs (ListPage);
// opening one shows its editor. Agents are cards on a board,
// linked by arrows: an arrow passes the files one agent delivers to the next,
// right away or after the user's approval, and says which output answers each
// input of the next agent (the rest is asked when the operation starts). This
// card has one dot per result its agent can end with (plus "otherwise"): an
// arrow from a result is followed only when the agent ends with it, and arrows
// may go back to an earlier step (a loop, limited per operation). The check below
// the board says what is missing. Coloured lanes split the board into phases (visual only: the arrows
// set the order). Dragging the empty board moves it. Saved in
// workspace/library/operations/.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { api, type Operation, type OperationAgent, type OperationCheck, type OperationDraft, type OperationLane, type OperationLink, type ToolInfo } from '../api';
import { t } from '../i18n';
import { recall, remember } from '../prefs';
import { IconAgent, IconCollapse, IconExpand, IconLanes, IconTrash, IconX } from '../components/Icons';
import { BackArrow, ListHead, ListTabs, ListTools, countLabel, matchesQuery } from '../components/ListPage';
import { StarButton, useFavorites } from '../components/Favorites';
import { arrowPath, BOARD_H, BOARD_W, CARD_H, CARD_W, cardHeight, dotOffset, dotsFor, LANE_HEAD } from '../components/opsBoard';

const BOARD_MIN = 180; // px: the board's height can be dragged between this and what leaves room for the panels below
const PANELS_MIN = 220; // px: the panels below the board keep at least this
const LANE_COLORS = ['#f1d27c', '#8fbf7f', '#7fb2e5', '#e8935a', '#c79be0', '#6cc5c0', '#e5675b', '#a8a196'];
const empty = (): OperationDraft => ({ name: '', description: '', start: '', maxRounds: 3, lanes: [], steps: [], links: [] });
const fields = (op: OperationDraft): OperationDraft => ({
  id: op.id, name: op.name, description: op.description, start: op.start ?? '', maxRounds: op.maxRounds ?? 3, lanes: op.lanes ?? [], steps: op.steps,
  links: op.links.map((l) => ({ ...l, when: l.when ?? '' })),
});
const snapshot = (d: OperationDraft | null) => JSON.stringify(d && { ...d, steps: d.steps, links: d.links });

// A block of the panels below the board: a small title, an optional hint, its content.
function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="ops-block">
      <h3>{title}</h3>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </div>
  );
}

type Selection = { kind: 'step'; id: string } | { kind: 'link'; i: number } | null; // an arrow by its place in the list (two may join the same cards)

interface Props { tools: ToolInfo[] }

export function Operations({ tools }: Props) {
  const fav = useFavorites('operations');
  const [list, setList] = useState<Operation[]>([]);
  const [agents, setAgents] = useState<OperationAgent[]>([]);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [saved, setSaved] = useState('');
  const [check, setCheck] = useState<OperationCheck | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [find, setFind] = useState(''); // the search bar of the list
  const [kind, setKind] = useState<'all' | 'ready' | 'warn' | 'err'>('all');
  const [linking, setLinking] = useState<{ from: string; when: string; x: number; y: number } | null>(null);
  const [painting, setPainting] = useState<string | null>(null); // the lane whose colour is being chosen
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const board = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  // The board's height, dragged on the bar below it (remembered); the two panels share the rest, never less than PANELS_MIN.
  const [wanted, setWanted] = useState(() => Math.max(Number(recall('qa-ops-board-h')) || 360, BOARD_MIN));
  const [room, setRoom] = useState(Number.POSITIVE_INFINITY); // the most the board can take in this window
  // Expanded: the board covers the whole window, its tools float over it as icons, and the
  // details of what is selected open on the right (CSS .ops-editor.expanded).
  const [expanded, setExpanded] = useState(false);
  const measure = useCallback(() => {
    const e = editor.current;
    const b = scroller.current;
    if (e && b) setRoom(e.getBoundingClientRect().bottom - b.getBoundingClientRect().top - 42 - PANELS_MIN); // padding, bar and gap
  }, []);
  const open_ = draft !== null;
  useEffect(() => {
    if (!open_) return undefined;
    measure();
    const watch = new ResizeObserver(measure);
    if (editor.current) watch.observe(editor.current);
    return () => watch.disconnect();
  }, [measure, open_]);
  const boardH = Math.round(Math.max(BOARD_MIN, Math.min(wanted, room)));
  const resizeBoard = (h: number) => {
    const next = Math.round(Math.max(BOARD_MIN, Math.min(h, room)));
    setWanted(next);
    remember('qa-ops-board-h', String(next));
  };
  // Escape leaves the expanded view only (caught first, so Settings does not close too).
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || el?.closest('.ops-palette')) return;
      e.stopPropagation();
      if (sel) setSel(null); else setExpanded(false); // first the details, then the expanded view
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded, sel]);
  const startSplit = (e: ReactPointerEvent) => {
    e.preventDefault();
    const start = { y: e.clientY, h: boardH };
    document.body.classList.add('resizing-rows');
    const move = (m: PointerEvent) => resizeBoard(start.h + m.clientY - start.y);
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); document.body.classList.remove('resizing-rows'); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  };
  const dirty = draft !== null && snapshot(draft) !== saved;

  const load = useCallback(() => {
    api.operations().then(setList).catch((e: Error) => setError(e.message));
    api.operationAgents().then(setAgents).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  // The check follows the draft (a moment after the last change).
  useEffect(() => {
    if (!draft) { setCheck(null); return; }
    const timer = setTimeout(() => { api.checkOperation(draft).then(setCheck).catch(() => { /* shown on save */ }); }, 200);
    return () => clearTimeout(timer);
  }, [draft]);

  const leave = () => !dirty || window.confirm(t('Discard the changes to this operation?'));
  const open = (op: OperationDraft | null) => {
    if (!leave()) return;
    const next = op ? fields(op) : empty();
    setDraft(next); setSaved(op ? snapshot(next) : ''); setSel(null); setError(''); setNotice(''); setAdding(!op);
  };

  const update = (fn: (d: OperationDraft) => OperationDraft) => setDraft((d) => (d ? fn(d) : d));
  const agentOf = (stepId: string) => agents.find((a) => a.key === draft?.steps.find((s) => s.id === stepId)?.agent);
  const stepName = (stepId: string) => agentOf(stepId)?.name ?? stepId;
  const outcomesOf = (stepId: string) => agentOf(stepId)?.outcomes ?? [];
  const dotsOf = (stepId: string) => dotsFor(outcomesOf(stepId));
  const heightOf = (stepId: string) => cardHeight(outcomesOf(stepId));
  const dotY = (stepId: string, when: string) => dotOffset(outcomesOf(stepId), when);

  // An arrow, with the outputs that answer the next agent's inputs suggested by name.
  const link = async (from: string, to: string, toAgent?: string, when = '') => {
    if (!draft || from === to || draft.links.some((l) => l.from === from && l.to === to && (l.when ?? '') === when)) return;
    const a = agentOf(from)?.key;
    const b = toAgent ?? agentOf(to)?.key; // a card added just now is not in this draft yet
    const map = a && b ? await api.suggestLink(a, b).catch(() => ({})) : {};
    const i = draft.links.length;
    update((d) => ({ ...d, links: [...d.links, { from, to, gate: 'approval', map, when }] }));
    setSel({ kind: 'link', i });
  };

  // A new card goes after the last one, already linked to the end of the line.
  const addAgent = (agent: OperationAgent) => {
    if (!draft) return;
    let n = draft.steps.length + 1;
    while (draft.steps.some((s) => s.id === `s${n}`)) n++;
    const id = `s${n}`;
    const i = draft.steps.length;
    const step = { id, agent: agent.key, x: 24 + (i % 5) * (CARD_W + 64), y: LANE_HEAD + 24 + Math.floor(i / 5) * (CARD_H + 64) };
    const end = [...draft.steps].reverse().find((s) => !draft.links.some((l) => l.from === s.id));
    update((d) => ({ ...d, steps: [...d.steps, step] }));
    setAdding(false); setQuery('');
    if (end) void link(end.id, id, agent.key); else setSel({ kind: 'step', id });
  };

  // ---------- lanes: coloured bands, left to right ----------
  const addLane = () => update((d) => {
    let n = d.lanes.length + 1;
    while (d.lanes.some((l) => l.id === `l${n}`)) n++;
    const color = LANE_COLORS.find((c) => !d.lanes.some((l) => l.color === c)) ?? LANE_COLORS[d.lanes.length % LANE_COLORS.length];
    return { ...d, lanes: [...d.lanes, { id: `l${n}`, name: t('Lane {n}', { n: d.lanes.length + 1 }), color, width: 300 }] };
  });
  const setLane = (id: string, patch: Partial<OperationLane>) => update((d) => ({ ...d, lanes: d.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const removeLane = (id: string) => update((d) => ({ ...d, lanes: d.lanes.filter((l) => l.id !== id) }));
  const startResize = (e: ReactPointerEvent, lane: OperationLane) => {
    e.stopPropagation(); e.preventDefault();
    const start = e.clientX;
    const move = (m: PointerEvent) => setLane(lane.id, { width: Math.min(Math.max(Math.round(lane.width + m.clientX - start), 160), 1200) });
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  };

  const removeStep = (id: string) => {
    update((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== id), links: d.links.filter((l) => l.from !== id && l.to !== id) }));
    setSel(null);
  };
  const setLink = (i: number, patch: Partial<OperationLink>) => update((d) => ({ ...d, links: d.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const removeLink = (i: number) => { update((d) => ({ ...d, links: d.links.filter((_, j) => j !== i) })); setSel(null); };

  const save = async () => {
    if (!draft) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const op = await api.saveOperation(draft);
      const next = fields(op);
      setDraft(next); setSaved(snapshot(next)); setCheck(op.check);
      setNotice(t('Saved in your operations.'));
      load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!draft?.id || !window.confirm(t('Delete the operation "{name}"?', { name: draft.name }))) return;
    try { await api.deleteOperation(draft.id); setDraft(null); setSaved(''); load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  // ---------- the board: drag a card to move it; drag from its dot to another card to link them ----------
  const at = (e: { clientX: number; clientY: number }) => {
    const r = board.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const startMove = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || !draft) return;
    const step = draft.steps.find((s) => s.id === id);
    if (!step) return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (m: PointerEvent) => {
      const dx = m.clientX - start.x;
      const dy = m.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      const x = Math.min(Math.max(step.x + dx, 0), BOARD_W - CARD_W);
      const y = Math.min(Math.max(step.y + dy, 0), BOARD_H - heightOf(id));
      update((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, x: Math.round(x), y: Math.round(y) } : s)) }));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop);
      if (!moved) setSel({ kind: 'step', id });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  };
  // Dragging the empty board moves the view; a click there clears the selection.
  const startPan = (e: ReactPointerEvent) => {
    const el = scroller.current;
    if (e.button !== 0 || !el || (e.target as HTMLElement).closest('.ops-card, .ops-gate, .ops-lane-head, .ops-lane-resize')) return;
    const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    let moved = false;
    el.classList.add('panning');
    const move = (m: PointerEvent) => {
      if (!moved && Math.abs(m.clientX - start.x) + Math.abs(m.clientY - start.y) < 4) return;
      moved = true;
      el.scrollLeft = start.left - (m.clientX - start.x);
      el.scrollTop = start.top - (m.clientY - start.y);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop);
      el.classList.remove('panning');
      if (!moved) { setSel(null); setPainting(null); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  };

  const startLink = (e: ReactPointerEvent, from: string, when = '') => {
    e.stopPropagation(); e.preventDefault();
    setLinking({ from, when, ...at(e) });
    const move = (m: PointerEvent) => setLinking({ from, when, ...at(m) });
    const stop = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop);
      setLinking(null);
      const target = (document.elementFromPoint(u.clientX, u.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-step]')?.dataset.step;
      if (target && target !== from) void link(from, target, undefined, when);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  };

  const shown = useMemo(() => agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(query.trim().toLowerCase())), [agents, query]);
  const steps = draft?.steps ?? [];
  const pos = (id: string) => steps.find((s) => s.id === id);
  const aiName = (id: string) => (id ? tools.find((x) => x.id === id)?.label.replace(/ \(.*\)$/, '') ?? id : t('Chosen when it runs'));
  const selectedLink = sel?.kind === 'link' ? draft?.links[sel.i] : undefined;
  const linkIndex = sel?.kind === 'link' ? sel.i : -1;
  const curve = (l: OperationLink) => {
    const a = pos(l.from);
    const b = pos(l.to);
    return a && b ? arrowPath({ ...a, outcomes: outcomesOf(l.from) }, l.when ?? '', { ...b, outcomes: outcomesOf(l.to) }) : null;
  };
  const otherwise = (stepId: string) => ((agentOf(stepId)?.outcomes ?? []).length ? t('otherwise') : '');
  const selectedStep = sel?.kind === 'step' ? steps.find((s) => s.id === sel.id) : undefined;
  const stateOf = (op: Operation) => (op.check.errors.length ? 'err' : op.check.warnings.length ? 'warn' : 'ready');
  const listed = list.filter((op) => (kind === 'all' || stateOf(op) === kind) && matchesQuery(find, op.name, op.description));
  const back = () => { if (leave()) { setDraft(null); setSaved(''); setError(''); setNotice(''); setExpanded(false); } };

  return (
    <div className="library library-single operations">
      <main className="library-main">
        {!draft ? (
          <div className="list-page">
            <ListHead title={t('Operations')} intro={t('Link your agents with arrows to build an operation: each agent is a step, and an arrow passes the files one delivers to the next. Then use it in your projects.')}
              action={<button type="button" className="btn" onClick={() => open(null)}>{t('New operation')}</button>} />
            <ListTabs label={t('Operations')} value={kind} onChange={setKind} tabs={([
              ['all', t('All')], ['ready', t('Ready ones')], ['warn', t('With warnings')], ['err', t('With errors')],
            ] as const).map(([id, label]) => ({ id, label, count: list.filter((op) => id === 'all' || stateOf(op) === id).length }))} />
            <ListTools query={find} onQuery={setFind} placeholder={t('Search operations')} count={countLabel(listed.length, '1 operation', '{n} operations')} />
            {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
            <ul className="list-cards">
              {fav.first(listed, (op) => op.id).map((op) => (
                <li key={op.id} className="fav-item">
                  <button type="button" className="list-card library-item" onClick={() => open(op)}>
                    <span className="list-card-title"><span className={`dot ${stateOf(op) === 'err' ? 'dot-err' : stateOf(op) === 'warn' ? 'dot-warn' : 'dot-ok'}`} />{op.name}</span>
                    {op.description && <span className="list-card-desc">{op.description}</span>}
                    <span className="chips">
                      <span className="chip">{countLabel(op.steps.length, '1 step', '{n} steps')}</span>
                      {stateOf(op) !== 'ready' && <span className="chip">{stateOf(op) === 'err' ? t('With errors') : t('With warnings')}</span>}
                    </span>
                  </button>
                  <StarButton on={fav.has(op.id)} name={op.name} onToggle={() => fav.toggle(op.id)} />
                </li>
              ))}
            </ul>
            {!listed.length && <p className="list-empty">{list.length ? t('No operation with these filters.') : t('No operations yet. Create the first one with New operation.')}</p>}
          </div>
        ) : (
          <div className={`ops-editor${expanded ? ' expanded' : ''}`} ref={editor}>
            {error && <div className="error-bar">{error}<button type="button" className="icon-btn" onClick={() => setError('')}><IconX size={14} /></button></div>}
            {notice && !dirty && <div className="error-bar info-bar" role="status">{notice}<button type="button" className="icon-btn" onClick={() => setNotice('')}><IconX size={14} /></button></div>}
            <header className="ops-head">
              <BackArrow label={t('Operations')} onBack={back} />
              <div className="ops-titles">
                <input className="ops-name" value={draft.name} maxLength={80} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
                  placeholder={t('Name of the operation, e.g. Review and tests')} aria-label={t('Name of the operation')} />
                <input className="ops-description" value={draft.description} maxLength={1000} onChange={(e) => update((d) => ({ ...d, description: e.target.value }))}
                  placeholder={t('What it is for (optional)')} aria-label={t('Description')} />
              </div>
              <div className="row-actions">
                {draft.id && <button type="button" className="icon-btn" onClick={() => { void remove(); }} title={t('Delete this operation')} aria-label={t('Delete this operation')}><IconTrash size={17} /></button>}
                <button type="button" className="btn" disabled={busy || !dirty || !draft.name.trim() || Boolean(check?.errors.length)} onClick={() => { void save(); }}>
                  {busy ? t('Saving…') : t('Save')}
                </button>
              </div>
            </header>

            <div className="ops-toolbar">
              <div className="ops-add">
                <button type="button" className="btn btn-ghost btn-sm ops-tool" aria-expanded={adding} onClick={() => setAdding((v) => !v)} title={t('Add agent')} aria-label={`+ ${t('Add agent')}`}>
                  <IconAgent size={15} /><span className="ops-tool-label">{t('Add agent')}</span>
                </button>
                {adding && (
                  <div className="ops-palette" role="dialog" aria-label={t('Add agent')}>
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search your agents')} aria-label={t('Search your agents')}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); } }} />
                    <ul>
                      {shown.map((a) => (
                        <li key={a.key}>
                          <button type="button" onClick={() => addAgent(a)} title={a.description}>
                            <span className="ops-palette-name">{a.name}</span>
                            <span className="muted small">{a.source === 'global' ? t('all projects') : ''} {t('{i} in · {o} out', { i: a.inputs.length, o: a.outputs.length })}</span>
                          </button>
                        </li>
                      ))}
                      {!shown.length && <li className="muted small">{t('No agent matches.')}</li>}
                    </ul>
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-sm ops-tool" onClick={addLane} disabled={draft.lanes.length >= 12} title={t('Add lane')} aria-label={`+ ${t('Add lane')}`}>
                <IconLanes size={15} /><span className="ops-tool-label">{t('Add lane')}</span>
              </button>
              <label className="ops-rounds small" title={t('Times a step may run')}>
                <span className="ops-tool-label">{t('Each step runs at most')}</span>
                <input type="number" min={1} max={10} value={draft.maxRounds ?? 3} aria-label={t('Times a step may run')}
                  onChange={(e) => update((d) => ({ ...d, maxRounds: Math.min(Math.max(Math.round(Number(e.target.value) || 1), 1), 10) }))} />
                <span className="ops-tool-label">{t('times (loops)')}</span>
              </label>
              {expanded && (
                <button type="button" className="btn btn-ghost btn-sm ops-tool ops-expand" aria-pressed onClick={() => { setExpanded(false); setAdding(false); }}
                  title={t('Back to the normal size (Esc)')} aria-label={t('Collapse')}><IconCollapse size={15} /></button>
              )}
              {expanded && (
                <button type="button" className="btn btn-sm ops-float-save" disabled={busy || !dirty || !draft.name.trim() || Boolean(check?.errors.length)} onClick={() => { void save(); }}>
                  {busy ? t('Saving…') : t('Save')}
                </button>
              )}
              <span className="muted small ops-tool-label ops-hint">{t('Drag a card to move it. Drag from its dot to another card to pass its work there. Drag the empty board to move around.')}</span>
            </div>

            <div className="ops-board-frame">
            <div className="ops-board-scroll" ref={scroller} style={{ height: boardH }}>
              <div className="ops-board" ref={board} style={{ width: BOARD_W, height: BOARD_H }} onPointerDown={startPan}>
                {draft.lanes.map((lane, i) => {
                  const left = draft.lanes.slice(0, i).reduce((sum, l) => sum + l.width, 0);
                  const style = { left, width: lane.width, height: BOARD_H, '--lane': lane.color } as CSSProperties;
                  return (
                    <div key={lane.id} className="ops-lane" style={style}>
                      <div className="ops-lane-head">
                        <button type="button" className="ops-lane-swatch" onClick={() => setPainting((p) => (p === lane.id ? null : lane.id))}
                          title={t('Lane colour')} aria-label={t('Colour of {name}', { name: lane.name })} aria-expanded={painting === lane.id} />
                        <input value={lane.name} maxLength={40} onChange={(e) => setLane(lane.id, { name: e.target.value })} aria-label={t('Lane name')} />
                        <button type="button" className="icon-btn" onClick={() => removeLane(lane.id)} title={t('Remove lane')} aria-label={t('Remove lane {name}', { name: lane.name })}><IconX size={12} /></button>
                        {painting === lane.id && (
                          <div className="ops-lane-colors" role="group" aria-label={t('Lane colour')}>
                            {LANE_COLORS.map((c) => (
                              <button key={c} type="button" className={`ops-lane-color${c === lane.color ? ' on' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={c === lane.color}
                                onClick={() => { setLane(lane.id, { color: c }); setPainting(null); }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="ops-lane-resize" onPointerDown={(e) => startResize(e, lane)} title={t('Drag to change the width')} />
                    </div>
                  );
                })}
                <svg className="ops-arrows" width={BOARD_W} height={BOARD_H} aria-hidden="true">
                  <defs>
                    <marker id="ops-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" /></marker>
                  </defs>
                  {draft.links.map((l, i) => {
                    const c = curve(l);
                    return c && <path key={i} className={`ops-arrow${i === linkIndex ? ' on' : ''}${l.gate === 'approval' ? ' gated' : ''}`} d={c.d} markerEnd="url(#ops-head)" />;
                  })}
                  {linking && (() => { const a = pos(linking.from); return a ? <path className="ops-arrow linking" d={`M${a.x + CARD_W} ${a.y + dotY(linking.from, linking.when)} L${linking.x} ${linking.y}`} markerEnd="url(#ops-head)" /> : null; })()}
                </svg>
                {draft.links.map((l, i) => {
                  const c = curve(l);
                  if (!c) return null;
                  const when = l.when || otherwise(l.from);
                  return (
                    <button key={i} type="button" className={`ops-gate${l.gate === 'approval' ? ' gated' : ''}${i === linkIndex ? ' on' : ''}`} style={{ left: c.mid.x, top: c.mid.y - 14 }}
                      onClick={() => setSel({ kind: 'link', i })} aria-label={when ? t('Arrow {from} to {to}, when {result}', { from: stepName(l.from), to: stepName(l.to), result: when }) : t('Arrow {from} to {to}', { from: stepName(l.from), to: stepName(l.to) })}>
                      {when && <span className="ops-gate-when">{when}</span>}{l.gate === 'approval' ? t('Approval') : t('Direct')}
                    </button>
                  );
                })}
                {steps.map((s) => {
                  const agent = agentOf(s.id);
                  const n = check?.order.indexOf(s.id) ?? -1;
                  const executes = agent?.mcps.some((m) => m.mode === 'execute');
                  return (
                    <div key={s.id} data-step={s.id} role="button" tabIndex={0} aria-label={t('Step {name}', { name: agent?.name ?? s.agent })}
                      className={`ops-card${selectedStep === s ? ' on' : ''}${agent ? '' : ' missing'}`} style={{ left: s.x, top: s.y, width: CARD_W, height: heightOf(s.id) }}
                      onPointerDown={(e) => startMove(e, s.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel({ kind: 'step', id: s.id }); }}>
                      <div className="ops-card-head">
                        {n >= 0 && <span className="ops-card-n">{n + 1}</span>}
                        <span className="ops-card-name">{agent?.name ?? s.agent.replace(/^\w+:/, '')}</span>
                        {check?.start === s.id && <span className="ops-card-start">{t('Start')}</span>}
                      </div>
                      <div className="ops-card-meta muted small">
                        {agent ? <>{t('{i} in · {o} out', { i: agent.inputs.length, o: agent.outputs.length })} · {aiName(agent.ai)}</> : t('Agent not available')}
                      </div>
                      {executes && <span className="pill pill-warn ops-card-pill">{t('Executes via MCP')}</span>}
                      {dotsOf(s.id).map((w) => (
                        <span key={w || '*'}>
                          <button type="button" className={`ops-dot${w ? ' outcome' : ''}`} style={{ top: dotY(s.id, w) }} onPointerDown={(e) => startLink(e, s.id, w)}
                            title={w ? t('Drag to the step that follows "{result}"', { result: w }) : t('Drag to the next step')}
                            aria-label={w ? t('Link {name} when it ends with "{result}"', { name: agent?.name ?? s.id, result: w }) : t('Link {name} to another step', { name: agent?.name ?? s.id })} />
                          {dotsOf(s.id).length > 1 && <span className="ops-dot-label" style={{ top: dotY(s.id, w) }}>{w || t('otherwise')}</span>}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            {!expanded && (
              <button type="button" className="icon-btn ops-board-expand" onClick={() => { setExpanded(true); setAdding(false); }}
                title={t('Use the whole window for the board')} aria-label={t('Expand')}><IconExpand size={15} /></button>
            )}
            </div>

            <div className="ops-splitter" role="separator" aria-orientation="horizontal" aria-label={t('Board height')} tabIndex={0}
              aria-valuenow={boardH} aria-valuemin={BOARD_MIN} title={t('Drag to make the board taller or shorter')}
              onPointerDown={startSplit} onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); resizeBoard(boardH + (e.key === 'ArrowDown' ? 40 : -40)); } }}>
              <span />
            </div>

            <div className="ops-panels">
              <section className={`ops-panel ops-inspector${sel ? ' has-sel' : ''}`} aria-label={t('Selected')}>
                {selectedLink ? (() => {
                  const a = agentOf(selectedLink.from);
                  const b = agentOf(selectedLink.to);
                  const always = b?.mcps.some((m) => m.mode === 'execute');
                  return (
                    <>
                      <header className="ops-panel-head">
                        <div>
                          <span className="ops-kicker">{t('Arrow')}</span>
                          <h2>{stepName(selectedLink.from)} → {stepName(selectedLink.to)}</h2>
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLink(linkIndex)}>{t('Remove arrow')}</button>
                      </header>
                      <div className="ops-panel-body">
                        <Block title={t('When to follow it')}>
                          {(a?.outcomes ?? []).length > 0 && (
                            <label className="field">
                              <span className="muted small">{t('Taken when {from} ends with', { from: stepName(selectedLink.from) })}</span>
                              <select value={selectedLink.when ?? ''} onChange={(e) => setLink(linkIndex, { when: e.target.value })} aria-label={t('Result that leads here')}>
                                {(a?.outcomes ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                                <option value="">{t('Any other result (otherwise)')}</option>
                              </select>
                            </label>
                          )}
                          <fieldset className="ops-choice">
                            <legend className="muted small">{t('When {from} finishes', { from: stepName(selectedLink.from) })}</legend>
                            <label className={selectedLink.gate === 'auto' ? 'on' : ''}><input type="radio" name="gate" checked={selectedLink.gate === 'auto'} onChange={() => setLink(linkIndex, { gate: 'auto' })} /> {t('Go on to {to} right away', { to: stepName(selectedLink.to) })}</label>
                            <label className={selectedLink.gate === 'approval' ? 'on' : ''}><input type="radio" name="gate" checked={selectedLink.gate === 'approval'} onChange={() => setLink(linkIndex, { gate: 'approval' })} /> {t('Wait for my approval')}</label>
                          </fieldset>
                          {always && <p className="warn-text small">{t('{to} executes through an MCP: the operation always asks you before it.', { to: stepName(selectedLink.to) })}</p>}
                        </Block>
                        <Block title={t('What {to} receives', { to: stepName(selectedLink.to) })}
                          hint={t('{to} receives every file {from} delivers. Here you say which one answers each input; the others are asked when the operation starts.', { to: stepName(selectedLink.to), from: stepName(selectedLink.from) })}>
                          {b && b.inputs.length ? (
                            <table className="ops-map">
                              <tbody>
                                {b.inputs.map((input) => (
                                  <tr key={input}>
                                    <th scope="row">{input}</th>
                                    <td>
                                      <select value={selectedLink.map[input] ?? ''} aria-label={t('Answer to {input}', { input })}
                                        onChange={(e) => {
                                          const map = { ...selectedLink.map };
                                          if (e.target.value) map[input] = e.target.value; else delete map[input];
                                          setLink(linkIndex, { map });
                                        }}>
                                        <option value="">{t('Asked when it starts')}</option>
                                        {(a?.outputs ?? []).map((o) => <option key={o} value={o}>{t('{file}, from {from}', { file: o, from: a?.name ?? '' })}</option>)}
                                      </select>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <p className="muted small">{t('{to} declares no inputs.', { to: stepName(selectedLink.to) })}</p>}
                        </Block>
                      </div>
                    </>
                  );
                })() : selectedStep ? (() => {
                  const agent = agentOf(selectedStep.id);
                  const incoming = draft.links.filter((l) => l.to === selectedStep.id);
                  const outgoing = draft.links.map((l, i) => ({ l, i })).filter(({ l }) => l.from === selectedStep.id);
                  const targets = steps.filter((s) => s.id !== selectedStep.id);
                  const n = check?.order.indexOf(selectedStep.id) ?? -1;
                  return (
                    <>
                      <header className="ops-panel-head">
                        <div>
                          <span className="ops-kicker">{n >= 0 ? t('Step {n}', { n: n + 1 }) : t('Step not linked')}{check?.start === selectedStep.id && ` · ${t('Start')}`}</span>
                          <h2>{agent?.name ?? selectedStep.agent}</h2>
                        </div>
                        <span className="row-actions">
                          {check?.start !== selectedStep.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => update((d) => ({ ...d, start: selectedStep.id }))}>{t('Start with this step')}</button>}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeStep(selectedStep.id)}>{t('Remove step')}</button>
                        </span>
                      </header>
                      <div className="ops-panel-body">
                        {agent && <p className="muted small ops-description">{agent.description}</p>}
                        {agent && (
                          <>
                            <Block title={t('Receives')}>
                              {agent.inputs.length ? (
                                <ul className="ops-rows">
                                  {agent.inputs.map((i) => {
                                    const from = incoming.find((l) => l.map[i]);
                                    return (
                                      <li key={i}>
                                        <span>{i}</span>
                                        {from ? <span className="ops-tag from">← {from.map[i]} · {stepName(from.from)}</span> : <span className="ops-tag ask">{t('Asked when it starts')}</span>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : <p className="muted small">{t('Needs nothing to start.')}</p>}
                            </Block>
                            <Block title={t('Delivers')}>
                              {agent.outputs.length
                                ? <div className="chips">{agent.outputs.map((o) => <span key={o} className="chip">{o}</span>)}</div>
                                : <p className={`small ${outgoing.length ? 'warn-text' : 'muted'}`}>{t('None: it delivers text only')}</p>}
                            </Block>
                            {(agent.outcomes ?? []).length > 0 && (
                              <Block title={t('Possible results')}>
                                <div className="chips">{agent.outcomes?.map((o) => <span key={o} className="chip ops-outcome">{o}</span>)}</div>
                              </Block>
                            )}
                            <Block title={t('Uses')}>
                              <ul className="ops-rows">
                                {agent.mcps.map((m) => (
                                  <li key={m.name}><span>{m.name}</span><span className={`ops-tag ${m.mode === 'execute' ? 'exec' : ''}`}>{m.mode === 'execute' ? t('Executes') : t('Reads')}</span></li>
                                ))}
                                <li><span>{t('Default AI')}</span><span className="ops-tag">{aiName(agent.ai)}</span></li>
                              </ul>
                            </Block>
                          </>
                        )}
                        <Block title={t('Next step')}>
                          {outgoing.length > 0 && (
                            <ul className="ops-rows">
                              {outgoing.map(({ l, i }) => (
                                <li key={i}>
                                  <button type="button" className="link" onClick={() => setSel({ kind: 'link', i })}>→ {stepName(l.to)}</button>
                                  <span className="ops-tags">
                                    {(l.when || otherwise(l.from)) && <span className="ops-tag from">{l.when || otherwise(l.from)}</span>}
                                    <span className={`ops-tag ${l.gate === 'approval' ? 'ask' : ''}`}>{l.gate === 'approval' ? t('Approval') : t('Direct')}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {!outgoing.some(({ l }) => !l.when) && targets.length > 0 && (
                            <select value="" onChange={(e) => { if (e.target.value) void link(selectedStep.id, e.target.value); }} aria-label={t('After this step')}>
                              <option value="">{outgoing.length ? t('Add a next step…') : t('Choose the next step…')}</option>
                              {targets.map((s) => <option key={s.id} value={s.id}>{stepName(s.id)}</option>)}
                            </select>
                          )}
                          {!outgoing.length && !targets.length && <p className="muted small">{t('This is the last step.')}</p>}
                        </Block>
                        <p className="muted small">{t('To change its inputs, outputs, MCP servers or AI, edit the agent in Settings › Agents.')}</p>
                      </div>
                    </>
                  );
                })() : (
                  <>
                    <header className="ops-panel-head"><div><span className="ops-kicker">{t('Details')}</span><h2>{t('Nothing selected')}</h2></div></header>
                    <div className="ops-panel-body"><p className="muted small">{t('Select a card or an arrow to see and change it.')}</p></div>
                  </>
                )}
              </section>

              <section className="ops-panel ops-check" aria-label={t('Check')}>
                <header className="ops-panel-head">
                  <div><span className="ops-kicker">{t('Before saving')}</span><h2>{t('Check')}</h2></div>
                  {check && (check.errors.length
                    ? <span className="pill pill-blocked">{t('{n} to fix', { n: check.errors.length })}</span>
                    : check.warnings.length ? <span className="pill pill-awaiting-approval">{t('{n} to look at', { n: check.warnings.length })}</span>
                      : steps.length > 0 && <span className="pill pill-completed">{t('Ready')}</span>)}
                </header>
                <div className="ops-panel-body">
                  {!check ? <p className="muted small">…</p> : (
                    <>
                      {check.errors.length > 0 && (
                        <Block title={t('To fix')}>
                          <ul className="ops-msgs">{check.errors.map((m, i) => <li key={`e${i}`} className="error small">{t(m.text, m.params)}</li>)}</ul>
                        </Block>
                      )}
                      {check.warnings.length > 0 && (
                        <Block title={t('To look at')}>
                          <ul className="ops-msgs">{check.warnings.map((m, i) => <li key={`w${i}`} className="warn-text small">{t(m.text, m.params)}</li>)}</ul>
                        </Block>
                      )}
                      {!check.errors.length && !check.warnings.length && steps.length > 0 && <p className="ops-msg ok-text small">{t('Ready to use.')}</p>}
                      {check.initialInputs.length > 0 && (
                        <Block title={t('Asked when it starts')}>
                          <ul className="ops-initial">
                            {[...new Set(check.initialInputs.map((i) => i.agent))].map((agentName) => (
                              <li key={agentName}>
                                <span className="ops-initial-agent">{agentName}</span>
                                <span className="chips">{check.initialInputs.filter((i) => i.agent === agentName).map((i) => <span key={`${i.step}:${i.input}`} className="chip">{i.input}</span>)}</span>
                              </li>
                            ))}
                          </ul>
                        </Block>
                      )}
                      {check.approvals.length > 0 && (
                        <Block title={t('Waits for you before')}>
                          <div className="chips">{check.approvals.map((id) => <span key={id} className="chip">{stepName(id)}</span>)}</div>
                        </Block>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
