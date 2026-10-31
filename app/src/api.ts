// Client for the desktop app's main process (see desktop/preload.ts and
// desktop/service.ts). Every call goes through one validated IPC channel.

import { lang, t } from './i18n';

export interface ProjectSummary {
  id: string; name: string; description: string; onboardingStatus: string; deliverableLanguage: string; runs: number; openRuns: number;
  repository: string; // folder linked to the project ('' when none)
  linkedSkills: string[]; // global skills this project uses, by name
  starter: Starter;
  tags: string[]; // tag ids
  plugins: string[]; // app plugins turned on for this project (caveman, superpowers)
}
// A tag shares context between projects: the context of the projects with it and the files marked with it.
export interface Tag { id: string; name: string; color: string; description: string }
export interface SharedSource { project: string; name: string; whole: boolean; paths: string[] }
export interface FileHit { project: string; projectName: string; path: string; snippet: string; line: number; tags: string[] }
export interface SearchResult { projects: ProjectSummary[]; files: FileHit[]; truncated: boolean }
export interface ContextChoice { own: string[]; shared: { tag: Tag; sources: SharedSource[] }[] }
// A workspace, like an Obsidian vault: a folder with its own projects, tags and settings.
export interface WorkspaceInfo { id: string; name: string; path: string; isDefault: boolean; missing: boolean; projects: number }
// How a new project starts: with the QA context files, or blank (the AI interviews and proposes a plan).
export type Starter = 'qa' | 'blank';
// The AI's recommendation for a blank project (plan.json), reviewed in "Set up project".
export interface Plan {
  approved: boolean; skills: string[]; agents: string[]; searchSkills: string[];
  contextFiles: { path: string; contains: string }[];
}
export interface SkillInfo { name: string; status: string; description: string }
export type ToolKind = 'terminal' | 'editor' | 'chat' | 'print';
export interface ToolInfo { id: string; label: string; hint: string; command: string; kind: ToolKind; available: boolean }
export interface ActivityInfo { id: string; label: string; hint: string; skill: string; needsFiles: boolean; available: boolean; status: string }
// "Open with" (Excel, Word and PDF files): the programs the system offers; dialog = the system shows its own list instead (Windows).
export interface OpenWithApps { dialog: boolean; apps: { id: string; name: string; isDefault: boolean }[] }
// PDF comments and page edits, written by PdfCraft (desktop/pdfcraft.ts). Quads: 8 numbers, points from the page's top-left.
export interface PdfComment { id: string; page: number; type: string; author: string | null; contents: string | null; color: string | null; replies: PdfComment[] }
export interface PdfMark { page: number; quads: number[][] }
export type PdfChange =
  | { op: 'highlight'; page: number; find: string; all: boolean; contents?: string; color: string }
  | { op: 'highlight'; marks: PdfMark[]; contents?: string; color: string }
  | { op: 'reply'; id: string; text: string }
  | { op: 'edit'; id: string; contents: string }
  | { op: 'delete'; id: string }
  | { op: 'rotate-pages'; pages: number[]; degrees: 90 | 180 | 270 }
  | { op: 'delete-pages'; pages: number[] }
  | { op: 'move-page'; page: number; to: number }
  | { op: 'insert-blank'; at: number }
  | { op: 'set-info'; title: string; author: string };
export interface InboxFile { name: string; size: number; modified: string }
export interface OpenRun { id: string; status: string; currentStep: string }

export interface TreeNode {
  name: string; path: string; type: 'dir' | 'file'; size?: number; children?: TreeNode[];
  run?: { status: string; skill: string; currentStep: string };
  mcp?: string; // MCP server row: where it is configured
}

