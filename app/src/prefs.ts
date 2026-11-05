// Small per-user UI preferences (last tool, language, skill scope). Storage may be unavailable.
import { isHomeSectionId, type HomeSectionLayout } from './home-sections';

export const remember = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* optional */ } };
export const recall = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };

const WORKSPACE_USAGE = 'qa-workspace-usage';
export const workspaceUsage = (): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(recall(WORKSPACE_USAGE) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) as Record<string, number>;
  } catch { return {}; }
};
export const recordWorkspaceUse = (id: string) => {
  const usage = workspaceUsage();
  usage[id] = (usage[id] ?? 0) + 1;
  remember(WORKSPACE_USAGE, JSON.stringify(usage));
};

const WORKSPACE_FAVORITES = 'qa-workspace-favorites';
export const workspaceFavorites = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(recall(WORKSPACE_FAVORITES) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
};
export const setWorkspaceFavorite = (id: string, favorite: boolean): string[] => {
  const ids = workspaceFavorites().filter((item) => item !== id);
  if (favorite) ids.push(id);
  remember(WORKSPACE_FAVORITES, JSON.stringify(ids));
  return ids;
};
export function featuredWorkspaces<T extends { id: string }>(list: T[]): T[] {
  const usage = workspaceUsage();
  const favorites = new Set(workspaceFavorites());
  const ranked = [...list].sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0));
  const top = new Set(ranked.slice(0, 2).map((item) => item.id));
  return ranked.filter((item) => favorites.has(item.id) || top.has(item.id));
}

// The default AI (Settings › My AIs). Same key the panels used for the last tool, so it carries over.
// Choosing another AI for one activity does not change it.
const DEFAULT_TOOL = 'qa-tool';
export const defaultTool = () => recall(DEFAULT_TOOL) ?? '';
export const setDefaultTool = (id: string) => remember(DEFAULT_TOOL, id);

const HOME_SECTIONS = 'qa-home-sections';
export function homeSectionLayout(): HomeSectionLayout {
  try {
    const parsed: unknown = JSON.parse(recall(HOME_SECTIONS) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { collapsed: [], weights: {} };
    const record = parsed as { collapsed?: unknown; weights?: unknown };
    const collapsed = Array.isArray(record.collapsed) ? record.collapsed.filter(isHomeSectionId) : [];
    const weights: HomeSectionLayout['weights'] = {};
    if (record.weights && typeof record.weights === 'object' && !Array.isArray(record.weights)) {
      for (const [id, value] of Object.entries(record.weights)) {
        if (isHomeSectionId(id) && typeof value === 'number' && Number.isFinite(value) && value > 0) weights[id] = value;
      }
    }
    return { collapsed, weights };
  } catch {
    return { collapsed: [], weights: {} };
  }
}
export function saveHomeSectionLayout(layout: HomeSectionLayout): void {
  remember(HOME_SECTIONS, JSON.stringify(layout));
}

// The AI an activity starts in: the default when it is usable here, otherwise the first usable one.
// ponytail: the activity's own AI comes first once activities can name one.
export function preferredTool<T extends { id: string }>(usable: T[]): T | undefined {
  return usable.find((x) => x.id === defaultTool()) ?? usable[0];
}
