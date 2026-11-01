// The geometry of an operation's board, shared by the editor (Settings › Operations)
// and the run view: card sizes, the dots of a card (one per result of its agent,
// plus "otherwise"), and the arrows between cards.

export const CARD_W = 210;
export const CARD_H = 92;
export const BOARD_W = 1600;
export const BOARD_H = 720;
export const LANE_HEAD = 40; // the lane names, above the cards

// The dots of a card: one per result of its agent and "otherwise" (when ''), or a single one.
export const dotsFor = (outcomes: string[]): string[] => (outcomes.length ? [...outcomes, ''] : ['']);
export const cardHeight = (outcomes: string[]) => Math.max(CARD_H, 26 + dotsFor(outcomes).length * 24);
export const dotOffset = (outcomes: string[], when: string) => {
  const dots = dotsFor(outcomes);
  const i = Math.max(dots.findIndex((w) => w.toLowerCase() === when.toLowerCase()), 0);
  return Math.round(((i + 1) * cardHeight(outcomes)) / (dots.length + 1));
};

// An arrow from the dot of its result to the middle of the next card; one going back curves under the cards.
export interface Card { x: number; y: number; outcomes: string[] }
export function arrowPath(a: Card, when: string, b: Card): { d: string; mid: { x: number; y: number } } {
  const x1 = a.x + CARD_W; const y1 = a.y + dotOffset(a.outcomes, when); const x2 = b.x - 2; const y2 = b.y + cardHeight(b.outcomes) / 2;
  const back = x2 < x1 + 30;
  const bend = Math.max(40, Math.abs(x2 - x1) / 2);
  const low = Math.max(a.y + cardHeight(a.outcomes), b.y + cardHeight(b.outcomes)) + 70;
  const [c1x, c1y, c2x, c2y] = back ? [x1 + 90, low, x2 - 90, low] : [x1 + bend, y1, x2 - bend, y2];
  const mid = { x: (x1 + 3 * c1x + 3 * c2x + x2) / 8, y: (y1 + 3 * c1y + 3 * c2y + y2) / 8 };
  return { d: `M${x1} ${y1} C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`, mid };
}
