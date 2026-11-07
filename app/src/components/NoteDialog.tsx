// A note: a project note (Markdown in notes/) or a loose one, in the main area of
// the app, in a popup or in a notebook tab, with a formatting bar and a reading view.
// It saves on its own while typing and when it is left, like Notepad. path null = a
// new note: its file is created once something is written (named after the title,
// or the first line).
//
// Tools: bold, italic, strikethrough, titles, bulleted / numbered / check lists (Enter
// continues them), quote, code, link (Ctrl+K), table, divider, images (paste, drop or
// the button; stored inside the note), / for the same tools by typing (like Notion),
// @ to mention a file of the project, and "Use with the AI" to start an activity with
// the note as input.

import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type ReactNode, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { api, type ActivityInfo, type Tag, type ToolInfo, type TreeNode } from '../api';
import { conversationLanguage, t } from '../i18n';
import { preferredTool } from '../prefs';
import { isFavorite, looseNotes, noteTitle, removeLooseNote, saveLooseNote, setFavorite, touchNote, type NoteRef } from '../side-menu';
import { ActivityCatalog } from './ActivityCatalog';
import { LazyTipTap } from './LazyTipTap';
import type { TipTapCommand, TipTapHandle } from './TipTapEditor';
import { DiagramSourceEditor } from './DiagramSourceEditor';
import { CatIcon } from './CatIcon';
import { ACTIVITY_CAT } from '../icons/cats';
import { FileIcon } from '../icons';
import { IconChevron, IconCode, IconEdit, IconExternal, IconFile, IconEye, IconLink, IconNotes, IconPlay, IconRefresh, IconStar, IconTerminal, IconX } from './Icons';
import { ToolCatalog } from './ToolCatalog';
import { TagPicker } from './TagPicker';
import { flushEdits } from '../debounce';
import { TABLE_ICON, useMarkdownEditing } from './useMarkdownEditing';

interface Props {
  project: string | null; // null: a loose note, which can be sent to a project from here
  path: string | null;
  looseId?: string | null;
  projects?: { id: string; name: string }[];
  floating?: boolean; // its own window: the header drags the window, past the main app
  embedded?: boolean; // fills the main area of the app window (no backdrop, nothing to drag)
  inline?: boolean; // an interactive note embedded between PDF pages
  inlineActions?: ReactNode; // controls belonging to the surrounding PDF card
  closeLabel?: string;
  onClose: () => void;
  onSaved?: (saved: NoteRef) => void; // after each save: where the note is now (a project note, for a loose one sent there)
  active?: boolean; // in a notebook: only the shown tab takes the keys
  onMyAis?: () => void; // Settings › My AIs, to install an AI not found here (not in a note window)
}

const QUICK = ['terminal', 'editor'];
const IMAGE_MAX = 1200; // px, longest side, before the image goes into the note
const words = (text: string) => (text.replace(/!\[[^\]]*\]\(data:[^)]*\)/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length;
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const toolName = (tool: ToolInfo) => t(tool.label).replace(/ \(.*\)$/, '');
const IMAGE_ICON = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-9 8.5" /></svg>;

// Every file of the project tree, for @ mentions.
const flatten = (nodes: TreeNode[]): string[] => nodes.flatMap((n) => (n.type === 'dir' ? flatten(n.children ?? []) : [n.path]));

// Images go into the note itself (a data: URL, which the reading view shows), scaled down first.
function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, IMAGE_MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }
      URL.revokeObjectURL(url);
      // Photos become JPEG (small); screenshots and transparent images stay PNG unless very large.
      const png = file.type === 'image/jpeg' ? '' : canvas.toDataURL('image/png');
      resolve(png && png.length < 900_000 ? png : canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('This image could not be read.'))); };
    img.src = url;
  });
}

