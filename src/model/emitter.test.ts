import { describe, expect, it } from 'vitest';
import { beamApex, beamRange, canSkirt, lightBeamDeg, lightFace, skirtPass, zoomRange } from './emitter';
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

describe('lantern and balloon skirts', () => {
  const lantern = (skirt?: boolean[]): Item => ({ id: 'l', kind: 'light', catalogId: 'generic.light.spacelight', pos: { x: 0, y: 0 }, rotationDeg: 0, light: { skirt, heightCm: 400 } });
  it('lights all round with the skirt up', () => {
    expect(lightBeamDeg(lantern())).toBe(360);
    expect(skirtPass(lantern(), { x: 0, y: -500 })).toBe(1);
  });
  it('a lowered quarter keeps only the pool below on its side', () => {
    const l = lantern([true, false, false, false]);
    expect(skirtPass(l, { x: 0, y: -500 })).toBeLessThan(0.1); // in front, far
    expect(skirtPass(l, { x: 0, y: -50 })).toBeGreaterThan(0.9); // in front, under it
    expect(skirtPass(l, { x: 500, y: 0 })).toBe(1); // right side still open
  });
  it('only lanterns and balloons take a skirt', () => {
    expect(canSkirt(lantern())).toBe(true);
    expect(canSkirt({ ...lantern(), catalogId: 'generic.light.balloon' })).toBe(true);
    expect(canSkirt({ ...lantern(), catalogId: 'generic.light.cob' })).toBe(false);
  });
});

describe('beam angle range', () => {
  const l = (catalogId: string, light: Item['light'] = {}): Item => ({ id: 'l', kind: 'light', catalogId, pos: { x: 0, y: 0 }, rotationDeg: 0, light });
  it('a focusing light slides between spot and flood; a panel between barn-doored and wide', () => {
    expect(beamRange(l('generic.light.hmi-par'))).toEqual([12, 55]);
    const [lo, hi] = beamRange(l('aputure.nova-p300c'))!;
    expect(lo).toBeLessThan(110);
    expect(hi).toBeGreaterThanOrEqual(110);
  });
  it('lights that send light all round have no slider', () => {
    expect(beamRange(l('generic.light.balloon'))).toBeNull();
  });
});