export type FileContent =
  | { kind: 'markdown'; path: string; text: string; html: string; editable: boolean }
  | { kind: 'text'; path: string; text: string; editable: boolean }
  | { kind: 'json'; path: string; text: string }
  | { kind: 'html'; path: string; text: string } // shown rendered, read-only
  | { kind: 'docx'; path: string; html: string }
  | { kind: 'xlsx'; path: string; sheets: {
    name: string; hidden: boolean; drawing: boolean; rows: (string | { n: string })[][]; truncated: boolean;
    merges: number[][]; widths: number[]; hiddenRows: number[]; hiddenCols: number[]; align: Record<string, { h?: string; v?: string; wrap?: boolean }>;
  }[] }
  | { kind: 'image'; path: string; dataUrl: string }
  | { kind: 'pdf'; path: string; data: string } // base64
  | { kind: 'binary'; path: string; size: number; openable: boolean; reason?: string };

export interface RunState {
  id: string; status: string; currentStep?: string; skill?: string; workflow?: string; createdAt?: string; updatedAt?: string;
  completedSteps?: string[];
  pending?: { id: string; description: string; owner?: string }[];
  approvals?: { step: string; decision: string; by?: string; at: string; notes?: string }[];
  inputs?: { path: string; description?: string }[];
  artifacts?: string[];
}

// What an agent needs and delivers, the MCP servers it uses and its default AI tool (multi-agent operations chain agents through it).
export interface AgentMcp { name: string; mode: 'read' | 'execute' | string }
export interface AgentContract { inputs: string[]; outputs: string[]; outcomes?: string[]; mcps: AgentMcp[]; ai: string }
export const emptyContract = (): AgentContract => ({ inputs: [], outputs: [], outcomes: [], mcps: [], ai: '' });

// Multi-agent operations (scripts/lib/operations.ts): agents in one line, linked by arrows.
export type Gate = 'auto' | 'approval';
export interface OperationStep { id: string; agent: string; x: number; y: number }
// when: the result of the step before that leads here ('' = always, or otherwise when other arrows hold results).
export interface OperationLink { from: string; to: string; gate: Gate | string; map: Record<string, string>; when?: string }
export interface CheckMessage { text: string; params: Record<string, string> } // English with {placeholders}, translated with t()
export interface OperationCheck {
  errors: CheckMessage[]; warnings: CheckMessage[]; start: string; order: string[];
  initialInputs: { step: string; agent: string; input: string }[]; approvals: string[];
}
export interface OperationLane { id: string; name: string; color: string; width: number } // a coloured band of the board (visual only)
export interface OperationDraft { id?: string; name: string; description: string; start?: string; maxRounds?: number; lanes: OperationLane[]; steps: OperationStep[]; links: OperationLink[] }
export interface Operation extends OperationDraft { id: string; check: OperationCheck }
export interface OperationAgent extends AgentContract { key: string; name: string; source: 'library' | 'global'; description: string; access: string }

// An operation in a project: started from its plan, then run step by step (scripts/lib/operation-runs.ts).
export interface OperationPlanStep { id: string; agent: string; description: string; ai: string; mcps: AgentMcp[]; gate: string; outputs: string[] }
export interface OperationPlan { operation: Operation; steps: OperationPlanStep[]; mcpsByTool: Record<string, string[] | null>; inbox: string[] }
export interface OperationAnswer { step: string; input: string; text: string; files: string[] }
// A run: its steps (agents), and each time one ran (a visit: "s2", then "s2-2" when a loop brought it back).
export interface OperationRunStep { id: string; agent: string; name: string; inputs: string[]; outputs: string[]; outcomes: string[]; executes: string[]; lane: string; ai: string }
export type VisitStatus = 'awaiting-approval' | 'ready' | 'running' | 'done';
export interface OperationVisit {
  slot: string; step: string; round: number; from: string; gate: string; status: VisitStatus;
  outcome?: string; question?: string; terminal?: string; startedAt?: string; finishedAt?: string; handoff?: boolean; missing?: string[];
}
export interface OperationDecision { kind: 'path' | 'limit'; from: string; outcome?: string; options: { to: string; when: string }[] }
export interface OperationRun {
  id: string; project: string; operation: { id: string; name: string }; status: string; currentStep: string;
  createdAt: string; updatedAt: string; paused: boolean; ended: boolean; maxRounds: number;
  steps: OperationRunStep[]; visits: OperationVisit[]; decision: OperationDecision | null; artifacts: string[];
}

