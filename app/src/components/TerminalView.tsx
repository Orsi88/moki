// A terminal tab: xterm.js drawing a pseudo-terminal of the main process
// (desktop/terminals.ts). Hidden tabs stay mounted so their output is kept. The
// terminal outlives this view: unmounted (the project left), it keeps running in
// the main process; mounted again, it draws what it printed meanwhile and goes on.
// Closing its tab (Workspace) is what stops it. The xterm.js terminal (and its scrollback) is only
// created when the tab is first shown; until then the output is kept as plain text.

import { useEffect, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css'; // only the styles are static (a side-effect import needs no types); the code loads when a tab is first shown
import { api } from '../api';
import { t } from '../i18n';

interface Props { id: string; project: string; active: boolean; onExit: (code: number) => void }

const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const KEEP = 128 * 1024; // as much plain output as the main process keeps (desktop/terminals.ts), for a tab not shown yet

export function TerminalView({ id, project, active, onExit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const build = useRef<(() => Promise<void>) | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const bridge = api.term();
    if (!bridge || !box.current) return;
    const host = box.current;
    let term: Terminal | null = null;
    let pending = ''; // output that came before the xterm.js terminal exists
    let building: Promise<void> | null = null;
    // Until we know whether it already runs, output is held: what it printed so far comes whole with attach.
    let held = true;
    let gone = false;
    // `confirm`: the output came from the process, so the main process learns it was drawn (or kept as text) and can keep the process running.
    const write = (text: string, confirm = false): void => {
      if (term) term.write(text, confirm ? () => bridge.ack?.(id, text.length) : undefined);
      else {
        pending = pending.length + text.length > KEEP ? (pending + text).slice(-KEEP) : pending + text;
        if (confirm) bridge.ack?.(id, text.length);
      }
    };

    const offData = bridge.on('data', (tid, data) => {
      if (tid !== id) return;
      const text = String(data);
      if (held) bridge.ack?.(id, text.length); // dropped: it is in what attach returns
      else write(text, true);
    });
    const offExit = bridge.on('exit', (tid, code) => {
      if (tid !== id) return;
      write(`\r\n\x1b[2m[${t('process exited with code {code}', { code: String(code) })}]\x1b[0m\r\n`);
      exitRef.current(Number(code));
    });
    const listeners: { dispose(): void }[] = [];

    // Creates the xterm.js terminal the first time the tab is shown (its scrollback is the memory cost of a terminal).
    const create = (): Promise<void> => building ??= (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (gone) return;
      const made = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"Cascadia Code", "JetBrains Mono", ui-monospace, Consolas, monospace',
        scrollback: 3000,
        theme: { background: css('--bg'), foreground: css('--text'), cursor: css('--accent'), selectionBackground: css('--accent-soft') },
      });
      const fit = new FitAddon();
      made.loadAddon(fit);
      made.open(host);
      fit.fit();
      listeners.push(made.onData((data) => bridge.input(id, data)), made.onResize(({ cols, rows }) => bridge.resize(id, cols, rows)));
      view.current = { term: made, fit };
      term = made;
      made.write(pending);
      pending = '';
      if (activeRef.current) { fit.fit(); made.focus(); }
    })();
    build.current = create;

    const begin = () => bridge.start(id, term?.cols ?? 80, term?.rows ?? 24, project).then((error) => { if (error && !gone) { write(`\x1b[31m${error}\x1b[0m\r\n`); exitRef.current(-1); } });
    // A tab opened to be seen gets its size before the process starts; a hidden one starts at the default size and is resized when first shown.
    void Promise.all([bridge.attach ? bridge.attach(id) : Promise.resolve(null), activeRef.current ? create() : undefined]).then(([printed]) => {
      if (gone) return undefined;
      held = false; // what came while waiting was printed before attach answered: it is in `printed`
      if (printed === null) return begin();
      write(printed);
      if (term) bridge.resize(id, term.cols, term.rows);
      return undefined;
    });

    // Follow the size of the tab; a hidden tab has no size, so it is skipped.
    const observer = new ResizeObserver(() => { if (host.offsetParent) view.current?.fit.fit(); });
    observer.observe(host);

    return () => {
      gone = true;
      build.current = null;
      observer.disconnect(); listeners.forEach((l) => l.dispose()); offData(); offExit();
      bridge.detach?.(id);
      term?.dispose(); // the terminal itself keeps running: its tab may come back
      view.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!active) return;
    if (!view.current) { void build.current?.(); return; }
    view.current.fit.fit();
    view.current.term.focus();
  }, [active]);

  return <div ref={box} className="term-pane" hidden={!active} />;
}
