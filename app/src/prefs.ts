// Small per-user UI preferences (last tool, language, skill scope). Storage may be unavailable.

export const remember = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* optional */ } };
export const recall = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };

// The default AI (Settings › My AIs). Same key the panels used for the last tool, so it carries over.
// Choosing another AI for one activity does not change it.
const DEFAULT_TOOL = 'qa-tool';
export const defaultTool = () => recall(DEFAULT_TOOL) ?? '';
export const setDefaultTool = (id: string) => remember(DEFAULT_TOOL, id);

// The AI an activity starts in: the default when it is usable here, otherwise the first usable one.
// ponytail: the activity's own AI comes first once activities can name one.
export function preferredTool<T extends { id: string }>(usable: T[]): T | undefined {
  return usable.find((x) => x.id === defaultTool()) ?? usable[0];
}
