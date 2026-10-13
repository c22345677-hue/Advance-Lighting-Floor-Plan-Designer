import { describe, expect, it } from 'vitest';
import { horizontalFovDeg } from './lens';
import { fitTwoShot, twoShotFovDeg } from './twoShot';

const a = { x: -100, y: 0 };
const b = { x: 100, y: 0 };

describe('two shot', () => {
  it('aims between the two and zooms as tight as fits', () => {
    const r = fitTwoShot({ x: 0, y: 600 }, a, b, { focalMm: 35, zoom: { minMm: 24, maxMm: 70 } });
    expect(r.rotationDeg).toBeCloseTo(0);
    expect(r.movedBack).toBe(false);
    expect(r.focalMm).toBeGreaterThanOrEqual(24);
    expect(r.focalMm).toBeLessThanOrEqual(70);
    expect(twoShotFovDeg(r.pos, a, b)).toBeLessThanOrEqual(horizontalFovDeg(r.focalMm));
    // One mm tighter would cut someone off (unless already at the long end).
    if (r.focalMm < 70) expect(twoShotFovDeg(r.pos, a, b)).toBeGreaterThan(horizontalFovDeg(r.focalMm + 1));
  });

  it('stays at the long end when the pair is small in frame', () => {
    const r = fitTwoShot({ x: 0, y: 3000 }, a, b, { focalMm: 35, zoom: { minMm: 24, maxMm: 70 } });
    expect(r.focalMm).toBe(70);
    expect(r.movedBack).toBe(false);
  });

  it('backs away when even the wide end is too tight, and then stays put', () => {
    const lens = { focalMm: 35, zoom: { minMm: 24, maxMm: 70 } };
    const r = fitTwoShot({ x: 0, y: 150 }, a, b, lens);
    expect(r.movedBack).toBe(true);
    expect(r.focalMm).toBe(24);
    expect(r.pos.x).toBeCloseTo(0);
    expect(r.pos.y).toBeGreaterThan(150);
    expect(twoShotFovDeg(r.pos, a, b)).toBeLessThanOrEqual(horizontalFovDeg(24));
    const again = fitTwoShot(r.pos, a, b, { ...lens, focalMm: r.focalMm });
    expect(again.movedBack).toBe(false);
  });

  it('a prime keeps its focal length and moves the camera instead', () => {
    const r = fitTwoShot({ x: 0, y: 300 }, a, b, { focalMm: 85 });
    expect(r.focalMm).toBe(85);
    expect(r.movedBack).toBe(true);
    expect(twoShotFovDeg(r.pos, a, b)).toBeLessThanOrEqual(horizontalFovDeg(85));
  });
});
