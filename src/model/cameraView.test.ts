import { describe, expect, it } from 'vitest';
import { cameraFrame } from './cameraView';
import type { Item } from './types';

const cam: Item = { id: 'c', kind: 'camera', pos: { x: 0, y: 400 }, rotationDeg: 0, camera: { focalMm: 35 } };
const person: Item = { id: 'p', kind: 'person', catalogId: 'generic.person', pos: { x: 0, y: 0 }, rotationDeg: 0 };
const light = (id: string, x: number, y: number): Item => ({ id, kind: 'light', catalogId: 'generic.light.cob', pos: { x, y }, rotationDeg: 0, light: {} });

describe('camera view', () => {
  it('puts a person straight ahead in the middle of the frame', () => {
    const f = cameraFrame(cam, [cam, person]);
    const body = f.shapes.find((s) => s.id === 'p')!;
    const xs = body.points.map((q) => q[0]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0);
    expect(f.inShot).toEqual([]);
  });

  it('flags gear in shot, not gear behind or beside the camera', () => {
    const f = cameraFrame(cam, [cam, person, light('in', 50, -100), light('behind', 0, 600), light('side', 600, 300)]);
    expect(f.inShot.map((g) => g.id)).toEqual(['in']);
  });
});
