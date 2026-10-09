import { describe, expect, it } from 'vitest';
import { standsFor } from './gear';
import { buildEquipment, equipmentCsv, equipmentWarnings, powerPlan, sceneCounts, totalWeight } from './equipment';
import { newProject, newScene, type Project, type SceneDoc } from './project';
import type { Item } from './types';

let n = 0;
const item = (extra: Partial<Item>): Item => ({ id: `i${n++}`, kind: 'prop', pos: { x: 0, y: 0 }, rotationDeg: 0, ...extra });
const light = (catalogId: string, light: Item['light'] = {}) => item({ kind: 'light', catalogId, light });
const scene = (name: string, items: Item[]): SceneDoc => ({ ...newScene(name), items });
const project = (...scenes: SceneDoc[]): Project => ({ ...newProject(), scenes });
const qty = (lines: ReturnType<typeof buildEquipment>, key: string) => lines.find((l) => l.key === key)?.qty ?? 0;

describe('scene counts', () => {
  it('counts fixtures, modifiers and stands, plus accessory rules', () => {
    const stand = standsFor(10)[0]!;
    const c = sceneCounts(
      scene('S', [
        light('aputure.ls-600d-pro', { modifierIds: ['aputure.light-dome-iii'], standId: stand.id }),
        light('aputure.ls-600d-pro'),
        light('generic.light.practical'),
      ]),
    );
    expect(c.get('fixture:aputure.ls-600d-pro')!.qty).toBe(2);
    expect(c.get('modifier:aputure.light-dome-iii')!.qty).toBe(1);
    expect(c.get(`stand:${stand.id}`)!.qty).toBe(1);
    expect(c.get('standin:generic.light.practical')!.qty).toBe(1);
    expect(c.get('stock:stinger-10m')!.qty).toBe(3); // every light
    expect(c.get('stock:light-stand')!.qty).toBe(1); // only the 600d without a chosen stand; practicals need none
    expect(c.get('stock:sandbag')!.qty).toBe(4); // 2 per light on a stand
  });

  it('adds stands and sandbags for flags and frames, and counts fabrics', () => {
    const c = sceneCounts(
      scene('S', [
        item({ kind: 'grip', catalogId: 'generic.grip.frame-8x8', grip: { fabric: 'full-grid' } }),
        item({ kind: 'grip', catalogId: 'generic.grip.flag' }),
        item({ kind: 'grip', catalogId: 'generic.grip.sandbag' }),
      ]),
    );
    expect(c.get('stock:high-roller')!.qty).toBe(2);
    expect(c.get('stock:c-stand')!.qty).toBe(1);
    expect(c.get('stock:sandbag')!.qty).toBe(4 + 1 + 1); // frame rule + flag rule + placed sandbag
    expect(c.get('fabric:generic.grip.frame-8x8:full-grid')!.info.name).toBe('8×8 Full grid cloth');
  });

  it('leaves rules out when they are off', () => {
    const c = sceneCounts(scene('S', [light('aputure.ls-600d-pro')]), false);
    expect(c.has('stock:stinger-10m')).toBe(false);
  });
});

describe('project list', () => {
  it('uses the most any one scene needs, not the sum', () => {
    const p = project(
      scene('A', [light('aputure.ls-600d-pro'), light('aputure.ls-600d-pro')]),
      scene('B', [light('aputure.ls-600d-pro')]),
    );
    const lines = buildEquipment(p);
    const l = lines.find((x) => x.key === 'fixture:aputure.ls-600d-pro')!;
    expect(l.qty).toBe(2);
    expect(l.scenes).toEqual([
      { name: 'A', qty: 2 },
      { name: 'B', qty: 1 },
    ]);
    expect(qty(buildEquipment(p, [p.scenes[1]!.id]), 'fixture:aputure.ls-600d-pro')).toBe(1);
  });

  it('adds kits and hand-added lines, and applies overrides', () => {
    const p = project(scene('A', [light('aputure.ls-600d-pro')]));
    p.equipment = {
      kits: { small: 1 },
      manual: [{ id: 'm1', dept: 'expendables', name: 'Clothespins (bag)', qty: 3 }],
      overrides: { 'fixture:aputure.ls-600d-pro': { qty: 4, owned: true } },
    };
    const lines = buildEquipment(p);
    expect(qty(lines, 'stock:sandbag')).toBe(2 + 10); // rule + Small kit
    expect(qty(lines, 'manual:m1')).toBe(3);
    const f = lines.find((l) => l.key === 'fixture:aputure.ls-600d-pro')!;
    expect(f).toMatchObject({ qty: 4, edited: true, owned: true });
    // Owned lines drop off the rental export.
    expect(equipmentCsv(lines)).not.toContain('LS 600d Pro');
    expect(equipmentCsv(lines, { rentalOnly: false })).toContain('LS 600d Pro');
  });

  it('warns about stand-ins and gear-list shortfalls', () => {
    const p = project(scene('A', [light('aputure.ls-600d-pro'), light('aputure.ls-600d-pro'), light('generic.light.cob')]));
    const lines = buildEquipment(p);
    const list = { id: 'g', name: 'Truck', entries: [{ kind: 'fixture' as const, id: 'aputure.ls-600d-pro', qty: 1 }] };
    const w = equipmentWarnings(p, lines, list);
    expect(w.some((x) => x.includes('stand-in'))).toBe(true);
    expect(w.some((x) => x.includes('need 2, gear list has 1'))).toBe(true);
  });

  it('totals known weight', () => {
    const p = project(scene('A', [light('aputure.ls-600d-pro')]));
    const t = totalWeight(buildEquipment(p, undefined));
    expect(t.kg).toBeGreaterThan(4); // head + power supply
    expect(t.unknown).toBeGreaterThan(0); // stinger, stand, sandbags
  });
});

describe('power', () => {
  it('finds the peak scene and sizes a generator with headroom', () => {
    const p = project(scene('A', [light('aputure.ls-600d-pro')]), scene('B', [light('aputure.ls-600d-pro'), light('aputure.ls-600d-pro')]));
    const pw = powerPlan(p, 230);
    expect(pw).toMatchObject({ peakW: 1440, peakScene: 'B' });
    // 1440 W × 1.25 / 0.8 = 2.25 kVA → 3 kVA
    expect(pw.generatorKva).toBe(3);
  });
});
