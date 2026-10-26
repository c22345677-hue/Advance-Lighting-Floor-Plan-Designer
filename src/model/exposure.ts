// Light meter: an estimate of the light falling on each person, from every light in the scene.
// Output comes from the fixture's power (or a typical value for stand-ins) spread over its beam,
// then distance (with rigging height), where in the beam the person stands, modifiers, gels,
// diffusion frames and anything blocking the light. These are planning numbers, not a meter.
import { fabricById } from '../library/fabrics';
import { libraryItem } from '../library/items';
import { lightColor } from './color';
import { itemFixture, itemModifiers } from './gear';
import { lightStyle, skirtPass } from './emitter';
import { aimAt } from './geometry';
import { lightSource, occluders, pointInPolygon, shadowDarkness, shadowPolygon } from './shadows';
import { daylightLux, windowLights, type Sun } from './sun';
import { assemblyOf, isMeter } from './attach';
import type { Item, MeterSettings, Vec2 } from './types';

/** Contribution id for daylight through windows. */
export const DAYLIGHT_ID = 'daylight';

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
  'generic.light.cob-softbox': { w: 600, tech: 'led' },
  'generic.light.cob-stripbox': { w: 300, tech: 'led' },
  'generic.light.cob-lantern': { w: 300, tech: 'led' },
  'generic.light.led-panel-4x1': { w: 250, tech: 'led' },
  'generic.light.soft-panel-large': { w: 450, tech: 'led' },
  'generic.light.mat-1x1': { w: 50, tech: 'led' },
  'generic.light.tube-60': { w: 15, tech: 'led' },
  'generic.light.fresnel-2k': { w: 2000, tech: 'tungsten' },
  'generic.light.hmi-fresnel': { w: 4000, tech: 'hmi' },
  'generic.light.leko': { w: 750, tech: 'tungsten' },
  'generic.light.ring-light': { w: 60, tech: 'led' },
  'generic.light.pocket': { w: 10, tech: 'led' },
  'generic.light.air-panel': { w: 800, tech: 'led' },
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
  /** The light meter it was read on, and its settings. */
  meterId: string;
  config: MeterConfig;
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

/** Light falling on a point at face height, from one light (`exclude`: things that can't block it, e.g. the person holding the meter). */
export function luxFrom(light: Item, at: Vec2, all: readonly Item[], exclude: ReadonlySet<string> | string = new Set()): Contribution | null {
  const skip = typeof exclude === 'string' ? new Set([exclude]) : exclude;
  const src = lightSource(light, all);
  if (!src) return null;
  const horiz = Math.hypot(at.x - light.pos.x, at.y - light.pos.y);
  if (horiz < 5) return null;
  const d = Math.hypot(horiz, src.heightCm - FACE_CM) / 100; // m
  const { lumens } = lightLumens(light);
  let pass = Math.min(1, Math.max(0, (light.light?.intensityPct ?? 100) / 100));
  for (const m of itemModifiers(light)) pass *= MODIFIER_PASS[m.type] ?? 1;
  if (lightStyle(light) === 'cob-softbox') pass *= MODIFIER_PASS.softbox!;
  // Behind a lowered skirt only the pool straight below is lit.
  pass *= skirtPass(light, at);
  pass *= lightColor(light).transmission;
  // Off the centre of the beam the light falls away (half at the edge), spill beyond it.
  const off = src.beamDeg >= 360 ? 0 : Math.abs(((aimAt(light.pos, at) - light.rotationDeg + 540) % 360) - 180);
  const half = src.beamDeg / 2;
  const inBeam = off <= half ? 1 - 0.5 * (off / half) ** 2 : 0.06;
  const intensityCd = (lumens / solidAngle(Math.min(360, src.beamDeg))) * pass; // on the beam's axis
  let lux = (intensityCd * inBeam) / (d * d);
  // Through a diffusion frame (only for what's past it): the fabric glows like a lit panel the
  // size of the patch the beam covers. A uniformly lit diffuse disc of radius R gives
  // E = M·R² / (R² + D²) at distance D: flatter than inverse square close to it, the same far
  // away. What the fabric doesn't scatter carries on as the lamp's own (dimmed) beam.
  if (src.frameId && horiz > src.minDistCm) {
    const frame = all.find((i) => i.id === src.frameId);
    const fabricPass = FABRIC_PASS[fabricById(frame?.grip?.fabric)?.id ?? ''] ?? 0.5;
    const scatter = src.scatter ?? 0.7;
    const onFabric = intensityCd / Math.max(0.01, ((src.frameDistCm ?? src.minDistCm) / 100) ** 2); // lux on the fabric
    const r = (src.litCm ?? src.sizeCm) / 200; // m
    const fromFrame = Math.hypot(Math.hypot(at.x - src.pos.x, at.y - src.pos.y), src.heightCm - FACE_CM) / 100;
    const glow = (onFabric * fabricPass * r * r) / (r * r + fromFrame * fromFrame);
    lux = scatter * glow + (1 - scatter) * lux * fabricPass;
  }
  // Blocked by someone or something between: hard light is cut, soft light wraps around a bit.
  let blocked = false;
  let blockAt = 0;
  const fromSrc = Math.hypot(at.x - src.pos.x, at.y - src.pos.y);
  for (const o of occluders(all)) {
    if (skip.has(o.id) || o.heightCm < FACE_CM * 0.9) continue; // lower than a face: doesn't block it
    if (pointInPolygon(src.pos, o.points)) continue; // standing on the light's spot
    const nearest = Math.min(...o.points.map((q) => Math.hypot(q.x - src.pos.x, q.y - src.pos.y)));
    if (nearest >= fromSrc) continue; // behind the person
    const poly = shadowPolygon(src.pos, src.heightCm, o, fromSrc * 2);
    if (poly && inside(at, poly)) {
      blocked = true;
      blockAt = nearest;
      break;
    }
  }
  if (blocked) lux *= Math.max(0.05, 1 - shadowDarkness(src, blockAt) / 0.62);
  return { lightId: light.id, lux, blocked };
}

