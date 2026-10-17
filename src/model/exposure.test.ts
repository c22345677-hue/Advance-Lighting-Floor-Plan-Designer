import { describe, expect, it } from 'vitest';
import { meterReadings, tStopFor, tStopLabel } from './exposure';
import { attachmentFor, LIGHT_METER_ID } from './attach';
import type { Item } from './types';

const person = (id: string, x: number, y: number): Item => ({ id, kind: 'person', catalogId: 'generic.person', pos: { x, y }, rotationDeg: 0 });
const meter = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind: 'prop', catalogId: LIGHT_METER_ID, pos: { x, y }, rotationDeg: 0, ...extra });
const light = (id: string, catalogId: string, x: number, y: number, rot: number, extra: Item['light'] = {}): Item => ({
  id,
  kind: 'light',
  catalogId,
  pos: { x, y },
  rotationDeg: rot,
  light: { throwCm: 800, ...extra },
});

describe('light meter', () => {
  it('more light when closer, less off the beam, none from behind', () => {
    const near = meterReadings([light('a', 'generic.light.cob', 0, 200, 0), meter('p', 0, 0)])[0]!;
    const far = meterReadings([light('a', 'generic.light.cob', 0, 500, 0), meter('p', 0, 0)])[0]!;
    const away = meterReadings([light('a', 'generic.light.cob', 0, 200, 180), meter('p', 0, 0)])[0]!;
    expect(near.lux).toBeGreaterThan(far.lux * 2);
    expect(away.lux).toBeLessThan(near.lux / 5);
  });

  it('through a big diffusion frame the light falls off more gently than inverse square', () => {
    const frame = (y: number): Item => ({ id: 'F', kind: 'grip', catalogId: 'generic.grip.frame-6x6', pos: { x: 0, y }, rotationDeg: 0, grip: { fabric: '216' } });
    // Same lamp-to-frame distance (fills the frame), frame 1.5 m vs 3 m from the subject.
    const lux = (fy: number) => meterReadings([light('a', 'generic.light.hmi-par', 0, fy + 450, 0, { beamDeg: 40, throwCm: 2000 }), frame(fy), meter('p', 0, 0)])[0]!.lux;
    const near = lux(150);
    const far = lux(300);
    const inverseSquare = (300 ** 2 + 40 ** 2) / (150 ** 2 + 40 ** 2);
    expect(near).toBeGreaterThan(far);
    expect(near / far).toBeLessThan(inverseSquare);
  });

  it('a softbox and gels cut the light; intensity dims it', () => {
    const bare = meterReadings([light('a', 'generic.light.cob', 0, 200, 0), meter('p', 0, 0)])[0]!.lux;
    const gel = meterReadings([light('a', 'generic.light.cob', 0, 200, 0, { gels: ['rosco-3202'] }), meter('p', 0, 0)])[0]!.lux;
    const dim = meterReadings([light('a', 'generic.light.cob', 0, 200, 0, { intensityPct: 50 }), meter('p', 0, 0)])[0]!.lux;
    expect(gel).toBeLessThan(bare * 0.5);
    expect(Math.abs(dim - bare / 2)).toBeLessThanOrEqual(1);
  });

  it('someone standing in between blocks a hard light', () => {
    const l = light('a', 'generic.light.fresnel', 0, 300, 0);
    const open = meterReadings([l, meter('p', 0, 0)]).find((r) => r.meterId === 'p')!.lux;
    const blocked = meterReadings([l, meter('p', 0, 0), person('q', 0, 150)]).find((r) => r.meterId === 'p')!.lux;
    expect(blocked).toBeLessThan(open * 0.3);
  });

  it('readings come from light meters only; the person holding one does not shade it', () => {
    const l = light('a', 'generic.light.fresnel', 0, 300, 0);
    expect(meterReadings([l, person('q', 0, 0)])).toEqual([]);
    const holder = person('q', 0, 30);
    const m = meter('m', 0, 0);
    const held = meterReadings([l, holder, { ...m, attachedTo: attachmentFor(m, holder) }])[0]!;
    const free = meterReadings([l, m])[0]!;
    expect(held.lux).toBe(free.lux);
  });

  it('key:fill ratio and T-stops', () => {
    const r = meterReadings([light('k', 'generic.light.cob', 0, 200, 0), light('f', 'generic.light.led-panel', 200, 0, 270), meter('p', 0, 0)])[0]!;
    expect(r.keyId).toBe('k');
    expect(r.ratio).toMatch(/^\d+(\.5)?:1$/);
    // 1000 lux (about 93 fc) at ISO 800, 24 fps, 180°: about T8.
    expect(tStopLabel(tStopFor(1000, { iso: 800, fps: 24, shutterDeg: 180 }))).toMatch(/^T8/);
    expect(tStopLabel(2.8)).toBe('T2.8');
    expect(tStopLabel(3.2)).toBe('T2.8 +⅓');
  });
});
