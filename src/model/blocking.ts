// Blocking: a person's marks in order (1 → 2 → 3). The person stands on one of them; moving to
// another mark moves them there, so cameras, lights and readings follow.
import { rotate } from './geometry';
import type { Item, Vec2 } from './types';

/** All marks, with the one they're standing on at their current position. */
export function marksOf(i: Item): Vec2[] {
  const b = i.blocking;
  if (!b || b.marks.length < 2) return [];
  return b.marks.map((m, k) => (k === b.at ? i.pos : m));
}

/** A new mark 1.5 m ahead of the last one, the way the person faces. */
export function addMark(i: Item): Partial<Item> {
  const marks = marksOf(i).length ? marksOf(i) : [i.pos];
  const last = marks[marks.length - 1]!;
  const step = rotate({ x: 0, y: -150 }, i.rotationDeg);
  return { blocking: { marks: [...marks, { x: last.x + step.x, y: last.y + step.y }], at: i.blocking?.at ?? 0 } };
}

export function goToMark(i: Item, k: number): Partial<Item> {
  const marks = marksOf(i);
  const to = marks[k];
  if (!to) return {};
  return { pos: to, blocking: { marks, at: k } };
}

export function moveMark(i: Item, k: number, pos: Vec2): Partial<Item> {
  const marks = marksOf(i).map((m, j) => (j === k ? pos : m));
  return k === i.blocking?.at ? { pos, blocking: { marks, at: k } } : { blocking: { marks, at: i.blocking!.at } };
}

export function removeMark(i: Item, k: number): Partial<Item> {
  const marks = marksOf(i).filter((_, j) => j !== k);
  const at = i.blocking!.at;
  if (marks.length < 2) return { blocking: undefined, pos: k === at ? marks[0] ?? i.pos : i.pos };
  const nextAt = k < at ? at - 1 : k === at ? Math.min(at, marks.length - 1) : at;
  return { blocking: { marks, at: nextAt }, pos: marks[nextAt]! };
}
