// Bridge between the UI and the main process. The UI gets only these
// functions; every call is validated again in main.ts / service.ts.

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('qa', {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('qa:call', method, args),
  // The renderer cannot read a dropped file's path. This returns it, and the service copies the file in.
  filePath: (file: Parameters<typeof webUtils.getPathForFile>[0]) => webUtils.getPathForFile(file),
  watch: (project: string) => ipcRenderer.invoke('qa:watch', project),
  onChanged: (callback: (project: string) => void) => {
    const listener = (_e: IpcRendererEvent, project: string) => callback(project);
    ipcRenderer.on('qa:changed', listener);
    return () => { ipcRenderer.removeListener('qa:changed', listener); };
  },
  openLink: (url: string) => ipcRenderer.invoke('qa:open-link', url),
  usage: (refresh: boolean) => ipcRenderer.invoke('qa:usage', refresh),
  openNoteWindow: (target: { project?: string | null; path?: string | null; loose?: string | null; theme?: string }) => ipcRenderer.invoke('qa:note-window', target),
  openSearchWindow: () => ipcRenderer.invoke('qa:search-window'),
  closeSearchWindow: () => ipcRenderer.send('qa:search-close'),
  searchOpen: (project: string, path: string) => ipcRenderer.send('qa:search-open', project, path),
  notesChanged: () => ipcRenderer.send('qa:notes-changed'),
  onNotesChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('qa:notes-changed', listener);
    return () => { ipcRenderer.removeListener('qa:notes-changed', listener); };
  },
  noteMax: () => ipcRenderer.send('qa:note-max'),
  // In a notebook window: another note of its group, to show as a tab.
  onNotebookOpen: (callback: (target: { project: string | null; path: string | null; loose: string | null }) => void) => {
    const listener = (_e: IpcRendererEvent, target: { project: string | null; path: string | null; loose: string | null }) => callback(target);
    ipcRenderer.on('qa:notebook-open', listener);
    return () => { ipcRenderer.removeListener('qa:notebook-open', listener); };
  },
  // From a note window: show a terminal it started, or open a mentioned file, in the main window.
  showTerminal: (project: string, terminal: { id: string; title: string }) => ipcRenderer.send('qa:show-terminal', project, terminal?.id, terminal?.title),
  openInMain: (project: string, path: string) => ipcRenderer.send('qa:open-in-main', project, path),
  onShowTerminal: (callback: (project: string, terminal: { id: string; title: string }) => void) => {
    const listener = (_e: IpcRendererEvent, project: string, terminal: { id: string; title: string }) => callback(project, terminal);
    ipcRenderer.on('qa:show-terminal', listener);
    return () => { ipcRenderer.removeListener('qa:show-terminal', listener); };
  },
  onOpenInMain: (callback: (project: string, path: string) => void) => {
    const listener = (_e: IpcRendererEvent, project: string, path: string) => callback(project, path);
    ipcRenderer.on('qa:open-in-main', listener);
    return () => { ipcRenderer.removeListener('qa:open-in-main', listener); };
  },
  term: {
    create: (tool: string) => ipcRenderer.invoke('qa:term-new', tool),
    start: (id: string, cols: number, rows: number, project: string) => ipcRenderer.invoke('qa:term-start', id, cols, rows, project),
    input: (id: string, data: string) => ipcRenderer.send('qa:term-input', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('qa:term-resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.send('qa:term-kill', id),
    list: (project: string) => ipcRenderer.invoke('qa:term-list', project),
    attach: (id: string) => ipcRenderer.invoke('qa:term-attach', id),
    on: (event: 'data' | 'exit', callback: (id: string, payload: string | number) => void) => {
      const listener = (_e: IpcRendererEvent, id: string, payload: string | number) => callback(id, payload);
      ipcRenderer.on(`qa:term-${event}`, listener);
      return () => { ipcRenderer.removeListener(`qa:term-${event}`, listener); };
    },
  },
});
