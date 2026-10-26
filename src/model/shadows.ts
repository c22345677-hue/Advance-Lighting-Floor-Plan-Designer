// Shadows on the plan. Each light is treated as a source of some size: the bigger the source,
// the softer the shadow (wider soft edges, lighter overall); a tiny source like a bare COB or a
// fresnel throws dark, crisp shadows. Shadows are cast by people, props, set walls and opaque
// grip, stretch away from the light (longer for low lights and tall objects) and stay inside
// the light's beam. A diffusion frame in a beam becomes the source for everything behind it.
//
// The physics, simplified for a plan:
// - How soft a shadow looks depends on the source's apparent size: the angle it covers as seen
//   from the subject (about size ÷ distance), not its size alone. A 6×6 next to someone is very
//   soft; the same frame across the room is close to hard.
// - The soft edge (penumbra) is source size × (subject → floor or wall) ÷ (source → subject): the
//   sampled sources below draw it, so it grows and shrinks with distance on its own.
// - Through diffusion, the source is the patch of fabric the light actually covers: the beam's
//   spread at the frame (2·d·tan(beam/2)), up to the frame's size. A lamp right behind the frame
//   only lights a small hot spot; pulled back it fills the frame.
// - Heavy diffusion (216, full grid) scatters fully, so the whole lit patch glows; light ones
//   (¼ grid, light grid) keep a hot spot and let some of the hard light straight through.
import { fabricById } from '../library/fabrics';
import { libraryItem } from '../library/items';
import { beamApex, lightBeamDeg, lightStyle, skirtDown, skirtPoolCm } from './emitter';
import { itemFixture, itemLook, itemModifiers } from './gear';
import { aimAt, rotate } from './geometry';
import type { Item, Vec2 } from './types';
import { wallSegments, DEFAULT_WALL_CM } from './walls';

/** Height (cm) treated as "taller than any light": its shadow runs to the end of the beam. */
const BLOCKS = Infinity;
/** How far a light's beam is drawn unless set: 9 m. */
export const DEFAULT_THROW_CM = 900;
/** Distance to the subject assumed when no one is in the beam (for how soft the light looks). */
const DEFAULT_SUBJECT_CM = 300;

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
  /** Where its beam spreads from (behind a broad face such as a mat), when not the fixture itself. */
  beamApex?: Vec2;
  /** Lantern or balloon skirt: quarters lowered (front, right, back, left), and the pool below them. */
  skirt?: { down: boolean[]; poolCm: number };
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
  /** How dark a full shadow from this light is, 0–1 (on its subject; see shadowDarkness for elsewhere). */
  darkness: number;
  hardness: Hardness;
  /** Dimmer setting, 0–1 (shadows fade with it). */
  intensity?: number;
  /** Distance from the source to its subject, cm, and how big the source looks from there, degrees. */
  subjectCm?: number;
  apparentDeg?: number;
  /** Through diffusion: how much of the frame the light covers, cm, and how fully the fabric scatters (0–1). */
  litCm?: number;
  scatter?: number;
  /** Where the light hits the frame from, cm (lamp to frame). */
  frameDistCm?: number;
  /** What makes it hard or soft, for the light's panel. */
  why: string;
}


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
  if (lightStyle(i) === 'cob-softbox') return { size: look.w, what: 'COB in a softbox' };
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
      return { size: look.w, what: 'lantern' };
    case 'panel':
    case 'mat':
      return { size: look.w, what: look.shape === 'mat' ? 'LED mat' : 'LED panel' };
    default:
      return { size: Math.max(10, look.w), what: 'light' };
  }
}

/** Is any part of the occluder in the beam (or, for a wall, does it cross the beam)? */
function insideBeamOrCrossing(s: LightSource, points: Vec2[], c: Vec2, range: number): boolean {
  const pts = [c, ...points];
  if (pts.some((p) => insideBeam(s.apex, s.rotationDeg, s.beamDeg, range, p))) return true;
  if (s.beamDeg >= 360 || points.length < 2) return false;
  // A long wall can span the beam with both ends outside it: check the angles straddle the beam.
  const off = (p: Vec2) => ((aimAt(s.apex, p) - s.rotationDeg + 540) % 360) - 180;
  const offs = points.map(off);
  return Math.min(...offs) < -s.beamDeg / 2 && Math.max(...offs) > s.beamDeg / 2 && Math.max(...offs) - Math.min(...offs) < 180;
}

/** Darkness of a full shadow for a source of this size (seen from about 45 cm: the window skylight). */
export const darknessFor = (sizeCm: number) => 0.62 / (1 + sizeCm / 40);

