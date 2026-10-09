// Walls drawn as chains of points (rooms), plus the geometry doors and windows need to sit in them.
import { rotate } from './geometry';
import type { Item, Vec2 } from './types';

export const DEFAULT_WALL_CM = 15;

/** A wall chain's corners in world coordinates (item position and rotation applied). */
export function wallPoints(item: Item): Vec2[] {
  if (!item.wall) return [];
  return item.wall.points.map((p) => {
    const r = rotate(p, item.rotationDeg);
    return { x: item.pos.x + r.x, y: item.pos.y + r.y };
  });
}

/** World segments of a wall chain (closing segment included when closed). */
export function wallSegments(item: Item): [Vec2, Vec2][] {
  const pts = wallPoints(item);
  const segs: [Vec2, Vec2][] = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i]!, pts[i + 1]!]);
  if (item.wall?.closed && pts.length > 2) segs.push([pts[pts.length - 1]!, pts[0]!]);
  return segs;
}

/** Turns world corners back into a wall item's local points. */
export function toLocal(item: Pick<Item, 'pos' | 'rotationDeg'>, p: Vec2): Vec2 {
  return rotate({ x: p.x - item.pos.x, y: p.y - item.pos.y }, -item.rotationDeg);
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Closest point on segment ab to p, with t in [0, 1] along it. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { point, t, dist: dist(p, point) };
}

export interface WallHit {
  wallId: string;
  /** Point on the wall's centre line. */
  point: Vec2;
  /** Rotation that lays a door or window along the wall, degrees clockwise (screen). */
  angleDeg: number;
  dist: number;
  thicknessCm: number;
  /** Which segment of the chain, and how far along it (cm from its first corner). */
  seg: number;
  offsetCm: number;
}

/** The nearest wall to `p` within `maxDist` cm, for snapping doors and windows into it. */
export function nearestWall(p: Vec2, items: readonly Item[], maxDist: number): WallHit | null {
  let best: WallHit | null = null;
  for (const w of items) {
    if (!w.wall) continue;
    wallSegments(w).forEach(([a, b], seg) => {
      const h = projectOnSegment(p, a, b);
      if (h.dist <= maxDist && (!best || h.dist < best.dist)) {
        best = {
          wallId: w.id,
          point: h.point,
          angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
          dist: h.dist,
          thicknessCm: w.wall!.thicknessCm ?? DEFAULT_WALL_CM,
          seg,
          offsetCm: h.t * dist(a, b),
        };
      }
    });
  }
  return best;
}

