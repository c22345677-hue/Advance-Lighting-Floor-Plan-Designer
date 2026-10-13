// Shadows on the plan. Each light is treated as a source of some size: the bigger the source,
// the softer the shadow (wider soft edges, lighter overall); a tiny source like a bare COB or a
// fresnel throws dark, crisp shadows. Shadows are cast by people, props, set walls and opaque
// grip, stretch away from the light (longer for low lights and tall objects) and stay inside
// the light's beam. A diffusion frame in a beam becomes the source for everything behind it.
import { fabricById } from '../library/fabrics';
import { libraryItem } from '../library/items';
import { itemFixture, itemLook, itemModifiers } from './gear';
import { aimAt, rotate } from './geometry';
import type { Item, Vec2 } from './types';
import { wallSegments, DEFAULT_WALL_CM } from './walls';

/** Height (cm) treated as "taller than any light": its shadow runs to the end of the beam. */
const BLOCKS = Infinity;
const DEFAULT_THROW_CM = 300;

/** How tall things are, cm: shadow length depends on it. */
const PROP_HEIGHT_CM: Record<string, number> = {
  table: 75,
  'round-table': 75,
  'coffee-table': 45,
  desk: 75,
  chair: 90,
  'office-chair': 100,
  armchair: 90,
  sofa: 85,
  stool: 65,
  bench: 45,
  bed: 60,
  'single-bed': 60,
  nightstand: 60,
  wardrobe: 200,
  dresser: 90,
  bookshelf: 200,
  tv: 120,
  counter: 90,
  fridge: 180,
  plant: 120,
  tree: 400,
  car: 150,
  piano: 110,
};

export type Hardness = 'hard' | 'medium' | 'soft';

export interface LightSource {
  lightId: string;
  /** Where the light leaves from: the fixture, or a diffusion frame in its beam. */
  pos: Vec2;
  /** The fixture itself (beam apex). */
  apex: Vec2;
  rotationDeg: number;
  beamDeg: number;
  throwCm: number;
  heightCm: number;
  /** Size of the emitting surface across the beam, cm. */
  sizeCm: number;
  /** Through a diffusion frame: only things farther than this from the fixture are shadowed. */
  minDistCm: number;
  /** The diffusion frame the light goes through, if any. */
  frameId?: string;
  /** Sunlight through a window: the sunlit patch (shadows stay inside it instead of a beam). */
  clip?: Vec2[];
  /** Occluders this light passes (the wall a window is in). */
  ignore?: string[];
  /** How dark a full shadow from this light is, 0–1. */
  darkness: number;
  hardness: Hardness;
  /** What makes it hard or soft, for the light's panel. */
  why: string;
}

const lightBeamDeg = (i: Item) => i.light?.beamDeg ?? libraryItem(i.catalogId)?.beamDeg ?? 60;

/** Default rigging height of a light, cm. */
function lightHeightCm(i: Item): number {
  if (i.light?.heightCm) return i.light.heightCm;
  const shape = itemLook(i).shape;
  if (shape === 'spacelight') return 450;
  if (shape === 'inflatable') return 400;
  if (shape === 'bulb') return 150;
  return 200;
}

/** Bare emitting size of a fixture (no modifiers), cm, and what it is. */
function bareSource(i: Item): { size: number; what: string } {
  const look = itemLook(i);
  const fam = itemFixture(i)?.family;
  switch (look.shape) {
    case 'cob':
      return { size: 18, what: 'bare COB with reflector' };
    case 'fresnel':
      return fam === 'par' || fam === 'spot' ? { size: 12, what: 'PAR / spot' } : { size: 16, what: 'fresnel' };
    case 'bulb':
      return { size: 10, what: 'bulb' };
    case 'tube':
      return { size: Math.max(20, look.w * 0.4), what: 'tube' };
    case 'inflatable':
      return { size: look.w, what: 'balloon' };
    case 'spacelight':
      return { size: 70, what: 'spacelight' };
    case 'panel':
    case 'mat':
      return { size: look.w, what: look.shape === 'mat' ? 'LED mat' : 'LED panel' };
    default:
      return { size: Math.max(10, look.w), what: 'light' };
  }
}

/** Darkness of a full shadow for a source of this size. */
export const darknessFor = (sizeCm: number) => 0.62 / (1 + sizeCm / 40);

export const hardnessFor = (sizeCm: number): Hardness => (sizeCm < 25 ? 'hard' : sizeCm < 80 ? 'medium' : 'soft');

const insideBeam = (apex: Vec2, rot: number, beamDeg: number, throwCm: number, p: Vec2) => {
  const d = Math.hypot(p.x - apex.x, p.y - apex.y);
  if (d > throwCm || d < 1) return false;
  if (beamDeg >= 360) return true;
  const off = Math.abs(((aimAt(apex, p) - rot + 540) % 360) - 180);
  return off <= beamDeg / 2;
};

/**
 * How far a light's beam is drawn: its throw (default 3 m), stretched so it always reaches the
 * nearest person standing in the beam (and whoever it is aimed at).
 */
