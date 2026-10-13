import { describe, expect, it } from 'vitest';
import { arcAround, faceTowards, lineUp, spaceEvenly } from './arrange';
import type { Item } from './types';

const at = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind: 'light', pos: { x, y }, rotationDeg: 0, ...extra });

describe('arrange', () => {
  it('lines up and spaces evenly, leaving locked items alone', () => {
    const row = lineUp([at('a', 0, 0), at('b', 100, 30), at('c', 200, 60), at('d', 0, 500, { locked: true })], 'across');
    expect(row.map((p) => p.patch.pos!.y)).toEqual([30, 30, 30]);
    const even = spaceEvenly([at('a', 0, 0), at('b', 20, 0), at('c', 300, 0)]);
    expect(even.find((p) => p.id === 'b')!.patch.pos!.x).toBeCloseTo(150);
  });

  it('arcs around a point at the same distance, all facing it', () => {
    const out = arcAround([at('a', -100, 300), at('b', 0, 310), at('c', 100, 300)], { x: 0, y: 0 });
    const r = out.map((p) => Math.hypot(p.patch.pos!.x, p.patch.pos!.y));
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(0.01);
    for (const p of out) {
      // Facing the centre: the direction they face points back at (0, 0).
      const rad = (p.patch.rotationDeg! * Math.PI) / 180;
      const ahead = { x: p.patch.pos!.x + Math.sin(rad) * 10, y: p.patch.pos!.y - Math.cos(rad) * 10 };
      expect(Math.hypot(ahead.x, ahead.y)).toBeLessThan(Math.hypot(p.patch.pos!.x, p.patch.pos!.y));
    }
    expect(faceTowards([at('a', 0, 100)], { x: 0, y: 0 })[0]!.patch.rotationDeg).toBeCloseTo(0);
  });
});