/** The same hit moved along its segment so an opening `width` wide stays inside the wall. */
export function clampHit(hit: WallHit, items: readonly Item[], width: number): WallHit {
  const w = items.find((x) => x.id === hit.wallId);
  const seg = w && wallSegments(w)[hit.seg];
  if (!seg) return hit;
  const len = dist(seg[0], seg[1]);
  const offsetCm = len <= width ? len / 2 : Math.min(len - width / 2, Math.max(width / 2, hit.offsetCm));
  const t = len ? offsetCm / len : 0;
  return { ...hit, offsetCm, point: { x: seg[0].x + (seg[1].x - seg[0].x) * t, y: seg[0].y + (seg[1].y - seg[0].y) * t } };
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Patch that puts a door or window into the wall it was dropped on (keeps its width). */
export function seatOpening(item: Item, hit: WallHit, width: number): Partial<Item> {
  const flip = !!item.inWall?.flip;
  return {
    pos: hit.point,
    rotationDeg: norm(hit.angleDeg + (flip ? 180 : 0)),
    sizeCm: { w: width, d: hit.thicknessCm },
    inWall: { wallId: hit.wallId, seg: hit.seg, offsetCm: hit.offsetCm, flip },
  };
}

/**
 * Moves doors and windows to follow their wall after it was moved, rotated or reshaped.
 * They keep their distance from the segment's first corner and their width (pulled back inside
 * when the segment got too short). An opening whose wall is gone stays put, unlinked.
 * Returns the same array when nothing changes.
 */
export function attachOpenings(items: Item[], all: readonly Item[] = items): Item[] {
  let changed = false;
  const out = items.map((i) => {
    if (!i.inWall) return i;
    const w = all.find((x) => x.id === i.inWall!.wallId && x.wall);
    const seg = w ? wallSegments(w)[i.inWall.seg] : undefined;
    if (!w || !seg) {
      changed = true;
      const { inWall: _, ...rest } = i;
      return rest;
    }
    const next = placeInSegment(i, seg, w.wall!.thicknessCm ?? DEFAULT_WALL_CM);
    const same =
      Math.abs(next.pos.x - i.pos.x) < 1e-6 &&
      Math.abs(next.pos.y - i.pos.y) < 1e-6 &&
      Math.abs(next.rotationDeg - i.rotationDeg) < 1e-6 &&
      next.sizeCm.d === i.sizeCm?.d;
    if (same) return i;
    changed = true;
    return { ...i, ...next };
  });
  return changed ? out : items;
}

/** Where an attached opening sits on segment [a, b]. */
export function placeInSegment(i: Item, [a, b]: [Vec2, Vec2], thicknessCm: number) {
  const len = dist(a, b);
  const w = i.sizeCm?.w ?? 0;
  const off = len <= w ? len / 2 : Math.min(len - w / 2, Math.max(w / 2, i.inWall!.offsetCm));
  const ux = len ? (b.x - a.x) / len : 1;
  const uy = len ? (b.y - a.y) / len : 0;
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  return {
    pos: { x: a.x + ux * off, y: a.y + uy * off },
    rotationDeg: norm(angle + (i.inWall!.flip ? 180 : 0)),
    sizeCm: { w, d: thicknessCm },
  };
}

export interface SnapOptions {
  /** Previous corner of the wall being drawn (for angle snapping). */
  from?: Vec2;
  /** Corners to snap onto: existing walls and the chain being drawn. */
  corners: Vec2[];
  /** Snap radius for corners, cm. */
  radius: number;
  /** Free angle (no snapping) vs. fine 15° steps; default snaps near 0/45/90°. */
  angle?: 'auto' | 'fine' | 'free';
  /** Existing wall segments: a corner close to one lands on it (for T-junctions). */
  lines?: [Vec2, Vec2][];
}

/**
 * Where a new wall corner lands: on a nearby corner if there is one, otherwise straightened to
 * 0/45/90° when the line is close to it (or in 15° steps with "fine").
 */
export function snapWallPoint(p: Vec2, o: SnapOptions): { point: Vec2; corner: boolean } {
  let bestCorner: Vec2 | null = null;
  for (const c of o.corners) if (dist(p, c) <= o.radius && (!bestCorner || dist(p, c) < dist(p, bestCorner))) bestCorner = c;
  if (bestCorner) return { point: bestCorner, corner: true };
  if (o.angle === 'free') return { point: p, corner: false };
  for (const [a, b] of o.lines ?? []) {
    const h = projectOnSegment(p, a, b);
    if (h.dist <= o.radius) return { point: h.point, corner: false };
  }
  if (!o.from) return { point: p, corner: false };
  const dx = p.x - o.from.x;
  const dy = p.y - o.from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { point: p, corner: false };
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const step = o.angle === 'fine' ? 15 : 45;
  const snapped = Math.round(ang / step) * step;
  if (o.angle !== 'fine' && Math.abs(snapped - ang) > 6) return { point: p, corner: false };
  const r = (snapped * Math.PI) / 180;
  return { point: { x: o.from.x + Math.cos(r) * len, y: o.from.y + Math.sin(r) * len }, corner: false };
}

/** Drops repeated corners (a double-click lands twice on the same spot). */
export function cleanChain(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1]!, p) > 1) out.push(p);
  return out;
}

