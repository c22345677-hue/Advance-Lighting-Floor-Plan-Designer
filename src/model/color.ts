// Light colour: what a fixture can do (fixed daylight or tungsten, bi-colour, full colour), what
// it's set to (a colour temperature, or hue/saturation/intensity), and the gels in front of it.
// The result is the colour the beam is drawn in: 5600 K reads white, tungsten orange, higher
// temperatures blue.
import { gelById } from '../library/gels';
import { libraryItem } from '../library/items';
import { itemFixture } from './gear';
import type { Item } from './types';

export type ColorKind = 'daylight' | 'tungsten' | 'bicolor' | 'rgb';

export const COLOR_KIND_LABEL: Record<ColorKind, string> = {
  daylight: 'Daylight (fixed 5600 K)',
  tungsten: 'Tungsten (fixed 3200 K)',
  bicolor: 'Bi-colour',
  rgb: 'Full colour (RGB)',
};

/** Colour temperature range of each kind, K. Fixed kinds have min = max. */
export const KIND_RANGE: Record<ColorKind, { min: number; max: number }> = {
  daylight: { min: 5600, max: 5600 },
  tungsten: { min: 3200, max: 3200 },
  bicolor: { min: 2700, max: 6500 },
  rgb: { min: 2000, max: 10000 },
};

const GENERIC_KIND: Record<string, ColorKind> = {
  'generic.light.cob': 'daylight',
  'generic.light.led-panel': 'bicolor',
  'generic.light.led-panel-2x1': 'bicolor',
  'generic.light.fresnel': 'tungsten',
  'generic.light.hmi-par': 'daylight',
  'generic.light.tube': 'rgb',
  'generic.light.mat': 'bicolor',
  'generic.light.practical': 'tungsten',
  'generic.light.balloon': 'bicolor',
  'generic.light.spacelight': 'tungsten',
};

/**
 * Best guess from the model name, as makers name them: "600d" daylight, "600x"/"Bi"/"60B"
 * bi-colour, "600c"/"R"/"Pavo…" full colour. The light panel lets this be corrected.
 */
export function guessColorKind(model: string, notes = ''): ColorKind {
  const text = `${model} ${notes}`;
  if (/\bRGB|full[- ]colou?r|\bHSI\b/i.test(text)) return 'rgb';
  if (/bi-?colou?r/i.test(text)) return 'bicolor';
  const m = model.trim();
  if (/^nova ii\b/i.test(m)) return 'rgb';
  if (/^(pavo|infinibar|infinimat|mc\b|mt pro|accent|tl\d|lc\d+r|alien|litolite|mixwand|mixpanel|pico|lumo)/i.test(m) || /\bpavo/i.test(m)) {
    return /\d+B\b/.test(m) ? 'bicolor' : 'rgb';
  }
  for (const t of m.split(/[\s-]+/).reverse()) {
    if (/^\d*[a-z]*\d+(x|bi|b)$/i.test(t) || /bi$/i.test(t) || /^\d+csa$/i.test(t)) return 'bicolor';
    if (/^\d*[a-z]*\d+c(r|l|p)?$/i.test(t) || /^[a-z]*\d+r$/i.test(t) || /^c\d/i.test(t)) return 'rgb';
    if (/^\d*[a-z]*\d+(d|dsa|w)$/i.test(t) || /^\d+sa$/i.test(t)) return 'daylight';
    if (/^\d*[a-z]*\d+y$/i.test(t)) return 'tungsten';
  }
  return 'daylight';
}

export function colorKindOf(item: Item): { kind: ColorKind; guessed: boolean } {
  if (item.light?.colorKind) return { kind: item.light.colorKind, guessed: false };
  const f = itemFixture(item);
  if (f) return { kind: guessColorKind(f.model, f.notes), guessed: true };
  return { kind: GENERIC_KIND[item.catalogId ?? ''] ?? (libraryItem(item.catalogId) ? 'daylight' : 'daylight'), guessed: true };
}

export type RGB = [number, number, number];

/** Blackbody colour of a temperature (Tanner Helland's fit), 0–255 per channel. */
export function kelvinToRgb(k: number): RGB {
  const t = Math.min(40000, Math.max(1000, k)) / 100;
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = t <= 66 ? 255 : clamp(329.698727446 * (t - 60) ** -0.1332047592);
  const g = t <= 66 ? clamp(99.4708025861 * Math.log(t) - 161.1195681661) : clamp(288.1221695283 * (t - 60) ** -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return [r, g, b];
}

/** How a temperature is shown on the plan: 5600 K is white (the fit's white point is ~6600 K). */
export const displayKelvin = (k: number): RGB => kelvinToRgb((k * 6600) / 5600);

/** Hue (0–360) and saturation (0–1) at full brightness. */
export function hsToRgb(h: number, s: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

const hexRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

export interface LightColor {
  rgb: RGB;
  /** How much light gets through the gels, 0–1 (drawn as a dimmer beam). */
  transmission: number;
  /** Colour temperature after correction gels, when the light is set by temperature. */
  kelvin?: number;
  /** Short description, e.g. "4300 K", "HSI 210° 80%", "3200 K + Full CTB". */
  label: string;
}

/** The colour a light puts out, after its setting and its gels. */
export function lightColor(item: Item): LightColor {
  const l = item.light ?? {};
  const { kind } = colorKindOf(item);
  const range = KIND_RANGE[kind];
  const gels = (l.gels ?? []).map(gelById).filter((g) => !!g);
  const hsi = kind === 'rgb' && l.colorMode === 'hsi';
  let kelvin: number | undefined;
  let rgb: RGB;
  if (hsi) {
    rgb = hsToRgb(l.hue ?? 0, (l.sat ?? 100) / 100);
  } else {
    const set = Math.min(range.max, Math.max(range.min, l.cct ?? (kind === 'tungsten' ? 3200 : kind === 'bicolor' ? 5600 : 5600)));
    // Correction gels move the temperature by their mired shift.
    let mired = 1e6 / set;
    for (const g of gels) if (g.mired) mired += g.mired;
    kelvin = Math.round(1e6 / Math.max(20, mired) / 50) * 50;
    rgb = displayKelvin(kelvin);
  }
  // Tint and colour gels filter the light.
  let transmission = 1;
  for (const g of gels) {
    if (g.mired && !hsi) continue;
    const f = hexRgb(g.color);
    rgb = [(rgb[0] * f[0]) / 255, (rgb[1] * f[1]) / 255, (rgb[2] * f[2]) / 255];
    transmission *= Math.max(f[0], f[1], f[2]) / 255 > 0 ? (0.299 * f[0] + 0.587 * f[1] + 0.114 * f[2]) / 255 : 0;
  }
  // Show the hue at full brightness; dimming goes into the beam's strength instead.
  const max = Math.max(...rgb, 1);
  rgb = rgb.map((v) => Math.round((v * 255) / max)) as RGB;
  const base = hsi ? `HSI ${Math.round(l.hue ?? 0)}° ${Math.round(l.sat ?? 100)}%` : `${kelvin} K`;
  const label = gels.length ? `${base} · ${gels.map((g) => g.name).join(' + ')}` : base;
  return { rgb, transmission, kelvin, label };
}

export const rgbCss = ([r, g, b]: RGB, a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;
