import { describe, expect, it } from 'vitest';
import { seatOpening, nearestWall, wallFromChain } from './walls';
import { daylightLux, sunKelvin, windowLights } from './sun';
import type { Item } from './types';

const room = wallFromChain('w', [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 500 }, { x: 0, y: 500 }, { x: 0, y: 0 }], true)!;
const base: Item = { id: 'win', kind: 'set', catalogId: 'generic.window.standard', pos: { x: 0, y: 0 }, rotationDeg: 0, sizeCm: { w: 120, d: 15 } };
const win = { ...base, ...seatOpening(base, nearestWall({ x: 300, y: 0 }, [room], 50)!, 120) } as Item;

describe('daylight', () => {
  it('sun from outside the top wall throws a patch into the room', () => {
    const [wl] = windowLights([room, win], { on: true, azimuthDeg: 0, elevationDeg: 30 });
    expect(wl!.patch).toBeDefined();
    expect(wl!.inward.y).toBeCloseTo(1); // into the room is down the plan
    expect(Math.max(...wl!.patch!.map((p) => p.y))).toBeGreaterThan(300);
    expect(daylightLux({ x: 300, y: 150 }, [wl!])).toBeGreaterThan(50000);
    expect(daylightLux({ x: 300, y: -100 }, [wl!])).toBe(0); // outside
  });

  it('sun on the far side or overcast: the window is a soft skylight', () => {
    const [back] = windowLights([room, win], { on: true, azimuthDeg: 180, elevationDeg: 30 });
    expect(back!.patch).toBeUndefined();
    expect(back!.source.hardness).not.toBe('hard');
    const [grey] = windowLights([room, win], { on: true, azimuthDeg: 0, elevationDeg: 30, overcast: true });
    expect(grey!.patch).toBeUndefined();
    expect(daylightLux({ x: 300, y: 150 }, [grey!])).toBeGreaterThan(100);
    expect(sunKelvin({ on: true, azimuthDeg: 0, elevationDeg: 5 })).toBeLessThan(3500);
  });
});