/** A wall item from a drawn chain (world points). Null when it has fewer than two corners. */
export function wallFromChain(id: string, chain: Vec2[], closed: boolean, thicknessCm = DEFAULT_WALL_CM): Item | null {
  let pts = cleanChain(chain);
  if (closed && pts.length > 2 && dist(pts[0]!, pts[pts.length - 1]!) <= 1) pts = pts.slice(0, -1);
  if (pts.length < 2) return null;
  const origin = pts[0]!;
  return {
    id,
    kind: 'set',
    catalogId: 'generic.set.walls',
    pos: origin,
    rotationDeg: 0,
    wall: { points: pts.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })), closed: closed && pts.length > 2, thicknessCm },
  };
}

/** Total length of a wall chain, cm. */
export function wallLength(item: Item): number {
  return wallSegments(item).reduce((n, [a, b]) => n + dist(a, b), 0);
}

// ---- Editing existing walls with the Draw walls tool ----------------------------------

export type ItemPatch = { id: string; patch: Partial<Item> };

/** An end corner of an open wall near `p`: clicking it continues that wall. */
export function openWallEnd(p: Vec2, items: readonly Item[], radius: number): { wallId: string; atStart: boolean; point: Vec2 } | null {
  let best: { wallId: string; atStart: boolean; point: Vec2; d: number } | null = null;
  for (const w of items) {
    if (!w.wall || w.wall.closed) continue;
    const pts = wallPoints(w);
    for (const [atStart, q] of [[true, pts[0]!], [false, pts[pts.length - 1]!]] as const) {
      const d = dist(p, q);
      if (d <= radius && (!best || d < best.d)) best = { wallId: w.id, atStart, point: q, d };
    }
  }
  return best && { wallId: best.wallId, atStart: best.atStart, point: best.point };
}

/** Is `p` on one of the wall's corners? */
export function onWallCorner(p: Vec2, items: readonly Item[], radius: number): boolean {
  return items.some((w) => wallPoints(w).some((q) => dist(p, q) <= radius));
}

/**
 * Adds a corner to a wall where it was clicked (segment `seg`, `offsetCm` along it).
 * Doors and windows past the new corner move to the second half of the split segment.
 */
export function insertWallCorner(wall: Item, seg: number, offsetCm: number, items: readonly Item[]): ItemPatch[] {
  const segs = wallSegments(wall);
  const s = segs[seg];
  if (!s || !wall.wall) return [];
  const len = dist(s[0], s[1]);
  const t = len ? offsetCm / len : 0;
  const at = { x: s[0].x + (s[1].x - s[0].x) * t, y: s[0].y + (s[1].y - s[0].y) * t };
  const points = wall.wall.points.slice();
  points.splice(seg + 1, 0, toLocal(wall, at));
  const out: ItemPatch[] = [{ id: wall.id, patch: { wall: { ...wall.wall, points } } }];
  for (const i of items) {
    const iw = i.inWall;
    if (!iw || iw.wallId !== wall.id || iw.seg < seg) continue;
    if (iw.seg > seg) out.push({ id: i.id, patch: { inWall: { ...iw, seg: iw.seg + 1 } } });
    else if (iw.offsetCm > offsetCm) out.push({ id: i.id, patch: { inWall: { ...iw, seg: seg + 1, offsetCm: iw.offsetCm - offsetCm } } });
  }
  return out;
}

/**
 * Continues an open wall with new corners (world points, the first one is the old end itself).
 * `close` joins the new last corner back to the wall's other end.
 */
export function extendWall(wall: Item, atStart: boolean, chain: Vec2[], close: boolean, items: readonly Item[]): ItemPatch[] {
  if (!wall.wall) return [];
  const added = cleanChain(chain).slice(1).map((q) => toLocal(wall, q));
  if (!added.length && !close) return [];
  const points = atStart ? [...added.reverse(), ...wall.wall.points] : [...wall.wall.points, ...added];
  const out: ItemPatch[] = [{ id: wall.id, patch: { wall: { ...wall.wall, points, closed: close && points.length > 2 } } }];
  // Segments are counted from the first corner, so adding at the start shifts them.
  if (atStart && added.length)
    for (const i of items)
      if (i.inWall?.wallId === wall.id) out.push({ id: i.id, patch: { inWall: { ...i.inWall, seg: i.inWall.seg + added.length } } });
  return out;
}
