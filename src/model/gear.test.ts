import { describe, expect, it } from 'vitest';
import { filterFixtures, itemLook, itemRigWeightKg, nextUnitId, powerTotals, searchFixtures, standCheck, standsFor } from './gear';
import type { Item } from './types';

const light = (catalogId: string, extra: Partial<Item['light']> = {}): Item => ({
  id: catalogId,
  kind: 'light',
  catalogId,
  pos: { x: 0, y: 0 },
  rotationDeg: 0,
  light: { ...extra },
});

describe('gear', () => {
  it('adds modifier weight to head weight', () => {
    expect(itemRigWeightKg(light('aputure.ls-600d-pro'))).toBe(4.64);
    expect(itemRigWeightKg(light('aputure.ls-600d-pro', { modifierIds: ['aputure.light-dome-iii'] }))).toBe(6.88);
    expect(itemRigWeightKg(light('generic.light.cob'))).toBeNull();
  });

  it('totals power and counts lights without a known draw', () => {
    const t = powerTotals([light('aputure.ls-600d-pro'), light('aputure.ls-600d-pro'), light('generic.light.cob')], 230);
    expect(t).toEqual({ watts: 1440, amps: 6.26, unknown: 1 });
  });

  it('only offers stands that carry the load, lightest first', () => {
    const list = standsFor(10);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => (s.loadCapacityKg ?? 0) >= 10)).toBe(true);
    const w = list.map((s) => s.weightKg ?? Infinity);
    expect(w).toEqual([...w].sort((a, b) => a - b));
  });

  it('flags a stand that is too weak', () => {
    const weak = standsFor(null).find((s) => (s.loadCapacityKg ?? 99) < 4)!;
    expect(standCheck(light('aputure.ls-600d-pro', { standId: weak.id }))).toBe('over');
    const strong = standsFor(20)[0]!;
    expect(standCheck(light('aputure.ls-600d-pro', { standId: strong.id }))).toBe('ok');
    expect(standCheck(light('aputure.ls-600d-pro'))).toBeNull();
  });

  it('searches by every word', () => {
    expect(searchFixtures('600d pro').map((f) => f.id)).toContain('aputure.ls-600d-pro');
    expect(searchFixtures('')).toEqual([]);
  });

  it('filters by brand, size class and tags', () => {
    expect(filterFixtures({ brand: 'Nanlux' }).every((f) => f.brand === 'Nanlux')).toBe(true);
    const sealed = filterFixtures({ sealed: true });
    expect(sealed.length).toBeGreaterThan(0);
    expect(sealed.every((f) => /IP[\dX][4-9]/i.test(f.ipRating ?? ''))).toBe(true);
    expect(filterFixtures({ rigging: true }).length).toBe(15);
  });

  it('draws catalogue lights at their real size', () => {
    const look = itemLook(light('aputure.ls-600d-pro'));
    expect(look.shape).toBe('cob');
    expect(look.d).toBeGreaterThan(look.w);
  });

  it('numbers lights after the highest one', () => {
    expect(nextUnitId([light('a', { unitId: 'L2' }), light('b', { unitId: 'L7' })])).toBe('L8');
    expect(nextUnitId([])).toBe('L1');
  });
});
