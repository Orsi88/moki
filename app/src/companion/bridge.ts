// window.qa inside the VS Code webview: each call goes to the extension host as a
// message and comes back with the same id (ide/vscode/host.ts answers through
// desktop/companion-api.ts). So app/src/api.ts works here unchanged.

import type { Bridge } from '../api';

interface VsCodeApi { postMessage(message: unknown): void }
declare function acquireVsCodeApi(): VsCodeApi;

type Reply = { ok: true; value: unknown } | { ok: false; error: string };

export function installBridge(): void {
  const vscode = acquireVsCodeApi(); // may be called only once per page
  let next = 1;
  const pending = new Map<number, (r: Reply) => void>();
  const changed = new Set<(project: string) => void>();
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { id?: number; reply?: Reply; event?: string; project?: string };
    if (typeof msg?.id === 'number' && msg.reply) { pending.get(msg.id)?.(msg.reply); pending.delete(msg.id); }
    else if (msg?.event === 'changed') changed.forEach((cb) => cb(msg.project ?? ''));
  });
  const bridge: Bridge = {
    call: (method, ...args) => new Promise<Reply>((resolve) => {
      const id = next++;
      pending.set(id, resolve);
      vscode.postMessage({ id, method, args });
    }),
    filePath: () => '',
    watch: async () => true,
    onChanged: (cb) => { changed.add(cb); return () => { changed.delete(cb); }; },
    openLink: async (url) => { vscode.postMessage({ event: 'openLink', url }); },
    openNoteWindow: async () => false,
    notesChanged: () => {},
    onNotesChanged: () => () => {},
    noteMax: () => {},
  };
  window.qa = bridge;
}

// A call to the panel's own actions (desktop/companion-api.ts), by name.
export async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const res = await window.qa!.call(method, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value as T;
}
