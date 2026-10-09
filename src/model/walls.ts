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
}

/** The nearest wall to `p` within `maxDist` cm, for snapping doors and windows into it. */
export function nearestWall(p: Vec2, items: readonly Item[], maxDist: number): WallHit | null {
  let best: WallHit | null = null;
  for (const w of items) {
    if (!w.wall) continue;
    for (const [a, b] of wallSegments(w)) {
      const h = projectOnSegment(p, a, b);
      if (h.dist <= maxDist && (!best || h.dist < best.dist)) {
        best = {
          wallId: w.id,
          point: h.point,
          angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
          dist: h.dist,
          thicknessCm: w.wall.thicknessCm ?? DEFAULT_WALL_CM,
        };
      }
    }
  }
  return best;
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
}

/**
 * Where a new wall corner lands: on a nearby corner if there is one, otherwise straightened to
 * 0/45/90° when the line is close to it (or in 15° steps with "fine").
 */
export function snapWallPoint(p: Vec2, o: SnapOptions): { point: Vec2; corner: boolean } {
  let bestCorner: Vec2 | null = null;
  for (const c of o.corners) if (dist(p, c) <= o.radius && (!bestCorner || dist(p, c) < dist(p, bestCorner))) bestCorner = c;
  if (bestCorner) return { point: bestCorner, corner: true };
  if (!o.from || o.angle === 'free') return { point: p, corner: false };
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