/** A size-only guess at hardness (for sources with no subject to measure from). */
export const hardnessFor = (sizeCm: number): Hardness => (sizeCm < 25 ? 'hard' : sizeCm < 80 ? 'medium' : 'soft');

/** Angle a source of size `sizeCm` covers seen from `distCm` away, degrees. */
export const apparentDeg = (sizeCm: number, distCm: number) => (2 * Math.atan(sizeCm / 2 / Math.max(1, distCm)) * 180) / Math.PI;

/**
 * How dark a shadow is from a source of `sizeCm`, on something `distCm` from it: a source that
 * looks big from there wraps light around the object and fills its shadow in.
 */
export const darknessAt = (sizeCm: number, distCm: number) => 0.62 / (1 + (1.8 * sizeCm) / Math.max(20, distCm));

/** Hard below about 8° apparent size, soft from about 20°. */
export const hardnessAt = (deg: number): Hardness => (deg < 8 ? 'hard' : deg < 20 ? 'medium' : 'soft');

/** How completely a diffusion fabric scatters light (1: the whole lit patch glows evenly). */
export const FABRIC_SCATTER: Record<string, number> = {
  '216': 1,
  'full-grid': 0.95,
  'magic-cloth': 0.85,
  '250': 0.8,
  'half-grid': 0.75,
  silk: 0.6,
  'quarter-grid': 0.5,
  'light-grid': 0.35,
};

/** Distance from `from` to the nearest person standing in the light's beam past `minDistCm` (or the person it's aimed at). */
function subjectDistance(light: Item, from: Vec2, beamDeg: number, all: readonly Item[], minDistCm: number): number | null {
  let best: number | null = null;
  for (const p of all) {
    if (p.kind !== 'person' || p.hidden) continue;
    const aimed = !!p.actorId && p.actorId === light.light?.aimActorId;
    if (!aimed && !insideBeam(light.pos, light.rotationDeg, beamDeg, 1e6, p.pos)) continue;
    if (Math.hypot(p.pos.x - light.pos.x, p.pos.y - light.pos.y) <= minDistCm) continue;
    const d = Math.hypot(p.pos.x - from.x, p.pos.y - from.y);
    if (best == null || d < best) best = d;
  }
  return best;
}

const insideBeam = (apex: Vec2, rot: number, beamDeg: number, throwCm: number, p: Vec2) => {
  const d = Math.hypot(p.x - apex.x, p.y - apex.y);
  if (d > throwCm || d < 1) return false;
  if (beamDeg >= 360) return true;
  const off = Math.abs(((aimAt(apex, p) - rot + 540) % 360) - 180);
  return off <= beamDeg / 2;
};

