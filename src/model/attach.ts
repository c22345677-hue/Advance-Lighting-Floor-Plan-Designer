// Attaching items to each other: a frame to a light, a light meter to a person. An attached item
// keeps its place and turn in the frame of the item it hangs on, so the whole group moves and
// turns as one around the item at the top (the root). A light meter is the exception when it is
// turned by itself: it orbits the item it hangs on, at the same distance.
import { followsActorId, twoShotTargets } from './project';
import { normDeg, rotate } from './geometry';
import type { Attachment, Item, Vec2 } from './types';

export const LIGHT_METER_ID = 'generic.camera.light-meter';
export const isMeter = (i: Item | undefined) => i?.catalogId === LIGHT_METER_ID;

const isOpening = (i: Item) => !!i.inWall;

/** Offset and turn that keep `child` where it is now, hanging on `parent`. */
export function attachmentFor(child: Item, parent: Item): Attachment {
  return {
    to: parent.id,
    offset: rotate({ x: child.pos.x - parent.pos.x, y: child.pos.y - parent.pos.y }, -parent.rotationDeg),
    rotDeg: normDeg(child.rotationDeg - parent.rotationDeg),
  };
}

/** Where an attached item sits given its parent. */
export function placeOn(parent: Item, a: Attachment): { pos: Vec2; rotationDeg: number } {
  const r = rotate(a.offset, parent.rotationDeg);
  return { pos: { x: parent.pos.x + r.x, y: parent.pos.y + r.y }, rotationDeg: normDeg(parent.rotationDeg + a.rotDeg) };
}

/** The item at the top of `item`'s chain of attachments. */
export function rootOf(item: Item, all: readonly Item[]): Item {
  let cur = item;
  const seen = new Set<string>();
  while (cur.attachedTo && !seen.has(cur.id)) {
    seen.add(cur.id);
    const up = all.find((i) => i.id === cur.attachedTo!.to);
    if (!up) break;
    cur = up;
  }
  return cur;
}

/** Everything hanging on `item`, directly or further down. */
export function descendantsOf(item: Item, all: readonly Item[]): Item[] {
  const out: Item[] = [];
  const queue = [item.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const i of all) {
      if (i.attachedTo?.to === id && !out.includes(i) && i.id !== item.id) {
        out.push(i);
        queue.push(i.id);
      }
    }
  }
  return out;
}

/** The whole group `item` belongs to: its root and everything hanging on it (the root first). */
export function assemblyOf(item: Item, all: readonly Item[]): Item[] {
  const root = rootOf(item, all);
  return [root, ...descendantsOf(root, all)];
}

/** Can `child` be hung on `parent`? Not on itself, not in a loop, and not doors, windows or walls as the child. */
export function canAttach(child: Item, parent: Item, all: readonly Item[]): boolean {
  if (child.id === parent.id || isOpening(child) || isOpening(parent) || child.wall) return false;
  return !descendantsOf(child, all).some((d) => d.id === parent.id);
}

/** Keeps its own direction (it turns to face someone), so only its position follows the parent. */
const aimsItself = (i: Item, all: readonly Item[]) =>
  !!twoShotTargets(i, all) || (!!followsActorId(i) && all.some((a) => a.actorId === followsActorId(i))) || (i.kind === 'light' && !!i.light?.aimItemId && all.some((a) => a.id === i.light!.aimItemId));

/**
 * Puts every attached item where its parent says (top-down, so chains follow). Items in `moved`
 * were placed by hand in this edit: they keep their new place and remember it as their new offset.
 * Attachments to items that are gone are dropped. Returns the same arrays when nothing changes.
 */
export function settleAttachments<T extends { setItems: Item[]; items: Item[] }>(s: T, moved: ReadonlySet<string> = new Set()): T {
  const all = [...s.setItems, ...s.items];
  if (!all.some((i) => i.attachedTo)) return s;
  const byId = new Map(all.map((i) => [i.id, i]));
  const done = new Map<string, Item>();
  const resolve = (i: Item, depth = 0): Item => {
    const hit = done.get(i.id);
    if (hit) return hit;
    let out = i;
    const a = i.attachedTo;
    if (a) {
      const parentRaw = byId.get(a.to);
      if (!parentRaw || depth > 20) out = { ...i, attachedTo: undefined };
      else {
        const parent = resolve(parentRaw, depth + 1);
        if (moved.has(i.id)) out = { ...i, attachedTo: attachmentFor(i, parent) };
        else {
          const at = placeOn(parent, a);
          const keepTurn = aimsItself(i, all);
          const same = Math.abs(at.pos.x - i.pos.x) < 1e-6 && Math.abs(at.pos.y - i.pos.y) < 1e-6 && (keepTurn || Math.abs(at.rotationDeg - i.rotationDeg) < 1e-6);
          if (!same) out = { ...i, pos: at.pos, rotationDeg: keepTurn ? i.rotationDeg : at.rotationDeg };
        }
      }
    }
    done.set(i.id, out);
    return out;
  };
  const setItems = s.setItems.map((i) => resolve(i));
  const items = s.items.map((i) => resolve(i));
  const same = setItems.every((x, k) => x === s.setItems[k]) && items.every((x, k) => x === s.items[k]);
  return same ? s : { ...s, setItems, items };
}

/**
 * Patches that turn `item` by `deg` as part of its group: the whole group turns around the
 * root's centre, except a light meter, which orbits the item it hangs on.
 */
export function turnPatches(item: Item, deg: number, all: readonly Item[]): { id: string; patch: Partial<Item> }[] {
  if (isMeter(item) && item.attachedTo) {
    const a = item.attachedTo;
    return [{ id: item.id, patch: { attachedTo: { ...a, offset: rotate(a.offset, deg), rotDeg: normDeg(a.rotDeg + deg) } } }];
  }
  const root = rootOf(item, all);
  return [{ id: root.id, patch: { rotationDeg: normDeg(root.rotationDeg + deg) } }];
}

/** Detaches whatever hangs on the `ids` (they stay where they are). */
export function releaseChildren(items: Item[], ids: ReadonlySet<string>): Item[] {
  return items.map((i) => (i.attachedTo && ids.has(i.attachedTo.to) ? { ...i, attachedTo: undefined } : i));
}

/** Distance in front of a person's face where their light meter is held, cm. */
const METER_IN_FRONT_CM = 35;

/** Gives every person in `items` a light meter held in front of their face (unless one already hangs on them). */
export function withMeters(items: Item[], newId: () => string): Item[] {
  const meters: Item[] = [];
  for (const p of items) {
    if (p.kind !== 'person' || items.some((m) => isMeter(m) && m.attachedTo?.to === p.id)) continue;
    const attachedTo: Attachment = { to: p.id, offset: { x: 0, y: -METER_IN_FRONT_CM }, rotDeg: 0 };
    meters.push({ id: newId(), kind: 'prop', catalogId: LIGHT_METER_ID, ...placeOn(p, attachedTo), attachedTo });
  }
  return meters.length ? [...items, ...meters] : items;
}
