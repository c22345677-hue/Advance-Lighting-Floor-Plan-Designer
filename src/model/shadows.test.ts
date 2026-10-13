import { describe, expect, it } from 'vitest';
import { darknessFor, lightSource, sceneShadows, shadowPolygon } from './shadows';
import type { Item } from './types';

const light = (catalogId: string, extra: Partial<Item> = {}): Item => ({
  id: 'L',
  kind: 'light',
  catalogId,
  pos: { x: 0, y: 300 },
  rotationDeg: 0, // facing up, towards the person
  light: { throwCm: 600 },
  ...extra,
});
const person: Item = { id: 'P', kind: 'person', catalogId: 'generic.person', pos: { x: 0, y: 0 }, rotationDeg: 0 };

describe('shadows', () => {
  it('hard lights throw darker shadows than soft ones', () => {
    const fresnel = lightSource(light('generic.light.fresnel'), [])!;
    const mat = lightSource(light('generic.light.mat'), [])!;
    const balloon = lightSource(light('generic.light.balloon'), [])!;
    expect(fresnel.hardness).toBe('hard');
    expect(mat.hardness).toBe('soft');
    expect(fresnel.darkness).toBeGreaterThan(mat.darkness);
    expect(mat.darkness).toBeGreaterThan(0);
    expect(balloon.darkness).toBeLessThan(0.2);
    expect(darknessFor(10)).toBeGreaterThan(darknessFor(200));
  });

  it('a person casts a shadow away from the light', () => {
    const { shadows } = sceneShadows([light('generic.light.fresnel'), person]);
    expect(shadows.length).toBe(1);
    // The shadow reaches beyond the person, on the far side from the light (y < 0).
    expect(Math.min(...shadows[0]!.points.map((p) => p.y))).toBeLessThan(-100);
  });

  it('soft sources split into several faint shadows (soft edge)', () => {
    const { shadows } = sceneShadows([light('generic.light.mat'), person]);
    expect(shadows.length).toBeGreaterThan(1);
    const total = shadows.reduce((n, s) => n + s.opacity, 0);
    expect(total).toBeCloseTo(lightSource(light('generic.light.mat'), [])!.darkness);
  });

  it('a diffusion frame in the beam softens what is behind it', () => {
    const frame: Item = { id: 'F', kind: 'grip', catalogId: 'generic.grip.frame-6x6', pos: { x: 0, y: 200 }, rotationDeg: 0, grip: { fabric: 'full-grid' } };
    const hard = lightSource(light('generic.light.fresnel'), [])!;
    const diffused = lightSource(light('generic.light.fresnel'), [frame])!;
    expect(diffused.sizeCm).toBe(180);
    expect(diffused.darkness).toBeLessThan(hard.darkness);
  });

  it('nothing outside the beam is shadowed, and lower things cast shorter shadows', () => {
    const behind = { ...person, pos: { x: 0, y: 600 } };
    expect(sceneShadows([light('generic.light.fresnel'), behind]).shadows).toEqual([]);
    const occ = { id: 'o', points: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }] };
    const low = shadowPolygon({ x: 0, y: 300 }, 200, { ...occ, heightCm: 50 }, 1000)!;
    const tall = shadowPolygon({ x: 0, y: 300 }, 200, { ...occ, heightCm: 150 }, 1000)!;
    expect(Math.min(...tall.map((p) => p.y))).toBeLessThan(Math.min(...low.map((p) => p.y)));
  });
});