/** T-stop for an incident reading: N² = E·ISO·t / C. */
export function tStopFor(lux: number, cam: CameraSettings): number {
  const t = cam.shutterDeg / 360 / cam.fps;
  return Math.sqrt(Math.max(0, (lux * cam.iso * t) / METER_C));
}

export const STOPS = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32];

export type StopStep = NonNullable<MeterSettings['step']>;
const DIVISIONS: Record<StopStep, number> = { half: 2, third: 3, quarter: 4 };
const FRACTION: Record<StopStep, string[]> = { half: ['', '½'], third: ['', '⅓', '⅔'], quarter: ['', '¼', '½', '¾'] };

/** A stop split like a meter shows it: the full stop below and the fraction above it ("5.6" + "⅓"). */
export function stopParts(n: number, step: StopStep = 'third'): { base: string; frac: string; under?: boolean; over?: boolean } {
  if (n < 0.7) return { base: '1', frac: '', under: true };
  if (n > 36) return { base: '32', frac: '', over: true };
  const div = DIVISIONS[step];
  const steps = Math.round(Math.log2(n * n) * div);
  const full = Math.floor(steps / div);
  const rest = steps - full * div;
  const base = STOPS[Math.min(STOPS.length - 1, Math.max(0, full))] ?? 32;
  return { base: String(base), frac: FRACTION[step][rest] ?? '' };
}

/** Nearest full stop below, plus the fraction: "T2.8 +⅔" (thirds unless told otherwise). */
export function tStopLabel(n: number, step: StopStep = 'third'): string {
  const p = stopParts(n, step);
  if (p.under) return 'under T1';
  if (p.over) return 'over T32';
  return `T${p.base}${p.frac ? ` +${p.frac}` : ''}`;
}

/** Shutter speed for a frame rate and shutter angle: "1/48". */
export function shutterSpeed(fps: number, deg: number): string {
  return `1/${Math.round((fps * 360) / Math.max(1, deg))}`;
}

export interface MeterConfig extends CameraSettings {
  step: StopStep;
  unit: NonNullable<MeterSettings['unit']>;
}

/** A meter's settings, falling back to `cam` (the app's defaults). */
export function meterConfig(meter: Item, cam: CameraSettings = DEFAULT_CAMERA): MeterConfig {
  const m = meter.meter ?? {};
  return { iso: m.iso ?? cam.iso, fps: m.fps ?? cam.fps, shutterDeg: m.shutterDeg ?? cam.shutterDeg, step: m.step ?? 'third', unit: m.unit ?? 'lux' };
}

/** Readings on every light meter in the scene, at face height: where the meter stands, or on what it is attached to. */
export function meterReadings(items: readonly Item[], cam: CameraSettings = DEFAULT_CAMERA, sun?: Sun): Reading[] {
  const lights = items.filter((i) => i.kind === 'light' && !i.hidden);
  const windows = windowLights(items, sun);
  const occ = windows.length ? occluders(items) : [];
  return items
    .filter((i) => isMeter(i) && !i.hidden)
    .map((p) => {
      // A meter attached to something reads the light on that thing (where the meter sits is
      // just where its reading is shown); what it hangs on doesn't shade it.
      const on = p.attachedTo ? items.find((i) => i.id === p.attachedTo!.to) : undefined;
      const at = on?.pos ?? p.pos;
      const own = new Set(assemblyOf(p, items).map((i) => i.id));
      const contributions = lights.map((l) => luxFrom(l, at, items, own)).filter((c): c is Contribution => !!c && c.lux > 0.5);
      // Daylight from the windows; direct sun is cut by anything standing in its way.
      const shaded = (wl: (typeof windows)[number]) =>
        occ.some((o) => {
          if (own.has(o.id) || o.heightCm < FACE_CM * 0.9 || wl.source.ignore?.includes(o.id)) return false;
          const poly = shadowPolygon(wl.source.pos, wl.source.heightCm, o, 2e5);
          return !!poly && pointInPolygon(at, poly);
        });
      const day = daylightLux(at, windows, shaded);
      if (day > 0.5) contributions.push({ lightId: DAYLIGHT_ID, lux: day, blocked: false });
      contributions.sort((a, b) => b.lux - a.lux);
      const lux = contributions.reduce((n, c) => n + c.lux, 0);
      const key = contributions[0];
      const fill = lux - (key?.lux ?? 0);
      const ratio = key && fill > 0.5 ? `${Math.max(1, Math.round((lux / fill) * 2) / 2)}:1` : undefined;
      const config = meterConfig(p, cam);
      const n = tStopFor(lux, config);
      return {
        meterId: p.id,
        config,
        lux: Math.round(lux),
        footCandles: Math.round(lux / 10.764),
        contributions,
        keyId: key?.lightId,
        ratio,
        tStop: n,
        tStopLabel: tStopLabel(n, config.step),
      };
    });
}

/** Name for the lights behind a reading. */
export const lightName = (i: Item) => i.light?.unitId ?? libraryItem(i.catalogId)?.name ?? 'Light';