export function beamReach(light: Item, all: readonly Item[]): number {
  const set = light.light?.throwCm ?? DEFAULT_THROW_CM;
  const beamDeg = lightBeamDeg(light);
  let nearest = Infinity;
  for (const p of all) {
    if (p.kind !== 'person' || p.hidden) continue;
    const aimed = !!p.actorId && p.actorId === light.light?.aimActorId;
    if (!aimed && !insideBeam(light.pos, light.rotationDeg, beamDeg, 1e6, p.pos)) continue;
    nearest = Math.min(nearest, Math.hypot(p.pos.x - light.pos.x, p.pos.y - light.pos.y));
  }
  return nearest === Infinity ? set : Math.max(set, nearest + 80);
}

/** The light as a shadow source, after its modifiers and any diffusion frame in its beam. */
export function lightSource(light: Item, all: readonly Item[]): LightSource | null {
  if (light.kind !== 'light') return null;
  const beamDeg = lightBeamDeg(light);
  const throwCm = beamReach(light, all);
  let { size, what } = bareSource(light);
  // Soft modifiers make the source as big as they are.
  for (const m of itemModifiers(light)) {
    const big = Math.max(m.sizeCm?.w ?? 0, m.sizeCm?.l ?? 0);
    if (m.type === 'softbox' || m.type === 'lantern' || m.type === 'dome') {
      size = Math.max(size, big || (m.type === 'lantern' ? 65 : 90));
      what = `${m.type} (${m.model})`;
    } else if (m.type === 'diffusion') {
      size = Math.max(size, big || size * 1.5);
      what = `diffusion (${m.model})`;
    } else if (m.type === 'fresnel' || m.type === 'projection' || m.type === 'parallel-beam') {
      size = Math.min(size, 14);
      what = `${m.type.replace('-', ' ')} (${m.model})`;
    }
  }
  let pos = light.pos;
  let minDistCm = 0;
  // A diffusion frame in the beam: the frame becomes the source for what's behind it.
  const frames = all
    .filter((f) => f.kind === 'grip' && fabricById(f.grip?.fabric)?.kind === 'diffusion' && insideBeam(light.pos, light.rotationDeg, beamDeg, throwCm, f.pos))
    .sort((a, b) => Math.hypot(a.pos.x - light.pos.x, a.pos.y - light.pos.y) - Math.hypot(b.pos.x - light.pos.x, b.pos.y - light.pos.y));
  const frame = frames[0];
  if (frame) {
    const w = itemLook(frame).w;
    if (w > size) {
      size = w;
      what = `through ${fabricById(frame.grip?.fabric)!.name} on a ${libraryItem(frame.catalogId)?.name ?? 'frame'}`;
    }
    pos = frame.pos;
    minDistCm = Math.hypot(frame.pos.x - light.pos.x, frame.pos.y - light.pos.y);
  }
  const intensity = (light.light?.intensityPct ?? 100) / 100;
  return {
    lightId: light.id,
    pos,
    apex: light.pos,
    rotationDeg: light.rotationDeg,
    beamDeg,
    throwCm,
    heightCm: lightHeightCm(light),
    sizeCm: Math.round(size),
    minDistCm,
    frameId: frame?.id,
    darkness: darknessFor(size) * Math.min(1, Math.max(0, intensity)),
    hardness: hardnessFor(size),
    why: what,
  };
}

export interface Occluder {
  id: string;
  /** Footprint outline, world coordinates (convex). */
  points: Vec2[];
  heightCm: number;
}

const rect = (i: Item, w: number, d: number): Vec2[] =>
  [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ].map((p) => {
    const r = rotate(p, i.rotationDeg);
    return { x: i.pos.x + r.x, y: i.pos.y + r.y };
  });

const ellipse = (i: Item, rx: number, ry: number, n = 10): Vec2[] =>
  Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    const r = rotate({ x: Math.cos(a) * rx, y: Math.sin(a) * ry }, i.rotationDeg);
    return { x: i.pos.x + r.x, y: i.pos.y + r.y };
  });

