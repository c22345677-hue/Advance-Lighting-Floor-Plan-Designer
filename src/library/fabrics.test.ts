import { expect, it } from 'vitest';
import { FABRIC_FILL, FABRICS, fabricById, takesFabric } from './fabrics';

it('draws each fabric family the agreed way', () => {
  expect(FABRIC_FILL[fabricById('solid')!.kind]).toEqual({ fill: '#0d0d0d', opacity: 1 });
  expect(FABRIC_FILL[fabricById('full-grid')!.kind].opacity).toBeLessThan(1);
  for (const f of FABRICS.filter((x) => x.kind === 'bounce')) expect(FABRIC_FILL[f.kind]).toEqual({ fill: '#ffffff', opacity: 1 });
  expect(fabricById('green-screen')!.kind).toBe('green');
  expect(fabricById('blue-screen')!.kind).toBe('blue');
  expect(new Set(FABRICS.map((f) => f.id)).size).toBe(FABRICS.length);
});

it('only frames take a fabric', () => {
  expect(takesFabric('generic.grip.frame-6x6')).toBe(true);
  expect(takesFabric('generic.grip.flag')).toBe(false);
});