/**
 * How far a light's beam is drawn: its throw (default 3 m), stretched so it always reaches 15%
 * past the nearest person standing in the beam (or whoever it is aimed at).
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
  // 15% past the subject.
  return nearest === Infinity ? set : Math.max(set, nearest * 1.15);
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
  let litCm: number | undefined;
  let scatter: number | undefined;
  let frameDistCm: number | undefined;
  if (frame) {
    // The source becomes the patch of fabric the beam covers, spread by how well the fabric scatters.
    const w = itemLook(frame).w;
    frameDistCm = Math.hypot(frame.pos.x - light.pos.x, frame.pos.y - light.pos.y);
    const spread = size + 2 * frameDistCm * Math.tan((Math.min(beamDeg, 170) / 2) * (Math.PI / 180));
    litCm = Math.min(w, spread);
    scatter = FABRIC_SCATTER[frame.grip?.fabric ?? ''] ?? 0.7;
    size = Math.max(size * 0.5, size + (litCm - size) * scatter);
    what = `${fabricById(frame.grip?.fabric)!.name} on a ${libraryItem(frame.catalogId)?.name ?? 'frame'}`;
    pos = frame.pos;
    minDistCm = frameDistCm;
  }
  const intensity = Math.min(1, Math.max(0, (light.light?.intensityPct ?? 100) / 100));
  const subject = subjectDistance(light, pos, beamDeg, all, minDistCm);
  const dist = subject ?? DEFAULT_SUBJECT_CM;
  const deg = apparentDeg(size, dist);
  return {
    lightId: light.id,
    pos,
    apex: light.pos,
    beamApex: beamApex(light, beamDeg),
    skirt: skirtDown(light) ? { down: skirtDown(light)!, poolCm: skirtPoolCm(light) } : undefined,
    rotationDeg: light.rotationDeg,
    beamDeg,
    throwCm,
    heightCm: lightHeightCm(light),
    sizeCm: Math.round(size),
    minDistCm,
    frameId: frame?.id,
    darkness: darknessAt(size, dist) * intensity,
    hardness: hardnessAt(deg),
    intensity,
    subjectCm: subject ?? undefined,
    apparentDeg: deg,
    litCm,
    scatter,
    frameDistCm,
    why: what,
  };
}

export interface Occluder {
  id: string;
  /** Footprint outline, world coordinates (convex). */
  points: Vec2[];
  heightCm: number;
  /** Walls and solid set pieces (flats, screens): the light stops at them; they draw no shadow of their own. */
  stopsLight?: boolean;
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
      // Doors and windows leave gaps: light gets through them.
      const openings = items.filter((o) => o.inWall?.wallId === i.id && !o.hidden);
      wallSegments(i).forEach(([a, b], k) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) return;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const nx = -uy * (t / 2);
        const ny = ux * (t / 2);
        const gaps = openings
          .filter((o) => o.inWall!.seg === k)
          .map((o) => {
            const w = o.sizeCm?.w ?? itemLook(o).w;
            const off = len <= w ? len / 2 : Math.min(len - w / 2, Math.max(w / 2, o.inWall!.offsetCm));
            return [Math.max(0, off - w / 2), Math.min(len, off + w / 2)] as [number, number];
          })
          .sort((p, q) => p[0] - q[0]);
        let from = 0;
        const pieces: [number, number][] = [];
        for (const [g0, g1] of gaps) {
          if (g0 > from + 0.5) pieces.push([from, g0]);
          from = Math.max(from, g1);
        }
        if (len > from + 0.5) pieces.push([from, len]);
        for (const [d0, d1] of pieces) {
          const p0 = { x: a.x + ux * d0, y: a.y + uy * d0 };
          const p1 = { x: a.x + ux * d1, y: a.y + uy * d1 };
          out.push({
            id: `${i.id}#${k}`,
            points: [
              { x: p0.x + nx, y: p0.y + ny },
              { x: p1.x + nx, y: p1.y + ny },
              { x: p1.x - nx, y: p1.y - ny },
              { x: p0.x - nx, y: p0.y - ny },
            ],
            heightCm: BLOCKS,
            stopsLight: true,
          });
        }
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
      out.push({ id: i.id, points: rect(i, w, d), heightCm: BLOCKS, stopsLight: true });
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
  /** Which point across the source cast it (−1: the hard hot spot through light diffusion). */
  sample?: number;
  /** Cast by a wall: the light doesn't get past it at all (drawn as "no light here", not as a shadow). */
  wall?: boolean;
  /** Where the shadow starts (the object) and where it has faded out: drawn as a fade between them. */
  fade?: { from: Vec2; to: Vec2 };
}

/** Shadows run on past the end of the beam (fading out) by this much of the beam's reach. */
export const SHADOW_REACH = 2.2;

