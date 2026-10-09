import { describe, expect, it } from 'vitest';
import { cleanChain, nearestWall, snapWallPoint, wallFromChain, wallLength, wallSegments } from './walls';

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
