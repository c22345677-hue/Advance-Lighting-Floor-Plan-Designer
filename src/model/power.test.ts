import { describe, expect, it } from 'vitest';
import { autoAssign, circuitLoads, circuitName } from './power';
import type { Item } from './types';

const light = (id: string, catalogId: string, circuit?: string): Item => ({ id, kind: 'light', catalogId, pos: { x: 0, y: 0 }, rotationDeg: 0, light: { circuit } });

describe('power distribution', () => {
  it('adds up each circuit against its breaker', () => {
    const r = circuitLoads([light('a', 'generic.light.hmi-par', 'A'), light('b', 'generic.light.fresnel', 'A'), light('c', 'generic.light.tube')], 230, 16);
    expect(r.circuits).toHaveLength(1);
    expect(r.circuits[0]!.watts).toBe(1850);
    expect(r.circuits[0]!.status).toBe('ok'); // 8 A of 16
    expect(r.unassigned.map((l) => l.id)).toEqual(['c']);
    const over = circuitLoads([light('a', 'generic.light.hmi-par', 'A'), light('b', 'generic.light.hmi-par', 'A'), light('c', 'generic.light.hmi-par', 'A'), light('d', 'generic.light.hmi-par', 'A')], 230, 16);
    expect(over.circuits[0]!.status).toBe('over');
  });

  it('auto-assign keeps every circuit within the safe load', () => {
    const items = Array.from({ length: 6 }, (_, i) => light(`l${i}`, 'generic.light.hmi-par'));
    const plan = autoAssign(items, 120, 20); // 1920 W safe per circuit: one 1200 W light each
    const named = items.map((l) => ({ ...l, light: { circuit: plan.find((p) => p.id === l.id)!.circuit } }));
    const r = circuitLoads(named, 120, 20);
    expect(r.circuits.every((c) => c.status === 'ok')).toBe(true);
    expect(r.circuits).toHaveLength(6);
    expect(circuitName(0)).toBe('A');
    expect(circuitName(26)).toBe('AA');
  });
});