/** How dark a shadow from `s` is on something `distCm` from the source (sunlight keeps its own). */
export function shadowDarkness(s: LightSource, distCm: number): number {
  if (s.intensity == null) return s.darkness;
  return darknessAt(s.sizeCm, distCm) * s.intensity;
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
    const samples = s.clip ? 1 : s.sizeCm < 20 ? 1 : Math.min(9, Math.ceil(s.sizeCm / 18));
    const across = rotate({ x: 1, y: 0 }, s.rotationDeg); // perpendicular to the beam
    const reach = s.clip ? Math.hypot(s.pos.x - s.apex.x, s.pos.y - s.apex.y) + 2e4 : s.throwCm * SHADOW_REACH;
    for (const o of occ) {
      if (s.ignore?.includes(o.id)) continue;
      const c = o.points.reduce((a, p) => ({ x: a.x + p.x / o.points.length, y: a.y + p.y / o.points.length }), { x: 0, y: 0 });
      if (s.clip) {
        // Sunlight through a window: only what stands in the sunlit patch.
        if (![c, ...o.points].some((p) => pointInPolygon(p, s.clip!))) continue;
      } else {
        // Only what's in front of the source (and past a diffusion frame) and roughly in the beam.
        // Walls count out to where the shadows end, so nothing's shadow carries on past one.
        const range = o.heightCm === BLOCKS ? reach : s.throwCm;
        const dist = Math.min(...[c, ...o.points].map((p) => Math.hypot(p.x - s.apex.x, p.y - s.apex.y)));
        if (dist > range || Math.hypot(c.x - s.apex.x, c.y - s.apex.y) <= s.minDistCm) continue;
        if (!insideBeamOrCrossing(s, o.points, c, range)) continue;
      }
      if (o.points.some((p) => Math.hypot(p.x - s.pos.x, p.y - s.pos.y) < 1)) continue;
      // Closer to a big source, the shadow is filled in more (and spread wider by the samples).
      const dark = shadowDarkness(s, Math.hypot(c.x - s.pos.x, c.y - s.pos.y));
      // Light diffusion keeps a hot spot: some of the lamp's hard shadow shows through.
      if (s.frameId && s.scatter != null && s.scatter < 0.9) {
        const poly = shadowPolygon(s.apex, s.heightCm, o, reach);
        const d = Math.hypot(c.x - s.apex.x, c.y - s.apex.y) || 1;
        const tip = poly ? Math.max(...poly.map((q) => Math.hypot(q.x - s.apex.x, q.y - s.apex.y))) : 0;
        if (poly)
          shadows.push({
            lightId: s.lightId,
            points: poly,
            opacity: darknessAt(15, d) * (1 - s.scatter) * (s.intensity ?? 1) * 0.8,
            sample: -1,
            fade: { from: c, to: { x: s.apex.x + ((c.x - s.apex.x) / d) * tip, y: s.apex.y + ((c.y - s.apex.y) / d) * tip } },
          });
      }
      for (let k = 0; k < samples; k++) {
        // The middle of each equal slice of the source (its very edges count for less).
        const t = samples === 1 ? 0 : ((k + 0.5) / samples - 0.5) * s.sizeCm;
        const src = { x: s.pos.x + across.x * t, y: s.pos.y + across.y * t };
        const poly = shadowPolygon(src, s.heightCm, o, reach);
        if (!poly) continue;
        // Fade from the object to the shadow's far end (sunlight keeps its patch, so no fade).
        let fade: ShadowShape['fade'];
        if (!s.clip) {
          const d = Math.hypot(c.x - src.x, c.y - src.y) || 1;
          const tip = Math.max(...poly.map((q) => Math.hypot(q.x - src.x, q.y - src.y)));
          fade = { from: c, to: { x: src.x + ((c.x - src.x) / d) * tip, y: src.y + ((c.y - src.y) / d) * tip } };
        }
        shadows.push({ lightId: s.lightId, points: poly, opacity: dark / samples, fade, sample: k, wall: o.stopsLight || undefined });
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

/**
 * The area a point light at `o` reaches, given walls (as segments), out to `radius`: a polygon
 * found by casting rays at every wall corner (and just either side of it).
 */
export function visibilityPolygon(o: Vec2, segs: [Vec2, Vec2][], radius: number): Vec2[] {
  const ring: Vec2[] = Array.from({ length: 32 }, (_, k) => ({ x: o.x + Math.cos((k / 32) * Math.PI * 2) * radius * 1.05, y: o.y + Math.sin((k / 32) * Math.PI * 2) * radius * 1.05 }));
  const all: [Vec2, Vec2][] = [...segs, ...ring.map((p, k) => [p, ring[(k + 1) % ring.length]!] as [Vec2, Vec2])];
  const angles: number[] = [];
  for (const [a, b] of all)
    for (const p of [a, b]) {
      const t = Math.atan2(p.y - o.y, p.x - o.x);
      angles.push(t - 1e-4, t, t + 1e-4);
    }
  angles.sort((a, b) => a - b);
  const out: Vec2[] = [];
  for (const t of angles) {
    const d = { x: Math.cos(t), y: Math.sin(t) };
    let best = radius * 1.05;
    for (const [a, b] of all) {
      // Ray o + d·s against segment a + (b − a)·u.
      const e = { x: b.x - a.x, y: b.y - a.y };
      const den = d.x * e.y - d.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const w = { x: a.x - o.x, y: a.y - o.y };
      const s = (w.x * e.y - w.y * e.x) / den;
      const u = (w.x * d.y - w.y * d.x) / den;
      if (s > 0.01 && u >= -1e-9 && u <= 1 + 1e-9 && s < best) best = s;
    }
    out.push({ x: o.x + d.x * best, y: o.y + d.y * best });
  }
  return out;
}

/** Faces of walls and solid set pieces near `o` (within `radius`), as segments. */
export function wallFaces(items: readonly Item[], o: Vec2, radius: number): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (const occ of occluders(items)) {
    if (!occ.stopsLight) continue;
    if (Math.min(...occ.points.map((p) => Math.hypot(p.x - o.x, p.y - o.y))) > radius * 1.5 + 2000) continue;
    occ.points.forEach((p, k) => out.push([p, occ.points[(k + 1) % occ.points.length]!]));
  }
  return out;
}

/** Where a light gets to past the walls (null when no wall is near). */
export function lightReach(from: Vec2, items: readonly Item[], radius: number): Vec2[] | null {
  const faces = wallFaces(items, from, radius);
  return faces.length ? visibilityPolygon(from, faces, radius) : null;
}
