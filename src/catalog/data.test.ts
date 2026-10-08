import { describe, expect, it } from 'vitest';
import { parseIp, riggingPicks, sizeClass } from './classify';
import { FIXTURES, MODIFIERS, STANDS } from './data';
import { modifiersFor, rigWeightKg } from './modifiers';

const pos = (n: number | null) => n === null || (Number.isFinite(n) && n > 0);

describe('fixture data', () => {
  it('has unique ids and a source for every record', () => {
    const ids = FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FIXTURES) expect(f.sources.length, f.id).toBeGreaterThan(0);
  });

  it('has plausible numbers', () => {
    for (const f of FIXTURES) {
      expect(pos(f.powerW), `${f.id} powerW`).toBe(true);
      expect(pos(f.weightKg), `${f.id} weightKg`).toBe(true);
      expect(f.weightKg === null || f.weightKg < 200, `${f.id} weight`).toBe(true);
      expect(pos(f.psu.weightKg), `${f.id} psu`).toBe(true);
      expect(pos(f.headCableM), `${f.id} cable`).toBe(true);
      for (const v of Object.values(f.sizeCm ?? {})) expect(pos(v), `${f.id} size`).toBe(true);
      if (f.ipRating) expect(parseIp(f.ipRating), `${f.id} ip`).not.toBeNull();
      if (f.psu.ipRating) expect(parseIp(f.psu.ipRating), `${f.id} psu ip`).not.toBeNull();
      for (const b of f.batteries ?? []) {
        expect(b.maxOutputPct === null || (b.maxOutputPct > 0 && b.maxOutputPct <= 100), f.id).toBe(true);
      }
    }
  });

  it('gives most fixtures a power figure and a size class', () => {
    const classed = FIXTURES.filter((f) => sizeClass(f) !== null).length;
    expect(classed / FIXTURES.length).toBeGreaterThan(0.9);
    expect(riggingPicks(FIXTURES).size).toBeGreaterThan(5);
  });
});

describe('modifier data', () => {
  const fixtureIds = new Set(FIXTURES.map((f) => f.id));

  it('has unique ids, valid fixture links, and weights', () => {
    const ids = MODIFIERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODIFIERS) {
      expect(m.mounts.length + m.fitsFixtureIds.length, `${m.id} fits nothing`).toBeGreaterThan(0);
      for (const id of m.fitsFixtureIds) expect(fixtureIds.has(id), `${m.id} → ${id}`).toBe(true);
      expect(pos(m.weightKg), m.id).toBe(true);
    }
  });

  it('matches modifiers to a light by model or mount, and adds up rig weight', () => {
    const evoke = FIXTURES.find((f) => f.id === 'nanlux.evoke-1200b')!;
    const fits = modifiersFor(evoke, MODIFIERS).map((m) => m.id);
    expect(fits).toContain('nanlux.fl-35yk-fresnel-lens-11-45');
    expect(fits).toContain('nanlux.rf-nl-pb-nl70-parallel-beam-reflector');
    expect(fits).not.toContain('nanlux.fl-45e-motorized-fresnel-16-50'); // 5000B only
    const fresnel = MODIFIERS.find((m) => m.id === 'nanlux.fl-35yk-fresnel-lens-11-45')!;
    expect(rigWeightKg(evoke, [fresnel])).toBeCloseTo(7.75 + 10.84);
  });
});

describe('stand data', () => {
  it('has unique ids, sources and sane heights and loads', () => {
    const ids = STANDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of STANDS) {
      expect(s.sources.length, s.id).toBeGreaterThan(0);
      expect(s.maxHeightCm, `${s.id} max height`).not.toBeNull();
      if (s.minHeightCm !== null && s.maxHeightCm !== null) {
        expect(s.minHeightCm, `${s.id} min <= max`).toBeLessThanOrEqual(s.maxHeightCm);
      }
      expect(pos(s.weightKg) && pos(s.loadCapacityKg), s.id).toBe(true);
      expect(s.loadCapacityKg === null || s.loadCapacityKg <= 250, `${s.id} load`).toBe(true);
    }
  });
});
