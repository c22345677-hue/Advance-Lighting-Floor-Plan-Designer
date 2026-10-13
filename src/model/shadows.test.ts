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
    expect(balloon.darkness).toBeLessThan(fresnel.darkness);
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
    const hard = lightSource(light('generic.light.fresnel'), [person])!;
    const diffused = lightSource(light('generic.light.fresnel'), [frame, person])!;
    expect(diffused.frameId).toBe('F');
    expect(diffused.darkness).toBeLessThan(hard.darkness);
    expect(diffused.apparentDeg!).toBeGreaterThan(hard.apparentDeg!);
  });

  it('the lit patch on the frame grows as the lamp backs off, up to the frame', () => {
    const frame: Item = { id: 'F', kind: 'grip', catalogId: 'generic.grip.frame-6x6', pos: { x: 0, y: 150 }, rotationDeg: 0, grip: { fabric: '216' } };
    const at = (y: number) => lightSource(light('generic.light.fresnel', { pos: { x: 0, y }, light: { throwCm: 900, beamDeg: 40 } }), [frame, person])!;
    const close = at(180);
    const back = at(400);
    const far = at(900);
    expect(back.litCm!).toBeGreaterThan(close.litCm!);
    expect(far.litCm!).toBe(180); // filled the 6×6
    expect(back.sizeCm).toBeGreaterThan(close.sizeCm);
  });

  it('a frame close to the subject is softer than the same frame far from it', () => {
    const lamp = (y: number) => light('generic.light.fresnel', { pos: { x: 0, y }, light: { throwCm: 2000, beamDeg: 60 } });
    const frameAt = (y: number): Item => ({ id: 'F', kind: 'grip', catalogId: 'generic.grip.frame-6x6', pos: { x: 0, y }, rotationDeg: 0, grip: { fabric: 'full-grid' } });
    const near = lightSource(lamp(400), [frameAt(80), person])!; // frame 80 cm from the subject
    const far = lightSource(lamp(1200), [frameAt(900), person])!; // same lit size, 9 m away
    expect(near.apparentDeg!).toBeGreaterThan(far.apparentDeg!);
    expect(near.darkness).toBeLessThan(far.darkness);
    expect(near.hardness).toBe('soft');
    expect(far.hardness).not.toBe('soft');
    // The shadow on the subject's far side follows: fainter close to a big source.
    const total = (items: Item[]) => sceneShadows(items).shadows.reduce((n, s) => n + s.opacity, 0);
    expect(total([lamp(400), frameAt(80), person])).toBeLessThan(total([lamp(1200), frameAt(900), person]));
  });

  it('light diffusion lets some of the hard shadow through, heavy diffusion does not', () => {
    const frame = (fabric: string): Item => ({ id: 'F', kind: 'grip', catalogId: 'generic.grip.frame-6x6', pos: { x: 0, y: 150 }, rotationDeg: 0, grip: { fabric } });
    const lamp = light('generic.light.fresnel', { pos: { x: 0, y: 450 } });
    const heavy = sceneShadows([lamp, frame('216'), person]).shadows;
    const lightGrid = sceneShadows([lamp, frame('light-grid'), person]).shadows;
    const samples = (size: number) => (size < 20 ? 1 : Math.min(9, Math.ceil(size / 18)));
    const lgSize = lightSource(lamp, [frame('light-grid'), person])!.sizeCm;
    const heavySize = lightSource(lamp, [frame('216'), person])!.sizeCm;
    expect(lgSize).toBeLessThan(heavySize);
    expect(heavy.length).toBe(samples(heavySize));
    expect(lightGrid.length).toBe(samples(lgSize) + 1); // plus the hot spot's hard shadow
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
