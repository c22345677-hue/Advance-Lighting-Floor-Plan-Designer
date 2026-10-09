import { describe, expect, it } from 'vitest';
import { attachOpenings, cleanChain, nearestWall, seatOpening, snapWallPoint, wallFromChain, wallLength, wallSegments } from './walls';
import type { Item } from './types';

describe('walls', () => {
  it('builds a closed room from a drawn chain and drops the repeated last corner', () => {
    const room = wallFromChain('w', [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
      { x: 0, y: 0 },
    ], true)!;
    expect(room.wall!.points).toHaveLength(4);
    expect(room.wall!.closed).toBe(true);
    expect(wallSegments(room)).toHaveLength(4);
    expect(wallLength(room)).toBe(1400);
  });

  it('keeps one or two walls open, and needs at least two corners', () => {
    const one = wallFromChain('w', [{ x: 0, y: 0 }, { x: 200, y: 0 }], false)!;
    expect(wallSegments(one)).toHaveLength(1);
    expect(wallFromChain('w', [{ x: 0, y: 0 }, { x: 0.5, y: 0 }], false)).toBeNull();
    expect(cleanChain([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }])).toHaveLength(2);
  });

  it('snaps to nearby corners first, then straightens near 0/45/90°', () => {
    const corner = { x: 400, y: 0 };
    expect(snapWallPoint({ x: 395, y: 6 }, { corners: [corner], radius: 20 }).point).toEqual(corner);
    const p = snapWallPoint({ x: 300, y: 12 }, { from: { x: 0, y: 0 }, corners: [], radius: 20 }).point;
    expect(p.y).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(Math.hypot(300, 12));
    // 30° is far from 0/45/90: left alone unless fine snapping is on.
    const q = { x: 100, y: 57.7 };
    expect(snapWallPoint(q, { from: { x: 0, y: 0 }, corners: [], radius: 20 }).point).toEqual(q);
    const fine = snapWallPoint(q, { from: { x: 0, y: 0 }, corners: [], radius: 20, angle: 'fine' }).point;
    expect((Math.atan2(fine.y, fine.x) * 180) / Math.PI).toBeCloseTo(30);
  });

  it('finds the nearest wall and its direction for doors and windows', () => {
    const room = wallFromChain('w', [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }], false)!;
    const hit = nearestWall({ x: 410, y: 150 }, [room], 50)!;
    expect(hit.point).toEqual({ x: 400, y: 150 });
    expect(hit.angleDeg).toBeCloseTo(90); // the right-hand wall runs downwards
    expect(nearestWall({ x: 200, y: 200 }, [room], 50)).toBeNull();
  });
});

describe('doors and windows in walls', () => {
  const wall = wallFromChain('w', [{ x: 0, y: 0 }, { x: 400, y: 0 }], false)!;
  const door: Item = { id: 'd', kind: 'set', catalogId: 'generic.door.single', pos: { x: 0, y: 0 }, rotationDeg: 0, sizeCm: { w: 90, d: 15 } };
  const seated = { ...door, ...seatOpening(door, nearestWall({ x: 100, y: 10 }, [wall], 60)!, 90) } as Item;

  it('remembers where along the wall it sits', () => {
    expect(seated.inWall).toMatchObject({ wallId: 'w', seg: 0 });
    expect(seated.inWall!.offsetCm).toBeCloseTo(100);
  });

  it('follows a moved or rotated wall', () => {
    const moved = { ...wall, pos: { x: 50, y: 200 }, rotationDeg: 90 };
    const [d] = attachOpenings([seated], [moved, seated]);
    expect(d!.pos.x).toBeCloseTo(50);
    expect(d!.pos.y).toBeCloseTo(300);
    expect(d!.rotationDeg).toBeCloseTo(90);
  });

  it('keeps its width and distance when the wall gets longer', () => {
    const longer = { ...wall, wall: { ...wall.wall!, points: [{ x: 0, y: 0 }, { x: 900, y: 0 }] } };
    const [d] = attachOpenings([seated], [longer, seated]);
    expect(d!.pos.x).toBeCloseTo(100);
    expect(d!.sizeCm!.w).toBe(90);
  });

  it('stays inside a wall that got shorter, and unlinks when the wall is deleted', () => {
    const shorter = { ...wall, wall: { ...wall.wall!, points: [{ x: 0, y: 0 }, { x: 80, y: 0 }] } };
    expect(attachOpenings([seated], [shorter, seated])[0]!.pos.x).toBeCloseTo(40);
    const far = { ...seated, inWall: { ...seated.inWall!, offsetCm: 380 } };
    expect(attachOpenings([far], [wall, far])[0]!.pos.x).toBeCloseTo(355);
    expect(attachOpenings([seated], [seated])[0]!.inWall).toBeUndefined();
  });
});
