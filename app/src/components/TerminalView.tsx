// A terminal tab: xterm.js drawing a pseudo-terminal of the main process
// (desktop/terminals.ts). Hidden tabs stay mounted so their output is kept. The
// terminal outlives this view: unmounted (the project left), it keeps running in
// the main process; mounted again, it draws what it printed meanwhile and goes on.
// Closing its tab (Workspace) is what stops it.

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api';
import { t } from '../i18n';

interface Props { id: string; project: string; active: boolean; onExit: (code: number) => void }

const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function TerminalView({ id, project, active, onExit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    const bridge = api.term();
    if (!bridge || !box.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "JetBrains Mono", ui-monospace, Consolas, monospace',
      scrollback: 10000,
      theme: { background: css('--bg'), foreground: css('--text'), cursor: css('--accent'), selectionBackground: css('--accent-soft') },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(box.current);
    fit.fit();
    view.current = { term, fit };

    // Until we know whether it already runs, output is held: what it printed so far comes whole with attach.
    let held = true;
    let gone = false;
    const offData = bridge.on('data', (tid, data) => { if (tid === id && !held) term.write(String(data)); });
    const offExit = bridge.on('exit', (tid, code) => {
      if (tid !== id) return;
      term.write(`\r\n\x1b[2m[${t('process exited with code {code}', { code: String(code) })}]\x1b[0m\r\n`);
      exitRef.current(Number(code));
    });
    const input = term.onData((data) => bridge.input(id, data));
    const resize = term.onResize(({ cols, rows }) => bridge.resize(id, cols, rows));
    const begin = () => bridge.start(id, term.cols, term.rows, project).then((error) => { if (error && !gone) { term.write(`\x1b[31m${error}\x1b[0m\r\n`); exitRef.current(-1); } });
    void (bridge.attach ? bridge.attach(id) : Promise.resolve(null)).then((printed) => {
      if (gone) return undefined;
      held = false; // what came while waiting was printed before attach answered: it is in `printed`
      if (printed === null) return begin();
      term.write(printed);
      bridge.resize(id, term.cols, term.rows);
      return undefined;
    });

    // Follow the size of the tab; a hidden tab has no size, so it is skipped.
    const observer = new ResizeObserver(() => { if (box.current?.offsetParent) fit.fit(); });
    observer.observe(box.current);

    return () => {
      gone = true;
      observer.disconnect(); input.dispose(); resize.dispose(); offData(); offExit();
      term.dispose(); // the terminal itself keeps running: its tab may come back
      view.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!active || !view.current) return;
    view.current.fit.fit();
    view.current.term.focus();
  }, [active]);

  return <div ref={box} className="term-pane" hidden={!active} />;
}
