// Arranging a selection: line up, space evenly, arc around a point, face a point.
import { itemLook } from './gear';
import { aimAt } from './geometry';
import type { Item, Vec2 } from './types';

export type Patch = { id: string; patch: Partial<Item> };

/** Items that can be arranged: not locked, not walls, not doors/windows (those follow walls). */
export const arrangeable = (items: readonly Item[]) => items.filter((i) => !i.locked && !i.wall && !i.inWall);

const mean = (vs: number[]) => vs.reduce((a, b) => a + b, 0) / vs.length;

/** Same y (a row across) or same x (a column down), at the average. */
export function lineUp(items: readonly Item[], axis: 'across' | 'down'): Patch[] {
  const list = arrangeable(items);
  if (list.length < 2) return [];
  if (axis === 'across') {
    const y = mean(list.map((i) => i.pos.y));
    return list.map((i) => ({ id: i.id, patch: { pos: { x: i.pos.x, y } } }));
  }
  const x = mean(list.map((i) => i.pos.x));
  return list.map((i) => ({ id: i.id, patch: { pos: { x, y: i.pos.y } } }));
}

/** Even gaps between the two outermost items, along the line between them. */
export function spaceEvenly(items: readonly Item[]): Patch[] {
  const list = arrangeable(items);
  if (list.length < 3) return [];
  // The two items farthest apart set the line.
  let [a, b] = [list[0]!, list[1]!];
  let best = -1;
  for (const p of list)
    for (const q of list) {
      const d = Math.hypot(p.pos.x - q.pos.x, p.pos.y - q.pos.y);
      if (d > best) [best, a, b] = [d, p, q];
    }
  const dir = { x: (b.pos.x - a.pos.x) / best, y: (b.pos.y - a.pos.y) / best };
  const along = (i: Item) => (i.pos.x - a.pos.x) * dir.x + (i.pos.y - a.pos.y) * dir.y;
  const sorted = [...list].sort((p, q) => along(p) - along(q));
  return sorted.map((i, k) => {
    const t = (best * k) / (sorted.length - 1);
    return { id: i.id, patch: { pos: { x: a.pos.x + dir.x * t, y: a.pos.y + dir.y * t } } };
  });
}

/**
 * An arc around `center` at the items' average distance, spread evenly over the angle they
 * already cover (at least 30° between neighbours' worth when bunched), each turned to face it.
 */
export function arcAround(items: readonly Item[], center: Vec2): Patch[] {
  const list = arrangeable(items);
  if (!list.length) return [];
  const r = Math.max(50, mean(list.map((i) => Math.hypot(i.pos.x - center.x, i.pos.y - center.y))));
  const bearing = (i: Item) => aimAt(center, i.pos);
  const mid = aimAt(center, { x: mean(list.map((i) => i.pos.x)), y: mean(list.map((i) => i.pos.y)) });
  const rel = (i: Item) => ((bearing(i) - mid + 540) % 360) - 180;
  const sorted = [...list].sort((p, q) => rel(p) - rel(q));
  // Neighbours at least 30° apart, and far enough apart along the arc not to overlap.
  const widest = Math.max(...list.map((i) => itemLook(i).w));
  const step = Math.max(30, ((widest + 20) / r) * (180 / Math.PI));
  const span = Math.min(330, Math.max((sorted.length - 1) * step, rel(sorted[sorted.length - 1]!) - rel(sorted[0]!)));
  return sorted.map((i, k) => {
    const deg = mid - span / 2 + (sorted.length === 1 ? span / 2 : (span * k) / (sorted.length - 1));
    const rad = (deg * Math.PI) / 180;
    const pos = { x: center.x + Math.sin(rad) * r, y: center.y - Math.cos(rad) * r };
    return { id: i.id, patch: { pos, rotationDeg: aimAt(pos, center) } };
  });
}

/** Turn each item to face `target`. */
export const faceTowards = (items: readonly Item[], target: Vec2): Patch[] =>
  arrangeable(items).map((i) => ({ id: i.id, patch: { rotationDeg: aimAt(i.pos, target) } }));
