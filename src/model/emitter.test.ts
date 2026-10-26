import { describe, expect, it } from 'vitest';
import { beamApex, lightBeamDeg, lightFace, zoomRange } from './emitter';
import type { Item } from './types';

const light = (catalogId: string, light: Item['light'] = {}): Item => ({ id: 'l', kind: 'light', catalogId, pos: { x: 0, y: 0 }, rotationDeg: 0, light });

describe('light beams', () => {
  it('a mat shines soft and wide from its whole face', () => {
    const mat = light('aputure.infinimat-2x4');
    expect(lightBeamDeg(mat)).toBeGreaterThanOrEqual(120);
    expect(lightFace(mat).width).toBeGreaterThan(100);
    // The beam spreads from behind the face, so its edges leave the face's ends.
    expect(beamApex(mat).y).toBeGreaterThan(0);
  });

  it('an HMI PAR starts at full flood, spots in, and shines from its lens', () => {
    const par = light('generic.light.hmi-par');
    const [flood, spot] = zoomRange(par)!;
    expect(lightBeamDeg(par)).toBe(flood);
    expect(lightBeamDeg(light('generic.light.hmi-par', { spotPct: 100 }))).toBe(spot);
    expect(lightBeamDeg(light('generic.light.hmi-par', { spotPct: 50 }))).toBeCloseTo((flood + spot) / 2);
    expect(lightFace(par).width).toBeGreaterThan(30);
  });

  it('a fresnel lens on a COB takes its range from the lens', () => {
    expect(zoomRange(light('aputure.ls-600d-pro', { modifierIds: ['nanlux.fl-22e-motorized-fresnel-15-50'] }))).toEqual([50, 15]);
    expect(zoomRange(light('aputure.ls-600d-pro'))).toBeNull();
  });

  it('a lantern sends light all round; a bare COB is a point', () => {
    expect(lightBeamDeg(light('aputure.ls-600d-pro', { modifierIds: ['aputure.lantern-65-cm'] }))).toBe(360);
    expect(lightFace(light('aputure.ls-600d-pro')).width).toBeLessThan(10);
  });
});