export function NoteDialog({ project, path, looseId = null, projects = [], floating = false, embedded = false, inline = false, inlineActions, closeLabel, onClose, onSaved, active = true, onMyAis }: Props) {
  const titleId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [displayTitle, setDisplayTitle] = useState(() => path ? noteTitle(path) : '');
  const lastDisplayTitle = useRef(path ? noteTitle(path) : '');
  const editingTitle = useRef(false);
  const [savedTitle, setSavedTitle] = useState('');
  const [destination, setDestination] = useState(''); // '' keeps the note loose
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [exportMenu, setExportMenu] = useState<{ left: number; top: number } | null>(null);
  const [exported, setExported] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const [inlineTools, setInlineTools] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // offset from the centered position
  const [loaded, setLoaded] = useState(!path && !looseId);
  // Where the note is saved: a new note gets its file (or loose id) on its first save.
  const [curPath, setCurPath] = useState(path);
  const [curLoose, setCurLoose] = useState(looseId);
  const looseSavedTitle = useRef('');
  const [files, setFiles] = useState<string[]>([]); // project files, for @
  const [mention, setMention] = useState<{ start: number; query: string; index: number } | null>(null);
  const [ai, setAi] = useState(false);
  const [activities, setActivities] = useState<ActivityInfo[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [activityId, setActivityId] = useState('');
  const [toolId, setToolId] = useState(''); // '' = the default AI (Settings › My AIs); another choice is for this note only
  const [catalog, setCatalog] = useState<'activity' | 'tool' | null>(null);
  const [launching, setLaunching] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [tagCatalog, setTagCatalog] = useState<Tag[]>([]);
  const [tags, setTags] = useState<string[]>([]); // a saved project note's tags (shared context)
  const editor = useRef<HTMLTextAreaElement>(null);
  const visual = useRef<TipTapHandle>(null);
  const picker = useRef<HTMLInputElement>(null);
  const loose = project == null;
  const target = project ?? (destination || null); // the project the note belongs to (or is going to)
  const dirty = loose ? text !== saved || title !== savedTitle : text !== saved;
  // The star: a saved note only (a new one has nothing to point to yet).
  const ref: NoteRef | null = project && curPath ? { project, path: curPath } : loose && curLoose ? { loose: curLoose } : null;
  const [favorite, setFav] = useState(() => (ref ? isFavorite(ref) : false));
  const toggleFavorite = () => {
    if (!ref) return;
    setFav(setFavorite(ref, !favorite));
    window.qa?.notesChanged();
  };

  useEffect(() => {
    if (!path || !project) return;
    touchNote(project, path, noteTitle(path));
    window.qa?.notesChanged();
    api.readFile(project, path)
      .then((c) => { const body = c.kind === 'markdown' || c.kind === 'text' ? c.text : ''; setText(body); setSaved(body); setLoaded(true); })
      .catch((e: Error) => setError(e.message));
  }, [project, path]);
  const reloadNote = () => {
    if (!project || !curPath) return;
    const name = curPath.split('/').pop() ?? curPath;
    if (text !== saved && !window.confirm(t('Reload {name}? Your unsaved edits in this file are dropped.', { name }))) return;
    api.readFile(project, curPath)
      .then((c) => { const body = c.kind === 'markdown' || c.kind === 'text' ? c.text : ''; setText(body); setSaved(body); })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    if (!project || !path) return;
    const refresh = () => { void api.noteTitles(project).then((titles) => {
      const value = titles.find((item) => item.path === path)?.title ?? noteTitle(path);
      lastDisplayTitle.current = value;
      if (!editingTitle.current) setDisplayTitle(value);
    }).catch((e: Error) => setError(e.message)); };
    refresh();
    const off = api.onNotesChanged(refresh);
    window.addEventListener('focus', refresh);
    return () => { off(); window.removeEventListener('focus', refresh); };
  }, [project, path]);

  const saveInlineTitle = () => {
    editingTitle.current = false;
    if (!project || !curPath) return;
    const value = displayTitle.trim() || noteTitle(curPath);
    setDisplayTitle(value);
    if (value === lastDisplayTitle.current) return;
    void api.setNoteTitle(project, curPath, value).then(() => {
      lastDisplayTitle.current = value;
      touchNote(project, curPath, value);
      window.qa?.notesChanged();
    }).catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    if (!loose || !looseId) return;
    const note = looseNotes().find((n) => n.id === looseId);
    if (!note) { setError(t('This note is no longer here.')); return; }
    looseSavedTitle.current = note.title;
    setTitle(note.title); setSavedTitle(note.title); setText(note.text); setSaved(note.text); setLoaded(true);
  }, [loose, looseId]);

  // ---------- saving: on its own, like Notepad ----------
  // Saves run one after another, from the latest values (refs), so a new note is created only once.
  const latest = useRef({ text, title, saved, savedTitle, dirty, loaded, curPath, curLoose });
  latest.current = { ...latest.current, text, title, saved, savedTitle, dirty, loaded };
  const queue = useRef<Promise<NoteRef | null>>(Promise.resolve(null));
  // A note without a title is named after its first line.
  const nameOf = (body: string, head: string) => head.trim()
    || body.split('\n').map((l) => l.replace(/^[#>*\-\d.\s[\]xX]+/, '').trim()).find(Boolean)?.slice(0, 40) || t('Untitled note');
  // The visual editor sends its text once typing pauses: this takes it now and keeps `latest` in step at once, since persist reads it before any render.
  const edit = (value: string) => {
    const now = latest.current;
    now.text = value;
    now.dirty = loose ? value !== now.saved || now.title !== now.savedTitle : value !== now.saved;
    setText(value);
  };
  const persist = (): Promise<NoteRef | null> => {
    flushEdits();
    const run = queue.current.catch(() => null).then(async (): Promise<NoteRef | null> => {
      const now = latest.current;
      if (!now.loaded || !now.dirty) return null;
      let done: NoteRef;
      if (project == null) {
        if (!now.text.trim() && !now.title.trim()) return null;
        const current = now.curLoose ? looseNotes().find((n) => n.id === now.curLoose) : null;
        if (now.curLoose && (!current || current.text !== now.saved || current.title !== looseSavedTitle.current)) throw new Error(t('This note changed elsewhere. Reopen it before saving to avoid losing changes.'));
        const note = saveLooseNote({ id: now.curLoose, title: nameOf(now.text, now.title), text: now.text });
        looseSavedTitle.current = note.title;
        latest.current.curLoose = note.id;
        setCurLoose(note.id);
        done = { loose: note.id };
      } else if (now.curPath) {
        if (!await api.writeNoteIfUnchanged(project, now.curPath, now.text, now.saved)) throw new Error(t('This note changed elsewhere. Reopen it before saving to avoid losing changes.'));
        done = { project, path: now.curPath };
      } else {
        if (!now.text.trim()) return null; // a new note is created once something is written in it
        const created = await api.createNote(project, nameOf(now.text, now.title), now.text);
        latest.current.curPath = created;
        setCurPath(created);
        touchNote(project, created, noteTitle(created));
        done = { project, path: created };
      }
      latest.current.dirty = false;
      latest.current.saved = now.text;
      latest.current.savedTitle = now.title;
      setSaved(now.text); setSavedTitle(now.title); setSavedAt(Date.now()); setError('');
      window.qa?.notesChanged();
      onSaved?.(done);
      return done;
    });
    queue.current = run;
    setSaving(true);
    run.catch((e: Error) => setError(e.message)).finally(() => { if (queue.current === run) setSaving(false); });
    return run;
  };
  useEffect(() => {
    if (!loaded || !dirty) return;
    const timer = setTimeout(() => { void persist(); }, 700);
    return () => clearTimeout(timer);
  }, [text, title, loaded, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the note (closing it, another note or tab) saves what is left.
  useEffect(() => () => { if (latest.current.dirty) void persist(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!curPath || !project) return;
    api.tags().then(setTagCatalog).catch(() => setTagCatalog([]));
    api.fileTags(project).then((all) => setTags(all[curPath] ?? [])).catch(() => setTags([]));
  }, [project, curPath]);
  const changeTags = (ids: string[]) => {
    if (!curPath || !project) return;
    api.setFileTags(project, curPath, ids).then(setTags).catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    if (!target) { setFiles([]); return; }
    api.tree(target).then((nodes) => setFiles(flatten(nodes))).catch(() => setFiles([]));
  }, [target]);

  useEffect(() => {
    if (!ai) return;
    api.activities().then((r) => setActivities(r.activities)).catch(() => setActivities([]));
    api.integrations().then(setTools).catch(() => setTools([]));
  }, [ai]);

  // Closing saves first; if saving fails, the note stays open with the error.
  const close = () => { persist().then(() => onClose()).catch(() => { /* the error is shown */ }); };

  // From inside the app to the notebook window, saved first. A note that was
  // never saved is created then, so the button is there from the start.
  const toNotebook = () => {
    const open = (at: NoteRef) => {
      void api.openNoteWindow('loose' in at ? { loose: at.loose } : at);
      onClose();
    };
    persist().then(async (done) => {
      if (done) { open(done); return; }
      const now = latest.current;
      if (now.curLoose) { open({ loose: now.curLoose }); return; }
      if (project && now.curPath) { open({ project, path: now.curPath }); return; }
      const head = now.title.trim() || t('Untitled note');
      if (project == null) {
        const note = saveLooseNote({ id: null, title: head, text: now.text });
        window.qa?.notesChanged();
        open({ loose: note.id });
        return;
      }
      const created = await api.createNote(project, head, now.text);
      touchNote(project, created, noteTitle(created));
      window.qa?.notesChanged();
      open({ project, path: created });
    }).catch((e: Error) => setError(e.message));
  };

  // A project note saved as PDF, Markdown or text where the user chooses (native dialog); saved first.
  const exportAs = (format: 'pdf' | 'md' | 'txt') => {
    setExportMenu(null); setError(''); setExported('');
    persist().then(() => (project && curPath ? api.exportNote(project, curPath, format) : null))
      .then((dest) => { if (dest) setExported(dest); })
      .catch((e: Error) => setError(e.message));
  };

  // A loose note sent to a project: it becomes a note of that project and leaves the loose notes.
  const send = () => {
    if (!destination) return;
    flushEdits();
    const body = latest.current.text;
    setSending(true); setError('');
    api.createNote(destination, nameOf(body, title), body)
      .then((savedPath) => {
        if (favorite) setFavorite({ project: destination, path: savedPath }, true); // the star goes with the note
        if (latest.current.curLoose) removeLooseNote(latest.current.curLoose);
        latest.current.dirty = false; // nothing left to save as a loose note
        touchNote(destination, savedPath, title);
        window.qa?.notesChanged();
        onSaved?.({ project: destination, path: savedPath }); // a notebook moves it to that project's notebook
        if (!floating) onClose();
      })
      .catch((e: Error) => { setError(e.message); setSending(false); });
  };

  // ---------- editing: formatting, / commands and lists (useMarkdownEditing), plus an image and an @ mention ----------
  const md = useMarkdownEditing(editor, ({ insert: put }) => [
    { id: 'image', label: t('Image'), glyph: IMAGE_ICON, words: 'picture foto imagem', run: () => picker.current?.click() },
    { id: 'mention', label: t('Mention a project file'), glyph: '@', words: 'file arquivo mencionar', run: () => put('@') },
  ], inline);
  const { replace, insert, wrap, heading, bullets, numbers, checks, quote, code, link, table, divider, lineStart } = md;
  const { setSlash, findSlash, openSlash } = md;

  // ---------- images ----------
  const addImages = async (list: File[]) => {
    const images = list.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return false;
    if (mode === 'preview') { visual.current?.addImages(images); return true; }
    setError('');
    try {
      for (const file of images) {
        const url = await imageToDataUrl(file);
        const name = (file.name || t('image')).replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
        insert(`${lineStart() ? '' : '\n'}![${name}](${url})\n`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    return true;
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const list = Array.from(e.clipboardData.files);
    if (list.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); void addImages(list); }
  };
  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const list = Array.from(e.dataTransfer.files);
    if (list.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); e.stopPropagation(); void addImages(list); }
  };

  // ---------- @ mentions ----------
  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(q)).slice(0, 8);
  }, [mention, files]);
  const findMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = before.match(/(^|[\s(])@([^\s@()[\]]*)$/);
    setMention(m ? { start: caret - m[2].length - 1, query: m[2], index: 0 } : null);
  };
  const pickMention = (file: string) => {
    const el = editor.current;
    if (!el || !mention) return;
    const name = file.split('/').pop() ?? file;
    const value = `[@${name}](${file})`;
    replace(mention.start, el.selectionStart, value, mention.start + value.length, mention.start + value.length);
    setMention(null);
  };

  // Enter continues a list; Enter on an empty item ends it. Arrows / Enter / Tab drive the @ and / lists.
  const onEditorKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (md.slashKey(e)) return;
    if (mention && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMention({ ...mention, index: (mention.index + 1) % matches.length }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMention({ ...mention, index: (mention.index - 1 + matches.length) % matches.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(matches[mention.index]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMention(null); return; }
    }
    md.listKey(e);
  };

  // ---------- use the note with the AI ----------
  const choices = activities.filter((a) => a.id !== 'resume' && a.available && a.target.kind !== 'operation'); // a note goes to a request, not to an operation
  const activity = choices.find((a) => a.id === activityId);
  const quick = tools.filter((x) => x.available && QUICK.includes(x.kind));
  const tool = quick.find((x) => x.id === toolId) ?? preferredTool(quick);
  const startAi = async () => {
    if (!target || !activity || !tool) return;
    setLaunching(true); setAiMsg(''); setError('');
    flushEdits();
    try {
      // A saved project note goes as its path (any length); otherwise its text, on one line.
      let note: string;
      const base = `workspace/projects/${target}/`;
      const done = project ? await persist() : null;
      const file = done && 'path' in done ? done.path : curPath;
      if (project && file) {
        note = t('Use my note {file} as input (read it first; the paths in it are relative to {base}).', { file: `${base}${file}`, base });
      } else {
        const body = latest.current.text.replace(/!\[[^\]]*\]\(data:[^)]*\)/g, '[image]').replace(/\s+/g, ' ').trim();
        note = `${t('My note:')} ${title.trim() ? `${title.trim()} — ` : ''}${body}`.slice(0, 1990);
        if (body.length > 1900) setAiMsg(t('Only the start of the note was sent. Save it in the project to send all of it.'));
      }
      const r = await api.launch({ project: target, activity: activity.id, tool: tool.id, files: [], note, language: conversationLanguage() });
      if (r.terminal) {
        if (floating && window.qa?.showTerminal) { window.qa.showTerminal(target, r.terminal); setAiMsg(t('Opened in {tool}, in the Moki window.', { tool: toolName(tool) })); }
        else setAiMsg(t('Opened in {tool}.', { tool: toolName(tool) }));
      } else if (!r.opened) setError(r.message || t('Could not open the tool.'));
      else setAiMsg(r.copied ? t('Request copied. Paste it in the AI chat of {tool}.', { tool: toolName(tool) }) : (r.message || ''));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLaunching(false); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active || (inline && !container.current?.contains(document.activeElement))) return; // a hidden tab or an unfocused inline note
      if (e.key === 'Escape') { if (catalog || inline) return; close(); return; }
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); void persist().catch(() => { /* the error is shown */ }); }
      if (k === 'e') { e.preventDefault(); setMode((m) => (m === 'edit' ? 'preview' : 'edit')); }
      if (mode === 'edit' && k === 'b') { e.preventDefault(); wrap('**'); }
      if (mode === 'edit' && k === 'i') { e.preventDefault(); wrap('*'); }
      if (mode === 'edit' && k === 'k') { e.preventDefault(); link(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Inside the main window the dialog slides. As its own window, the header drags that window.
  const startDrag = (e: ReactMouseEvent) => {
    if (floating || embedded) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const start = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const move = (m: MouseEvent) => setPos({
      x: Math.min(Math.max(m.clientX, 0), window.innerWidth) - start.x,
      y: Math.min(Math.max(m.clientY, 0), window.innerHeight) - start.y,
    });
    const stop = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  };

  const act = (cmd: TipTapCommand, source: () => void) => () => {
    if (mode === 'preview') visual.current?.command(cmd);
    else source();
  };
  const tool_ = (label: ReactNode, title: string, run: () => void, style?: object) => (
    <button type="button" className="icon-btn" title={title} aria-label={title} style={style} onMouseDown={(e) => e.preventDefault()} onClick={run}>{label}</button>
  );

  const dialog = (
      <div ref={container} className={`modal note-dialog${embedded ? ' note-embedded' : ''}${inline ? ` note-inline${inlineTools ? '' : ' note-inline-minimized'}` : ''}`} role={inline ? 'region' : 'dialog'} aria-modal={inline ? undefined : !embedded} aria-labelledby={inline ? undefined : titleId} aria-label={inline ? t('Note') : undefined}
        style={floating || embedded ? undefined : { transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <header className="modal-head" onMouseDown={startDrag} onDoubleClick={() => { if (floating) window.qa?.noteMax(); }} title={embedded ? undefined : t('Drag to move')}>
          {inline ? <div className="note-inline-title">
            <input id={titleId} aria-label={t('Note title')} maxLength={120} value={project ? displayTitle : title}
              onFocus={() => { editingTitle.current = true; }} onChange={(e) => { if (project) setDisplayTitle(e.target.value); else setTitle(e.target.value); }}
              onBlur={() => { if (project) saveInlineTitle(); else editingTitle.current = false; }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          </div> : <h2 id={titleId}>{curPath ? displayTitle : (title.trim() || t('New note'))}</h2>}
          <span className="statusbar-spacer" />
          {ref && !inline && <button type="button" className="icon-btn" draggable title={t('Drag this note into a PDF')} aria-label={t('Drag this note into a PDF')}
            onDragStart={(e) => { e.dataTransfer.setData('application/x-moki-note', JSON.stringify(ref)); e.dataTransfer.effectAllowed = 'copy'; }}><IconNotes size={17} /></button>}
          {!floating && (
            <button type="button" className="icon-btn" onClick={toNotebook} title={t('Open in the notebook')} aria-label={t('Open in the notebook')}>
              <IconExternal size={17} />
            </button>
          )}
          {project && curPath && (
            <button type="button" className="icon-btn" onClick={reloadNote} title={t('Reload this file')} aria-label={t('Reload this file')}><IconRefresh size={16} /></button>
          )}
          {project && curPath && (
            <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={Boolean(exportMenu)} title={t('Export the note')} aria-label={t('Export the note')}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setExportMenu({ left: Math.max(8, r.right - 200), top: r.bottom + 4 }); }}>
              <IconFile size={17} />
            </button>
          )}
          {ref && (
            <button type="button" className={`icon-btn star-btn${favorite ? ' on' : ''}`} onClick={toggleFavorite} aria-pressed={favorite}
              title={favorite ? t('Remove from favorites') : t('Add to favorites')} aria-label={favorite ? t('Remove from favorites') : t('Add to favorites')}>
              <IconStar size={18} />
            </button>
          )}
          {inline && inlineActions && <div className="note-inline-actions">{inlineActions}</div>}
          {inline && <button type="button" className={`icon-btn note-inline-toggle${inlineTools ? ' open' : ''}`} aria-expanded={inlineTools}
            title={inlineTools ? t('Hide note tools') : t('Show note tools')} aria-label={inlineTools ? t('Hide note tools') : t('Show note tools')}
            onClick={() => setInlineTools((v) => !v)}><IconChevron size={15} /></button>}
          <button type="button" className={`icon-btn${inline ? ' note-inline-remove' : ''}`} onClick={close} title={closeLabel ?? t('Close (Esc)')} aria-label={closeLabel ?? t('Close (Esc)')}><IconX size={18} /></button>
        </header>
        <div className="note-tools" role="toolbar" aria-label={t('Formatting')}>
          {tool_('/', t('Commands (type /)'), act('slash', openSlash), { fontWeight: 700 })}
          <span className="sep" />
          {tool_('B', t('Bold (Ctrl+B)'), act('bold', () => wrap('**')), { fontWeight: 700 })}
          {tool_('I', t('Italic (Ctrl+I)'), act('italic', () => wrap('*')), { fontStyle: 'italic' })}
          {tool_('S', t('Strikethrough'), act('strike', () => wrap('~~')), { textDecoration: 'line-through' })}
          <span className="sep" />
          {tool_('H1', t('Large title'), act('h1', () => heading(1)))}
          {tool_('H2', t('Medium title'), act('h2', () => heading(2)))}
          {tool_('H3', t('Small title'), act('h3', () => heading(3)))}
          <span className="sep" />
          {tool_('•', t('List'), act('list', bullets))}
          {tool_('1.', t('Numbered list'), act('numbered', numbers))}
          {tool_(<span className="note-check-glyph" aria-hidden="true">✓</span>, t('Checklist'), act('checklist', checks))}
          {tool_('❝', t('Quote'), act('quote', quote))}
          <span className="sep" />
          {tool_(<IconCode size={15} />, t('Code'), act('codeBlock', code))}
          {tool_(<IconLink size={15} />, t('Link (Ctrl+K)'), act('link', link))}
          {tool_(TABLE_ICON, t('Table'), act('table', table))}
          {tool_('—', t('Divider'), act('divider', divider))}
          {tool_(IMAGE_ICON, t('Image (paste or drop it too)'), () => picker.current?.click())}
          {tool_('@', t('Mention a project file'), act('mention', () => insert('@')))}
          <span className="statusbar-spacer" />
          <button type="button" className={`icon-btn note-ai-toggle${ai ? ' on' : ''}`} onClick={() => setAi((v) => !v)} aria-expanded={ai} title={t('Use this note with the AI')}>
            <IconPlay size={14} /> <span>{t('Use with the AI')}</span>
          </button>
          {mode === 'edit'
            ? <button type="button" className="icon-btn" onClick={() => setMode('preview')} title={t('Reading view (Ctrl+E)')}><IconEye size={17} /></button>
            : <button type="button" className="icon-btn" onClick={() => setMode('edit')} title={t('Markdown source')}><IconEdit size={17} /></button>}
          <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>

        {ai && (
          <div className="note-ai">
            {!target ? <p className="pp-hint">{t('Send the note to a project first (below), so the AI knows where to work.')}</p> : (
              <>
                <button type="button" className={`pp-pick${activity ? '' : ' empty'}`} onClick={() => setCatalog('activity')} aria-haspopup="dialog">
                  {activity && <CatIcon id={ACTIVITY_CAT[activity.id] ?? 'run'} size={24} />}
                  <span className="pp-pick-label">{activity ? t(activity.label) : t('Choose an activity')}</span>
                  <IconChevron size={14} />
                </button>
                <button type="button" className="pp-pick" onClick={() => setCatalog('tool')} disabled={!tool} aria-haspopup="dialog">
                  <span className="pp-pick-kind" aria-hidden="true">{tool?.kind === 'editor' ? <IconCode size={15} /> : <IconTerminal size={15} />}</span>
                  <span className="pp-pick-label">{tool ? toolName(tool) : t('No AI tool installed')}</span>
                  <IconChevron size={14} />
                </button>
                <button type="button" className="btn" disabled={launching || !activity || !tool} onClick={() => { void startAi(); }}>
                  <IconPlay size={14} /> {launching ? t('Starting…') : t('Start activity')}
                </button>
              </>
            )}
            {aiMsg && <p className="pp-msg note-ai-msg" role="status">{aiMsg}</p>}
          </div>
        )}

        <div className="modal-body">
          {error && <div className="result warn" role="status"><p className="result-title">{error}</p></div>}
          {(loose || !curPath) && (
            <div className="note-meta">
              {(loose || !curPath) && (
                <label className="field">
                  <span className="label">{t('Title')}</span>
                  <input value={title} maxLength={60} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. Test ideas')} />
                </label>
              )}
              {loose && projects.length > 0 && (
                <label className="field note-destination">
                  <span className="label">{t('Send to a project')}</span>
                  <span className="row-actions">
                    <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                      <option value="">{t('Keep as a loose note')}</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {destination && <button type="button" className="btn" onClick={send} disabled={sending}>{sending ? t('Sending…') : t('Send')}</button>}
                  </span>
                </label>
              )}
            </div>
          )}
          {project && curPath && (
            <div className="field inline">
              <span className="label">{t('Tags')}</span>
              <TagPicker catalog={tagCatalog} value={tags} onChange={changeTags} onCatalog={setTagCatalog} compact />
            </div>
          )}
          {mode === 'edit' ? (
            <div className="note-editor-wrap">
              <DiagramSourceEditor editorRef={editor} className="note-editor" value={text}
                autoFocus={!inline && Boolean(path) && !loose}
                onChange={setText}
                onEdit={(segment, caret) => { findMention(segment, caret); findSlash(segment, caret); }}
                onKeyDown={onEditorKey}
                onClick={(e) => { findMention(e.currentTarget.value, e.currentTarget.selectionStart); findSlash(e.currentTarget.value, e.currentTarget.selectionStart); }}
                onBlur={() => setTimeout(() => { setMention(null); setSlash(null); }, 150)}
                onPaste={onPaste} onDrop={onDrop}
                placeholder={t('Write your note (Markdown). Type / for commands and @ to mention a project file; paste or drop images.')} />
              {md.slashList}
              {mention && (
                <div className="note-mention" role="listbox" aria-label={t('Project files')}>
                  {!target ? <p className="muted small">{t('Send the note to a project to mention its files.')}</p>
                    : !matches.length ? <p className="muted small">{t('No file matches "{q}".', { q: mention.query })}</p>
                      : matches.map((f, i) => (
                        <button key={f} type="button" role="option" aria-selected={i === mention.index} className={i === mention.index ? 'on' : ''}
                          onMouseDown={(e) => { e.preventDefault(); pickMention(f); }}>
                          <FileIcon name={f} size={16} /><span className="note-mention-name">{f.split('/').pop()}</span><span className="note-mention-path">{f}</span>
                        </button>
                      ))}
                </div>
              )}
            </div>
          )
            : (
              <div className="note-visual">
                <LazyTipTap ref={visual} bar={false} text={text} path={path ?? curPath ?? 'notes/note.md'} onChange={edit} />
              </div>
            )}
        </div>
        <footer className="modal-foot">
          <span className="note-status">
            {t('{n} words', { n: words(text) })}
          </span>
          <span className="statusbar-spacer" />
          {exported && <span className="note-status" role="status">{t('Exported to {path}', { path: exported })}</span>}
          <span className="note-status" role="status">
            {saving || dirty ? t('Saving…') : savedAt ? t('Saved at {time}', { time: clock(savedAt) }) : ref ? t('Saved') : ''}
          </span>
        </footer>
        {exportMenu && (
          <div className="menu-backdrop" onMouseDown={() => setExportMenu(null)}>
            <ul className="term-menu item-menu" role="menu" style={exportMenu} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setExportMenu(null); } }}>
              <li><button type="button" role="menuitem" autoFocus onClick={() => exportAs('pdf')}>{t('PDF document')}</button></li>
              <li><button type="button" role="menuitem" onClick={() => exportAs('md')}>{t('Markdown file')}</button></li>
              <li><button type="button" role="menuitem" onClick={() => exportAs('txt')}>{t('Text file')}</button></li>
            </ul>
          </div>
        )}
        {catalog === 'activity' && (
          <ActivityCatalog activities={activities} selected={activity?.id ?? ''} onPick={setActivityId} onClose={() => setCatalog(null)}
            blocked={(a) => (a.needsFiles ? t('Uses inbox files: start it from the project panel') : null)} />
        )}
        {catalog === 'tool' && (
          <ToolCatalog tools={tools.filter((x) => QUICK.includes(x.kind))} selected={tool?.id ?? ''} onPick={setToolId} onClose={() => setCatalog(null)} onInstall={onMyAis} />
        )}
      </div>
  );
  if (floating || embedded) return dialog;
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>{dialog}</div>;
}
