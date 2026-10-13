// Light meter: an estimate of the light falling on each person, from every light in the scene.
// Output comes from the fixture's power (or a typical value for stand-ins) spread over its beam,
// then distance (with rigging height), where in the beam the person stands, modifiers, gels,
// diffusion frames and anything blocking the light. These are planning numbers, not a meter.
import { fabricById } from '../library/fabrics';
import { libraryItem } from '../library/items';
import { lightColor } from './color';
import { itemFixture, itemModifiers } from './gear';
import { aimAt } from './geometry';
import { lightSource, occluders, shadowPolygon } from './shadows';
import type { Item, Vec2 } from './types';

export interface CameraSettings {
  iso: number;
  fps: number;
  shutterDeg: number;
}
export const DEFAULT_CAMERA: CameraSettings = { iso: 800, fps: 24, shutterDeg: 180 };

/** Face height used for distances, cm. */
const FACE_CM = 160;
/** Incident-meter calibration constant (lux). */
const METER_C = 250;

/** Typical draw of stand-in lights, W, and how they make light. */
const STAND_IN: Record<string, { w: number; tech: 'led' | 'tungsten' | 'hmi' }> = {
  'generic.light.cob': { w: 300, tech: 'led' },
  'generic.light.led-panel': { w: 100, tech: 'led' },
  'generic.light.led-panel-2x1': { w: 200, tech: 'led' },
  'generic.light.fresnel': { w: 650, tech: 'tungsten' },
  'generic.light.hmi-par': { w: 1200, tech: 'hmi' },
  'generic.light.tube': { w: 30, tech: 'led' },
  'generic.light.mat': { w: 200, tech: 'led' },
  'generic.light.practical': { w: 10, tech: 'led' },
  'generic.light.balloon': { w: 400, tech: 'led' },
  'generic.light.spacelight': { w: 1000, tech: 'tungsten' },
};
/** Lumens per watt out of the fixture. */
const EFFICACY = { led: 75, tungsten: 18, hmi: 85 };

/** How much light a fabric lets through (approximate). */
const FABRIC_PASS: Record<string, number> = {
  'full-grid': 0.35,
  'half-grid': 0.5,
  'quarter-grid': 0.65,
  'light-grid': 0.75,
  silk: 0.6,
  'magic-cloth': 0.5,
  '216': 0.35,
  '250': 0.5,
};

const MODIFIER_PASS: Record<string, number> = { softbox: 0.55, lantern: 0.5, dome: 0.6, diffusion: 0.7, grid: 0.85 };

/** Estimated output of a light, lumens (before modifiers and gels). */
export function lightLumens(light: Item): { lumens: number; estimated: boolean } {
  const f = itemFixture(light);
  if (f?.powerW) return { lumens: f.powerW * EFFICACY.led, estimated: false };
  const s = STAND_IN[light.catalogId ?? ''] ?? { w: 100, tech: 'led' as const };
  return { lumens: s.w * EFFICACY[s.tech], estimated: true };
}

const solidAngle = (beamDeg: number) => (beamDeg >= 360 ? 4 * Math.PI : 2 * Math.PI * (1 - Math.cos(((beamDeg / 2) * Math.PI) / 180)));

