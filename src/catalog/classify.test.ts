import { describe, expect, it } from 'vitest';
import { bestBatteryOutputPct, isFullyWeatherSealed, isWeatherSealed, parseIp, riggingPicks, sizeClass } from './classify';
import type { Fixture } from './schema';

const fx = (id: string, powerW: number | null, weightKg: number | null, extra: Partial<Fixture> = {}): Fixture => ({
  id,
  brand: 'Test',
  model: id,
  family: 'cob',
  powerW,
  weightKg,
  psu: { external: true, weightKg: null, ipRating: null },
  sizeCm: null,
  headCableM: null,
  ipRating: null,
  batteries: [],
  sources: [],
  ...extra,
});

describe('sizeClass', () => {
  it.each<[number | null, number | null, string | null]>([
    [20, 2, 'tiny'],
    [100, 0.5, 'tiny'], // light enough to count as tiny
    [100, 0.9, 'small'],
    [40, null, 'small'],
    [300, 0.8, 'small'], // under 1 kg pulls it down to small
    [300, 3, 'medium'],
    [600, 6, 'large'],
    [2400, 20, 'large'],
    [2500, 30, 'huge'],
    [null, 1, null],
  ])('%s W, %s kg → %s', (w, kg, expected) => {
    expect(sizeClass({ powerW: w, weightKg: kg })).toBe(expected);
  });
});

describe('weather sealing', () => {
  it('parses IP codes', () => {
    expect(parseIp('IP65')).toEqual({ solids: 6, water: 5 });
    expect(parseIp('ipx4')).toEqual({ solids: 0, water: 4 });
    expect(parseIp('none')).toBeNull();
  });

  it('needs splash protection (x4+) to count as sealed', () => {
    expect(isWeatherSealed('IP54')).toBe(true);
    expect(isWeatherSealed('IP20')).toBe(false);
    expect(isWeatherSealed(null)).toBe(false);
  });

  it('checks the power supply too when it is external', () => {
    expect(isFullyWeatherSealed(fx('a', 100, 1, { ipRating: 'IP65' }))).toBe(false);
    expect(
      isFullyWeatherSealed(fx('b', 100, 1, { ipRating: 'IP65', psu: { external: true, weightKg: 1, ipRating: 'IP54' } })),
    ).toBe(true);
    expect(
      isFullyWeatherSealed(fx('c', 100, 1, { ipRating: 'IP65', psu: { external: false, weightKg: null, ipRating: null } })),
    ).toBe(true);
  });
});

it('riggingPicks takes the lightest per class and skips unknown weights', () => {
  const list = [fx('m1', 300, 4), fx('m2', 300, 2.5), fx('m3', 400, 3), fx('m4', 500, 5), fx('m5', 300, null), fx('l1', 1200, 12)];
  expect([...riggingPicks(list, 2)].sort()).toEqual(['l1', 'm2', 'm3']);
});

it('bestBatteryOutputPct', () => {
  expect(bestBatteryOutputPct(fx('a', 100, 1))).toBeNull();
  expect(
    bestBatteryOutputPct(
      fx('b', 100, 1, {
        batteries: [
          { type: 'V-mount 14.4 V', maxOutputPct: 50 },
          { type: 'Dual V-mount 28.8 V', maxOutputPct: 100 },
        ],
      }),
    ),
  ).toBe(100);
});