/** What can cast a shadow, as convex outlines with a height. */
export function occluders(items: readonly Item[]): Occluder[] {
  const out: Occluder[] = [];
  for (const i of items) {
    if (i.hidden) continue;
    const lib = libraryItem(i.catalogId);
    if (i.wall) {
      const t = i.wall.thicknessCm ?? DEFAULT_WALL_CM;
      wallSegments(i).forEach(([a, b], k) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) return;
        const nx = (-(b.y - a.y) / len) * (t / 2);
        const ny = ((b.x - a.x) / len) * (t / 2);
        out.push({
          id: `${i.id}#${k}`,
          points: [
            { x: a.x + nx, y: a.y + ny },
            { x: b.x + nx, y: b.y + ny },
            { x: b.x - nx, y: b.y - ny },
            { x: a.x - nx, y: a.y - ny },
          ],
          heightCm: BLOCKS,
        });
      });
      continue;
    }
    const { w, d, shape } = itemLook(i);
    if (i.kind === 'person') {
      out.push({ id: i.id, points: ellipse(i, 26, 14), heightCm: 175 });
    } else if (lib?.category === 'props') {
      const h = PROP_HEIGHT_CM[lib.id.replace('generic.prop.', '')] ?? 90;
      if (lib.style === 'rug') continue;
      out.push({ id: i.id, points: lib.style === 'round-table' || lib.style === 'plant' || lib.style === 'tree' || lib.style === 'stool' ? ellipse(i, w / 2, d / 2) : rect(i, w, d), heightCm: h });
    } else if (i.kind === 'grip') {
      if (shape === 'flag') out.push({ id: i.id, points: rect(i, w, Math.max(d, 4)), heightCm: BLOCKS });
      else if (shape === 'frame' || shape === 'polyboard') {
        const fabric = fabricById(i.grip?.fabric);
        // Diffusion lets light through (it becomes a softer source instead).
        if (fabric?.kind === 'diffusion') continue;
        if (shape === 'frame' && !fabric && !lib?.id.endsWith('vflat')) continue; // empty frame
        out.push({ id: i.id, points: rect(i, w, Math.max(d, 4)), heightCm: BLOCKS });
      }
    } else if (i.kind === 'set' && (shape === 'wall' || shape === 'box')) {
      out.push({ id: i.id, points: rect(i, w, d), heightCm: BLOCKS });
    } else if (shape === 'video-village' || shape === 'monitor') {
      out.push({ id: i.id, points: rect(i, w * 0.8, d * 0.6), heightCm: 150 });
    }
  }
  return out;
}

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (monotone chain). */
export function hull(points: Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The shadow an occluder throws from a point source at `src` (height `h`): its outline joined
 * with that outline pushed away from the light. Objects lower than the light make a shadow
 * h_obj / (h_light − h_obj) times their distance long; taller ones run to `reach`.
 */
export function shadowPolygon(src: Vec2, lightHeightCm: number, occ: Occluder, reach: number): Vec2[] | null {
  const far = occ.heightCm >= lightHeightCm ? Infinity : occ.heightCm / (lightHeightCm - occ.heightCm);
  const pushed = occ.points.map((p) => {
    const dx = p.x - src.x;
    const dy = p.y - src.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return null;
    const len = Math.min(reach, d * (1 + far));
    return { x: src.x + (dx / d) * len, y: src.y + (dy / d) * len };
  });
  if (pushed.some((p) => !p)) return null;
  return hull([...occ.points, ...(pushed as Vec2[])]);
}

export interface ShadowShape {
  lightId: string;
  points: Vec2[];
  opacity: number;
}

/**
 * Every shadow in the scene. A source of some size is sampled at a few points across its width,
 * each casting a faint shadow: where they all overlap is the full (umbra) shadow, the fringe
 * where only some do is the soft edge (penumbra).
 */
export function sceneShadows(items: readonly Item[], extra: LightSource[] = []): { sources: LightSource[]; shadows: ShadowShape[] } {
  const occ = occluders(items);
  const sources: LightSource[] = [];
  const shadows: ShadowShape[] = [];
  const all = [
    ...items.filter((i) => !i.hidden).map((i) => lightSource(i, items)),
    ...extra,
  ].filter((s): s is LightSource => !!s && s.darkness > 0.005);
  for (const s of all) {
    sources.push(s);
    const samples = s.clip ? 1 : s.sizeCm < 20 ? 1 : Math.min(7, Math.ceil(s.sizeCm / 18));
    const across = rotate({ x: 1, y: 0 }, s.rotationDeg); // perpendicular to the beam
    const reach = s.clip ? Math.hypot(s.pos.x - s.apex.x, s.pos.y - s.apex.y) + 2e4 : s.throwCm * 1.5;
    for (const o of occ) {
      if (s.ignore?.includes(o.id)) continue;
      const c = o.points.reduce((a, p) => ({ x: a.x + p.x / o.points.length, y: a.y + p.y / o.points.length }), { x: 0, y: 0 });
      if (s.clip) {
        // Sunlight through a window: only what stands in the sunlit patch.
        if (![c, ...o.points].some((p) => pointInPolygon(p, s.clip!))) continue;
      } else {
        // Only what's in front of the source (and past a diffusion frame) and roughly in the beam.
        const dist = Math.min(...[c, ...o.points].map((p) => Math.hypot(p.x - s.apex.x, p.y - s.apex.y)));
        if (dist > s.throwCm || Math.hypot(c.x - s.apex.x, c.y - s.apex.y) <= s.minDistCm) continue;
        if (![c, ...o.points].some((p) => insideBeam(s.apex, s.rotationDeg, s.beamDeg, s.throwCm, p))) continue;
      }
      if (o.points.some((p) => Math.hypot(p.x - s.pos.x, p.y - s.pos.y) < 1)) continue;
      for (let k = 0; k < samples; k++) {
        const t = samples === 1 ? 0 : (k / (samples - 1) - 0.5) * s.sizeCm;
        const src = { x: s.pos.x + across.x * t, y: s.pos.y + across.y * t };
        const poly = shadowPolygon(src, s.heightCm, o, reach);
        if (poly) shadows.push({ lightId: s.lightId, points: poly, opacity: s.darkness / samples });
      }
    }
  }
  return { sources, shadows };
}

/** Is `p` inside polygon `poly` (even-odd rule)? */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