export interface AgentInfo extends AgentContract {
  name: string; description: string; category: string; skills: string[]; access: string; version: string; status: string;
  basedOn: string; source: 'builtin' | 'custom'; path: string; usable: boolean;
}
export interface AgentDetail extends AgentInfo { text: string; html: string }
export interface Category { id: string; label: string; description: string; source: 'builtin' | 'custom' }

// How generated PDF, Word and Excel files look (scripts/lib/doc-style.mjs). Texts may use
// {project}, {title}, {date}, {page}, {pages}.
export interface DocumentStyle {
  font: { family: string; size: number; color: string };
  accent: string;
  table: { header: string; headerText: string; border: string };
  background: string;
  header: { left: string; center: string; right: string; logo: string; logoSide: 'left' | 'right' };
  footer: { left: string; center: string; right: string };
  watermark: { text: string; color: string; opacity: number };
}
export const DOCUMENT_FONTS = ['Calibri', 'Arial', 'Segoe UI', 'Helvetica', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Cambria', 'Garamond', 'Consolas'];

export interface LaunchRequest { project: string; activity: string; tool: string; files: string[]; note: string; language: string; run?: string; agent?: string; exclude?: string[] }
export interface LaunchResult { opened: boolean; message?: string; copied?: boolean; prompt: string; upload?: string[]; bundleReady?: boolean; terminal?: TerminalRef }
export interface TerminalRef { id: string; title: string }

// Skills & agents dialog: skills installed from the SkillMD registry and Claude Code agents, per project or for all projects.
export interface RegistrySkill {
  slug: string; title: string; description: string; category: string; verified: boolean; verdict: string | null; rating: number; installs: number;
}
export interface SkillSearchPage { items: RegistrySkill[]; page: number; pages: number; total: number; capped: boolean }
export interface InstallResult { name: string; files: number; folders: string[]; unverified: string[]; backup?: string }
export type SkillScope = 'project' | 'global';
export interface ScopeAgents { skills: string[]; builtin: { name: string; description: string }[]; agents: string[]; folder: string; agentsFolder: string }
export interface ScopeAgentRequest { name: string; description: string; skills: string[]; scope: SkillScope; contract?: AgentContract }
export interface ProjectItems {
  skillsFolder: string; agentsFolder: string;
  skills: { name: string; description: string }[];
  agents: { name: string; description: string; contract?: AgentContract }[];
}
export interface GlobalItems {
  skills: { name: string; description: string; folders: string[]; linkedBy: string[] }[];
  agents: { name: string; description: string; file: string; contract?: AgentContract }[];
}
export interface GlobalAgentDetail { name: string; description: string; file: string; text: string; html: string; contract?: AgentContract }
// Status bar (desktop/usage.ts): plan usage of the AI tools and memory of the computer, of Moki and of each project's terminals.
export interface PlanUsage { tool: 'claude' | 'codex'; label: string; windows: { label: string; percent: number; resetsAt: number | null }[]; error?: string }
export interface Usage {
  plans: PlanUsage[];
  memory: { total: number; used: number; app: number; projects: { project: string; bytes: number; sessions: { id: string; bytes: number }[] }[] }; // a session is one terminal tab
}

// window.qa: desktop/preload.ts in the desktop app, ide/vscode/webview-bridge.ts in VS Code.
export interface Bridge {
  query?: string; // the page parameters, when the host cannot put them in the URL (VS Code webview)
  call(method: string, ...args: unknown[]): Promise<{ ok: true; value: unknown } | { ok: false; error: string }>;
  filePath(file: File): string;
  watch(project: string | null): Promise<boolean>;
  onChanged(callback: (project: string) => void): () => void;
  openLink(url: string): Promise<void>;
  usage?(refresh: boolean): Promise<Usage | null>;
  openNoteWindow(target: { project?: string | null; path?: string | null; loose?: string | null; theme?: string }): Promise<boolean>;
  notesChanged(): void;
  onNotesChanged(callback: () => void): () => void;
  noteMax(): void;
  onNotebookOpen?(callback: (target: { project: string | null; path: string | null; loose: string | null }) => void): () => void;
  showTerminal?(project: string, terminal: TerminalRef): void;
  openInMain?(project: string, path: string): void;
  onShowTerminal?(callback: (project: string, terminal: TerminalRef) => void): () => void;
  onOpenInMain?(callback: (project: string, path: string) => void): () => void;
  term?: { // absent in VS Code, where the AI tools open in VS Code's own terminals
    create(tool: string): Promise<{ terminal?: TerminalRef; error?: string }>; // tool '' = the user's shell
    start(id: string, cols: number, rows: number, project: string): Promise<string>;
    input(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): void;
    on(event: 'data' | 'exit', callback: (id: string, payload: string | number) => void): () => void;
  };
}

declare global { interface Window { qa?: Bridge } }

export const hasBridge = (): boolean => Boolean(window.qa);
export const pageParams = (): URLSearchParams => new URLSearchParams(window.qa?.query ?? window.location.search);

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!window.qa) throw new Error(t('Moki must be opened with the qa command.'));
  const res = await window.qa.call(method, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value as T;
}

