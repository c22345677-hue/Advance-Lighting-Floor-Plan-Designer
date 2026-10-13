import { describe, expect, it } from 'vitest';
import { displayKelvin, guessColorKind, lightColor } from './color';
import type { Item } from './types';

const light = (catalogId: string, l: Item['light'] = {}): Item => ({ id: 'l', kind: 'light', catalogId, pos: { x: 0, y: 0 }, rotationDeg: 0, light: l });

describe('light colour', () => {
  it('guesses what a fixture can do from its model name', () => {
    expect(guessColorKind('LS 600d Pro')).toBe('daylight');
    expect(guessColorKind('LS 600x Pro')).toBe('bicolor');
    expect(guessColorKind('LS 600c Pro II')).toBe('rgb');
    expect(guessColorKind('Forza 60B II')).toBe('bicolor');
    expect(guessColorKind('PavoTube II 30X')).toBe('rgb');
    expect(guessColorKind('SL60W')).toBe('daylight');
    expect(guessColorKind('LA600R')).toBe('rgb');
    expect(guessColorKind('ML100Bi')).toBe('bicolor');
    expect(guessColorKind('C30Bi')).toBe('bicolor');
  });

  it('5600 K is white, tungsten orange, higher blue', () => {
    const [r, g, b] = displayKelvin(5600);
    expect(Math.min(r, g, b)).toBeGreaterThan(245);
    const t = displayKelvin(3200);
    expect(t[0]).toBeGreaterThan(t[2] + 80);
    const blue = displayKelvin(9000);
    expect(blue[2]).toBeGreaterThan(blue[0]);
  });

  it('CTB on tungsten brings it near daylight; colour gels tint and dim', () => {
    const c = lightColor(light('generic.light.fresnel', { gels: ['rosco-3202'] }));
    expect(c.kelvin).toBeGreaterThan(5000);
    expect(c.kelvin).toBeLessThan(6000);
    const red = lightColor(light('generic.light.cob', { gels: ['rosco-r27'] }));
    expect(red.rgb[0]).toBe(255);
    expect(red.rgb[2]).toBeLessThan(80);
    expect(red.transmission).toBeLessThan(0.5);
  });

  it('full colour lights can be set by hue and saturation', () => {
    const c = lightColor(light('generic.light.tube', { colorMode: 'hsi', hue: 240, sat: 100 }));
    expect(c.rgb).toEqual([0, 0, 255]);
    expect(c.label).toMatch(/HSI 240/);
  });
});
