import type { Vec2 } from './types';

const DEG = Math.PI / 180;

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

/** Rotate a point clockwise (screen space, +y down) around the origin. */
export function rotate(p: Vec2, deg: number): Vec2 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Normalise an angle to [0, 360). */
export function normDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Rotation (0 = up, clockwise) that makes something at `from` face `to`. */
export function aimAt(from: Vec2, to: Vec2): number {
  return normDeg(Math.atan2(to.x - from.x, from.y - to.y) / DEG);
}

/** `count` points in a row along x, centred on `center`, `spacing` cm apart. */
export function row(center: Vec2, count: number, spacing: number): Vec2[] {
  const start = center.x - ((count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: start + i * spacing, y: center.y }));
}

/**
 * `count` points on an arc of radius `dist` around `center`, spread over `spreadDeg`.
 * `directionDeg` is the arc's middle (0 = above the center, 180 = below).
 */
export function arc(
  center: Vec2,
  count: number,
  dist: number,
  spreadDeg: number,
  directionDeg: number,
): Vec2[] {
  const step = count > 1 ? spreadDeg / (count - 1) : 0;
  const first = directionDeg - (count > 1 ? spreadDeg / 2 : 0);
  return Array.from({ length: count }, (_, i) =>
    add(center, rotate({ x: 0, y: -dist }, first + i * step)),
  );
}
