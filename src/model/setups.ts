// Saved setups: a selection kept by name (relative positions, all settings), to drop into any
// scene or project later.
import { nextUnitId } from './gear';
import type { Actor, Item, Vec2 } from './types';

export interface Setup {
  id: string;
  name: string;
  /** Items around (0, 0). */
  items: Item[];
  /** Which of them go in the scene's set layer. */
  setIds: string[];
}

const shift = (p: Vec2, d: Vec2): Vec2 => ({ x: p.x + d.x, y: p.y + d.y });

/** A setup from the selected items (doors and windows of selected walls come along). */
export function makeSetup(id: string, name: string, picked: readonly Item[], scene: { setItems: Item[]; items: Item[] }): Setup {
  const ids = new Set(picked.map((i) => i.id));
  const all = [...scene.setItems, ...scene.items];
  const chosen = all.filter((i) => ids.has(i.id) || (i.inWall && ids.has(i.inWall.wallId)));
  const c = { x: -chosen.reduce((n, i) => n + i.pos.x, 0) / chosen.length, y: -chosen.reduce((n, i) => n + i.pos.y, 0) / chosen.length };
  const items = chosen.map((i) => {
    const copy: Item = structuredClone(i);
    copy.pos = shift(i.pos, c);
    if (copy.blocking) copy.blocking.marks = copy.blocking.marks.map((m) => shift(m, c));
    delete copy.locked;
    return copy;
  });
  return { id, name, items, setIds: chosen.filter((i) => scene.setItems.includes(i)).map((i) => i.id) };
}

/**
 * The setup's items placed at `at` with fresh ids. People stay the same cast member when the
 * project has them (and isn't already using them in this scene); otherwise they become crew-less
 * generic people. Follow links to missing people are dropped; lights get the next numbers.
 */
export function placeSetup(setup: Setup, at: Vec2, scene: readonly Item[], actors: readonly Actor[], newId: () => string): { setItems: Item[]; items: Item[] } {
  const ids = new Map(setup.items.map((i) => [i.id, newId()]));
  const known = (actorId?: string) => (actorId && actors.some((a) => a.id === actorId) && !scene.some((i) => i.actorId === actorId) ? actorId : undefined);
  const linked = (actorId?: string) => (actorId && actors.some((a) => a.id === actorId) ? actorId : undefined);
  const placed: Item[] = [];
  for (const src of setup.items) {
    const i: Item = structuredClone(src);
    i.id = ids.get(src.id)!;
    i.pos = shift(src.pos, at);
    if (i.blocking) i.blocking.marks = i.blocking.marks.map((m) => shift(m, at));
    if (i.actorId) i.actorId = known(i.actorId);
    if (i.lookAtActorId) i.lookAtActorId = linked(i.lookAtActorId);
    if (i.camera) {
      i.camera.focusActorId = linked(i.camera.focusActorId);
      if (i.camera.twoShot && !i.camera.twoShot.every((a) => linked(a))) delete i.camera.twoShot;
    }
    if (i.light) {
      i.light.aimActorId = linked(i.light.aimActorId);
      i.light.unitId = nextUnitId([...scene, ...placed]);
    }
    if (i.inWall) {
      const wallId = ids.get(i.inWall.wallId);
      if (wallId) i.inWall = { ...i.inWall, wallId };
      else delete i.inWall;
    }
    placed.push(i);
  }
  const setIds = new Set(setup.setIds.map((id) => ids.get(id)));
  return { setItems: placed.filter((i) => setIds.has(i.id)), items: placed.filter((i) => !setIds.has(i.id)) };
}