export const api = {
  session: () => call<{ version: string; platform: string }>('session'),
  projects: () => call<ProjectSummary[]>('projects'),
  workspaces: () => call<{ list: WorkspaceInfo[]; active: string }>('workspaces'),
  selectWorkspace: (id: string) => call<WorkspaceInfo>('selectWorkspace', id),
  chooseWorkspaceLocation: () => call<string | null>('chooseWorkspaceLocation'),
  createWorkspace: (name: string, location?: string | null) => call<WorkspaceInfo>('createWorkspace', name, location ?? null),
  openWorkspaceFolder: () => call<WorkspaceInfo | null>('openWorkspaceFolder'),
  renameWorkspace: (id: string, name: string) => call<WorkspaceInfo>('renameWorkspace', id, name),
  forgetWorkspace: (id: string) => call<boolean>('forgetWorkspace', id),
  createProject: (name: string, starter: Starter, folder?: string, tags: string[] = []) => call<ProjectSummary & { backup?: string }>('createProject', name, starter, folder ?? null, tags),
  deleteProject: (project: string, confirm: string) => call<boolean>('deleteProject', project, confirm),
  tags: () => call<Tag[]>('tags'),
  saveTag: (tag: { id?: string; name: string; color?: string; description?: string }) => call<Tag>('saveTag', tag),
  removeTag: (id: string) => call<boolean>('removeTag', id),
  setProjectTags: (project: string, ids: string[]) => call<ProjectSummary>('setProjectTags', project, ids),
  setProjectPlugins: (project: string, names: string[]) => call<ProjectSummary>('setProjectPlugins', project, names),
  fileTags: (project: string) => call<Record<string, string[]>>('fileTags', project),
  setFileTags: (project: string, path: string, ids: string[]) => call<string[]>('setFileTags', project, path, ids),
  search: (query: string, tags: string[]) => call<SearchResult>('search', query, tags),
  contextChoice: (project: string) => call<ContextChoice>('contextChoice', project),
  pickFolder: () => call<{ folder: string; name: string } | null>('pickFolder'),
  skills: () => call<SkillInfo[]>('skills'),
  activities: () => call<{ activities: ActivityInfo[]; languages: string[] }>('activities'),
  integrations: () => call<ToolInfo[]>('integrations'),
  tree: (project: string) => call<TreeNode[]>('tree', project),
  readFile: (project: string, path: string) => call<FileContent>('readFile', project, path),
  writeFile: (project: string, path: string, text: string) => call<FileContent>('writeFile', project, path, text),
  renderMarkdown: (text: string, project?: string, path?: string) => call<string>('renderMarkdown', text, project, path),
  documentStyle: (project?: string | null) => call<{ global: DocumentStyle; project: DocumentStyle | null }>('documentStyle', project ?? null),
  saveDocumentStyle: (project: string | null, style: DocumentStyle | null) => call<boolean>('saveDocumentStyle', project, style),
  createNote: (project: string, title: string, text: string) => call<string>('createNote', project, title, text),
  run: (project: string, runId: string) => call<RunState>('run', project, runId),
  inbox: (project: string) => call<InboxFile[]>('inbox', project),
  importFiles: (project: string, paths: string[]) => call<{ saved: string[]; skipped: string[] }>('importFiles', project, paths),
  openRuns: (project: string) => call<OpenRun[]>('openRuns', project),
  openFolder: (project: string, path = '') => call<boolean>('openFolder', project, path),
  openExternal: (project: string, path: string) => call<boolean>('openExternal', project, path),
  createEntry: (project: string, parent: string, name: string, kind: 'file' | 'folder') => call<string>('createEntry', project, parent, name, kind),
  revealPath: (project: string, path: string) => call<boolean>('revealPath', project, path),
  copyPath: (project: string, path: string) => call<string>('copyPath', project, path),
  openWithApps: (project: string, path: string) => call<OpenWithApps>('openWithApps', project, path),
  openWith: (project: string, path: string, app: string) => call<boolean>('openWith', project, path, app),
  pdfcraftStatus: () => call<{ available: boolean; platform: string }>('pdfcraftStatus'),
  pdfComments: (project: string, path: string) => call<PdfComment[]>('pdfComments', project, path),
  // path: where the change was saved (a "-edited" copy for files in inbox/ and for page edits).
  pdfChange: (project: string, path: string, change: PdfChange) => call<{ path: string; comments: PdfComment[] }>('pdfChange', project, path, change),
  linkRepository: (project: string) => call<(ProjectSummary & { backup?: string }) | null>('linkRepository', project),
  openLinkedFolder: (project: string) => call<boolean>('openLinkedFolder', project),
  launch: (req: LaunchRequest) => call<LaunchResult>('launch', req),
  categories: () => call<Category[]>('categories'),
  agents: () => call<AgentInfo[]>('agents'),
  agent: (name: string) => call<AgentDetail>('agent', name),
  duplicateAgent: (name: string) => call<AgentInfo>('duplicateAgent', name),
  saveAgent: (name: string, text: string) => call<boolean>('saveAgent', name, text),
  deleteAgent: (name: string) => call<boolean>('deleteAgent', name),
  saveAgentContract: (name: string, contract: AgentContract) => call<boolean>('saveAgentContract', name, contract),
  knownMcps: (project?: string | null) => call<string[]>('knownMcps', project ?? null),
  operationAgents: () => call<OperationAgent[]>('operationAgents'),
  operations: () => call<Operation[]>('operations', lang), // the first time, an example in the app's language
  checkOperation: (op: OperationDraft) => call<OperationCheck>('checkOperation', op),
  suggestLink: (from: string, to: string) => call<Record<string, string>>('suggestLink', from, to),
  saveOperation: (op: OperationDraft) => call<Operation>('saveOperation', op),
  deleteOperation: (id: string) => call<boolean>('deleteOperation', id),
  projectOperations: (project: string) => call<Operation[]>('projectOperations', project),
  setProjectOperations: (project: string, ids: string[]) => call<string[]>('setProjectOperations', project, ids),
  operationPlan: (project: string, id: string) => call<OperationPlan>('operationPlan', project, id),
  startOperation: (project: string, id: string, req: { tools: Record<string, string>; answers: OperationAnswer[]; context: string }) => call<OperationRun>('startOperation', project, id, req),
  operationRuns: (project: string) => call<OperationRun[]>('operationRuns', project),
  operationRun: (project: string, run: string) => call<OperationRun>('operationRun', project, run),
  advanceOperations: (project: string) => call<{ run: string; step: string }[]>('advanceOperations', project),
  startOperationStep: (project: string, run: string, step: string, language: string) => call<LaunchResult>('startOperationStep', project, run, step, language),
  approveOperationStep: (project: string, run: string) => call<string>('approveOperationStep', project, run),
  chooseOperationPath: (project: string, run: string, to: string) => call<OperationRun>('chooseOperationPath', project, run, to),
  pauseOperation: (project: string, run: string, paused: boolean) => call<OperationRun>('pauseOperation', project, run, paused),
  cancelOperation: (project: string, run: string) => call<OperationRun>('cancelOperation', project, run),
  projectAgents: (project: string) => call<string[]>('projectAgents', project),
  setProjectAgents: (project: string, names: string[]) => call<string[]>('setProjectAgents', project, names),
  searchSkills: (query: string, category = '', page = 1) => call<SkillSearchPage>('searchSkills', query, category, page),
  installedSkills: (project: string) => call<{ project: string[]; global: string[]; artcraft: string[] }>('installedSkills', project),
  installSkill: (project: string, slug: string, scope: SkillScope, allowClaudeWrite = false) => call<InstallResult>('installSkill', project, slug, scope, allowClaudeWrite),
  proposeSkill: (project: string, req: { name: string; prompt: string; tool: string; language: string }) => call<LaunchResult>('proposeSkill', project, req),
  skillProposals: (project: string) => call<{ name: string; description: string }[]>('skillProposals', project),
  installProposal: (project: string, name: string, scope: SkillScope, allowClaudeWrite = false) => call<{ name: string; folders: string[]; backup?: string }>('installProposal', project, name, scope, allowClaudeWrite),
  scopeAgents: (project: string, scope: SkillScope) => call<ScopeAgents>('scopeAgents', project, scope),
  createScopeAgent: (project: string, req: ScopeAgentRequest, allowClaudeWrite = false) => call<{ name: string; file: string; backup?: string }>('createScopeAgent', project, req, allowClaudeWrite),
  projectItems: (project: string) => call<ProjectItems>('projectItems', project),
  removeProjectItem: (project: string, kind: 'skill' | 'agent', name: string, allowClaudeWrite = false) => call<{ backup?: string }>('removeProjectItem', project, kind, name, allowClaudeWrite),
  globalItems: () => call<GlobalItems>('globalItems'),
  setupProject: (project: string, req: { description: string; linkedSkills: string[]; agents?: string[]; contextFiles?: string[] }) => call<ProjectSummary>('setupProject', project, req),
  readPlan: (project: string) => call<Plan | null>('readPlan', project),
  globalAgent: (name: string) => call<GlobalAgentDetail>('globalAgent', name),
  saveGlobalAgent: (name: string, text: string) => call<boolean>('saveGlobalAgent', name, text),
  editGlobalAgent: (name: string, req: { prompt: string; tool: string; language: string }) => call<LaunchResult>('editGlobalAgent', name, req),
  openGlobal: (kind: 'skill' | 'agent', name: string) => call<boolean>('openGlobal', kind, name),
  removeGlobal: (kind: 'skill' | 'agent', name: string) => call<boolean>('removeGlobal', kind, name),
  watch: (project: string | null) => window.qa?.watch(project ?? '') ?? Promise.resolve(false),
  onChanged: (cb: (project: string) => void) => window.qa?.onChanged(cb) ?? (() => {}),
  openLink: (url: string) => window.qa?.openLink(url),
  usage: (refresh = false) => window.qa?.usage?.(refresh) ?? Promise.resolve(null),
  openNoteWindow: (target: { project?: string | null; path?: string | null; loose?: string | null }) => window.qa?.openNoteWindow({ ...target, theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark' }) ?? Promise.resolve(false),
  onNotesChanged: (cb: () => void) => window.qa?.onNotesChanged(cb) ?? (() => {}),
  // Embedded terminals (desktop/terminals.ts); only available inside the app.
  term: () => window.qa?.term ?? null,
};

// Run folders are named YYYYMMDD-HHMM-<skill or workflow>-<slug>.
export function describeRun(id: string): { date: string; title: string } {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})-(.+)$/);
  if (!m) return { date: '', title: id };
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return { date: date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), title: m[6] };
}

export const statusLabel = (status: string): string => ({
  'in-progress': t('In progress'), 'awaiting-approval': t('Waiting for your approval'), 'awaiting-input': t('Waiting for input'),
  blocked: t('Blocked'), paused: t('Paused'), completed: t('Completed'), cancelled: t('Cancelled'),
} as Record<string, string>)[status] ?? status;
