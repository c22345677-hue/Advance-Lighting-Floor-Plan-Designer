import { describe, expect, it } from 'vitest';
import { beamAlpha } from './beams';
import type { Item } from '../model/types';

describe('beam strength', () => {
  const l = (light: Item['light']): Item => ({ id: 'l', kind: 'light', catalogId: 'aputure.nova-p300c', pos: { x: 0, y: 0 }, rotationDeg: 0, light });
  it('a tighter beam shows stronger, a wider one weaker', () => {
    expect(beamAlpha(l({ beamDeg: 40 }))).toBeGreaterThan(beamAlpha(l({})));
    expect(beamAlpha(l({ beamDeg: 120 }))).toBeLessThan(beamAlpha(l({})));
  });
});
