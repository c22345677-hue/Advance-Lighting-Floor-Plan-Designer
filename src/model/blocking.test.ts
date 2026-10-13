import { describe, expect, it } from 'vitest';
import { addMark, goToMark, marksOf, moveMark, removeMark } from './blocking';
import type { Item } from './types';

const p: Item = { id: 'p', kind: 'person', pos: { x: 0, y: 0 }, rotationDeg: 0 };

describe('blocking marks', () => {
  it('adds marks ahead, moves between them and keeps the current one at the person', () => {
    const a = { ...p, ...addMark(p) } as Item;
    expect(marksOf(a)).toEqual([{ x: 0, y: 0 }, { x: 0, y: -150 }]);
    const b = { ...a, ...goToMark(a, 1) } as Item;
    expect(b.pos).toEqual({ x: 0, y: -150 });
    // Dragging the person moves the mark they stand on.
    const dragged = { ...b, pos: { x: 20, y: -150 } };
    expect(marksOf(dragged)[1]).toEqual({ x: 20, y: -150 });
    const c = { ...dragged, ...moveMark(dragged, 0, { x: -50, y: 0 }) } as Item;
    expect(marksOf(c)[0]).toEqual({ x: -50, y: 0 });
    const d = { ...c, ...removeMark(c, 0) } as Item;
    expect(d.blocking).toBeUndefined();
    expect(d.pos).toEqual({ x: 20, y: -150 });
  });
});
