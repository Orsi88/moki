// How the start screen's sections share the sidebar: which are collapsed, and how
// the open ones split the height. The remembered choice lives in prefs.ts.

export const HOME_SECTION_IDS = ['pinned', 'projects', 'favorites', 'notes'] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];
export const SECTION_MIN = 100;

export interface HomeSectionLayout {
  collapsed: HomeSectionId[];
  weights: Partial<Record<HomeSectionId, number>>;
}

export const isHomeSectionId = (value: unknown): value is HomeSectionId =>
  typeof value === 'string' && (HOME_SECTION_IDS as readonly string[]).includes(value);

// Dragging the line between two open sections. Heights become the flex weights,
// so the other open sections keep the share they already had.
export function resizedWeights(base: Record<string, number>, above: string, below: string, aboveH: number, belowH: number, delta: number): Record<string, number> {
  const sum = aboveH + belowH;
  if (!(sum > 0)) return base;
  const min = Math.min(SECTION_MIN, sum / 2);
  const nextAbove = Math.max(min, Math.min(sum - min, aboveH + delta));
  return { ...base, [above]: nextAbove, [below]: sum - nextAbove };
}