const inside = (p: Vec2, poly: Vec2[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

export interface Contribution {
  lightId: string;
  lux: number;
  blocked: boolean;
}

export interface Reading {
  personId: string;
  lux: number;
  footCandles: number;
  contributions: Contribution[];
  /** Strongest light's id and the key:fill ratio ("3:1"), when two or more lights reach them. */
  keyId?: string;
  ratio?: string;
  tStop: number;
  /** "T2.8", "T4 +⅓"… */
  tStopLabel: string;
}

/** Light falling on a point at face height, from one light. */
export function luxFrom(light: Item, at: Vec2, all: readonly Item[], exclude?: string): Contribution | null {
  const src = lightSource(light, all);
  if (!src) return null;
  const horiz = Math.hypot(at.x - light.pos.x, at.y - light.pos.y);
  if (horiz < 5) return null;
  const d = Math.hypot(horiz, src.heightCm - FACE_CM) / 100; // m
  const { lumens } = lightLumens(light);
  let pass = Math.min(1, Math.max(0, (light.light?.intensityPct ?? 100) / 100));
  for (const m of itemModifiers(light)) pass *= MODIFIER_PASS[m.type] ?? 1;
  pass *= lightColor(light).transmission;
  // Off the centre of the beam the light falls away (half at the edge), spill beyond it.
  const off = src.beamDeg >= 360 ? 0 : Math.abs(((aimAt(light.pos, at) - light.rotationDeg + 540) % 360) - 180);
  const half = src.beamDeg / 2;
  const inBeam = off <= half ? 1 - 0.5 * (off / half) ** 2 : 0.06;
  // Through a diffusion frame (only for what's past it).
  if (src.frameId && horiz > src.minDistCm) {
    const frame = all.find((i) => i.id === src.frameId);
    pass *= FABRIC_PASS[fabricById(frame?.grip?.fabric)?.id ?? ''] ?? 0.5;
  }
  let lux = ((lumens / solidAngle(Math.min(360, src.beamDeg))) * inBeam * pass) / (d * d);
  // Blocked by someone or something between: hard light is cut, soft light wraps around a bit.
  let blocked = false;
  const fromSrc = Math.hypot(at.x - src.pos.x, at.y - src.pos.y);
  for (const o of occluders(all)) {
    if (o.id === exclude || o.heightCm < FACE_CM * 0.9) continue; // lower than a face: doesn't block it
    const nearest = Math.min(...o.points.map((q) => Math.hypot(q.x - src.pos.x, q.y - src.pos.y)));
    if (nearest >= fromSrc) continue; // behind the person
    const poly = shadowPolygon(src.pos, src.heightCm, o, fromSrc * 2);
    if (poly && inside(at, poly)) {
      blocked = true;
      break;
    }
  }
  if (blocked) lux *= Math.max(0.05, 1 - src.darkness / 0.62);
  return { lightId: light.id, lux, blocked };
}

/** T-stop for an incident reading: N² = E·ISO·t / C. */
export function tStopFor(lux: number, cam: CameraSettings): number {
  const t = cam.shutterDeg / 360 / cam.fps;
  return Math.sqrt(Math.max(0, (lux * cam.iso * t) / METER_C));
}

const STOPS = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32];

/** Nearest full stop below, plus thirds: "T2.8 +⅔". */
export function tStopLabel(n: number): string {
  if (n < 0.7) return 'under T1';
  if (n > 36) return 'over T32';
  const thirds = Math.round(Math.log2(n * n) * 3);
  const full = Math.floor(thirds / 3);
  const rest = thirds - full * 3;
  const base = STOPS[Math.min(STOPS.length - 1, Math.max(0, full))] ?? 32;
  return `T${base}${rest === 1 ? ' +⅓' : rest === 2 ? ' +⅔' : ''}`;
}

/** Readings for every person in the scene. */
export function meterReadings(items: readonly Item[], cam: CameraSettings = DEFAULT_CAMERA): Reading[] {
  const lights = items.filter((i) => i.kind === 'light' && !i.hidden);
  return items
    .filter((i) => i.kind === 'person' && !i.hidden)
    .map((p) => {
      const contributions = lights.map((l) => luxFrom(l, p.pos, items, p.id)).filter((c): c is Contribution => !!c && c.lux > 0.5);
      contributions.sort((a, b) => b.lux - a.lux);
      const lux = contributions.reduce((n, c) => n + c.lux, 0);
      const key = contributions[0];
      const fill = lux - (key?.lux ?? 0);
      const ratio = key && fill > 0.5 ? `${Math.max(1, Math.round((lux / fill) * 2) / 2)}:1` : undefined;
      const n = tStopFor(lux, cam);
      return {
        personId: p.id,
        lux: Math.round(lux),
        footCandles: Math.round(lux / 10.764),
        contributions,
        keyId: key?.lightId,
        ratio,
        tStop: n,
        tStopLabel: tStopLabel(n),
      };
    });
}

/** Name for the lights behind a reading. */
export const lightName = (i: Item) => i.light?.unitId ?? libraryItem(i.catalogId)?.name ?? 'Light';
