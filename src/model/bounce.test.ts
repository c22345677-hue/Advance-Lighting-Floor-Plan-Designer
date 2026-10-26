import { describe, expect, it } from 'vitest';
import { bounceLights, meterReadings } from './exposure';
import { lightSource } from './shadows';
import type { Item } from './types';

// A hard light 3 m south of a polyboard, aimed at it (north); the board faces it.
const lamp: Item = { id: 'L', kind: 'light', catalogId: 'generic.light.fresnel', pos: { x: 0, y: 300 }, rotationDeg: 0, light: { spotPct: 100 } };
const board: Item = { id: 'B', kind: 'grip', catalogId: 'generic.grip.polyboard', pos: { x: 0, y: 0 }, rotationDeg: 180 };

describe('bounce boards', () => {
  it('give back the light that hits them as a soft source, towards the lit side', () => {
    const [b] = bounceLights([lamp, board]);
    expect(b).toBeDefined();
    expect(b!.light!.bounce!.lumens).toBeGreaterThan(20);
    // Shines back south, toward the lamp's side, from just in front of the board.
    expect(b!.pos.y).toBeGreaterThan(0);
    expect(Math.round(b!.rotationDeg)).toBe(180);
    // Soft: as big as the board, though the lamp is a hard spot.
    expect(lightSource(b!, [lamp, board, b!])!.sizeCm).toBeGreaterThanOrEqual(100);
    expect(lightSource(lamp, [lamp, board])!.sizeCm).toBeLessThan(30);
  });

  it('nothing comes off a board the light misses or hits edge on', () => {
    expect(bounceLights([lamp, { ...board, pos: { x: 600, y: 0 } }])).toHaveLength(0);
    expect(bounceLights([lamp, { ...board, rotationDeg: 90 }])).toHaveLength(0);
  });

  it('a meter in front of the board reads the bounce', () => {
    const meter: Item = { id: 'M', kind: 'prop', catalogId: 'generic.camera.light-meter', pos: { x: 150, y: 120 }, rotationDeg: 0 };
    const r = meterReadings([lamp, board, meter])[0]!;
    expect(r.contributions.some((c) => c.lightId === 'B~bounce')).toBe(true);
  });
});
