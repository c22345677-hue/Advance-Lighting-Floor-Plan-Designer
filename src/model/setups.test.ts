import { describe, expect, it } from 'vitest';
import { makeSetup, placeSetup } from './setups';
import type { Item } from './types';

let n = 0;
const id = () => `n${++n}`;

describe('saved setups', () => {
  it('saves around the centre and places a renumbered copy elsewhere', () => {
    const l1: Item = { id: 'a', kind: 'light', catalogId: 'generic.light.cob', pos: { x: 100, y: 0 }, rotationDeg: 0, light: { unitId: 'L1', aimActorId: 'actor-1' } };
    const l2: Item = { id: 'b', kind: 'light', catalogId: 'generic.light.cob', pos: { x: 300, y: 0 }, rotationDeg: 0, light: { unitId: 'L2' } };
    const s = makeSetup('s', 'Two COBs', [l1, l2], { setItems: [], items: [l1, l2] });
    expect(s.items.map((i) => i.pos.x)).toEqual([-100, 100]);
    const placed = placeSetup(s, { x: 1000, y: 1000 }, [l1, l2], [], id);
    expect(placed.items.map((i) => i.pos)).toEqual([{ x: 900, y: 1000 }, { x: 1100, y: 1000 }]);
    expect(placed.items.map((i) => i.light?.unitId)).toEqual(['L3', 'L4']);
    expect(placed.items[0]!.light?.aimActorId).toBeUndefined(); // that person isn't in this project
    expect(new Set(placed.items.map((i) => i.id)).has('a')).toBe(false);
  });
});
