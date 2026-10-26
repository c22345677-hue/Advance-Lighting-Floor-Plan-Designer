// What kind of light an item is, how its modifiers stack in front of it, and the light it gives:
// the beam angle (with spot/flood for lenses), and the face it comes from — a mat or panel shines
// from its whole surface, a fresnel from its lens, a softbox from its front, a bare COB from a point.
import type { Modifier } from '../catalog/schema';
import { itemFixture, itemLook, itemModifiers } from './gear';
import type { Item } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type LightStyle =
  | 'monolight' // COB with Bowens / Aputure / G mount (LS 600d, Forza 500, Storm)
  | 'compact' // small COB with a small mount (Forza 60, FM mount)
  | 'cob-reflector' // generic COB with its standard reflector
  | 'fresnel'
  | 'par'
  | 'spot'
  | 'panel'
  | 'pocket'
  | 'ring'
  | 'tube'
  | 'mat'
  | 'air-panel'
  | 'air-tube'
  | 'balloon'
  | 'spacelight'
  | 'bulb'
  | 'practical';

/** Which drawing a light gets. */
export function lightStyle(item: Item): LightStyle {
  const f = itemFixture(item);
  if (f) {
    const s = f.sizeCm;
    const big = Math.max(s?.l ?? 0, s?.w ?? 0);
    const small = Math.min(s?.l ?? 0, s?.w ?? 0) || big;
    switch (f.family) {
      case 'cob':
        return f.mount === 'fm' || big < 15 ? 'compact' : 'monolight';
      case 'fresnel':
        return 'fresnel';
      case 'par':
        return 'par';
      case 'spot':
        return 'spot';
      case 'tube':
        return 'tube';
      case 'mat':
        return 'mat';
      case 'bulb':
        return 'bulb';
      case 'pocket':
        return 'pocket';
      case 'inflatable':
        if (big < 20) return 'balloon';
        return big / small > 2 ? 'air-tube' : 'air-panel';
      case 'other':
        return /\bLR\d/.test(f.model) ? 'ring' : 'panel';
      default:
        return big < 15 ? 'pocket' : 'panel';
    }
  }
  switch (item.catalogId) {
    case 'generic.light.cob':
      return 'cob-reflector';
    case 'generic.light.fresnel':
      return 'fresnel';
    case 'generic.light.hmi-par':
      return 'par';
    case 'generic.light.tube':
      return 'tube';
    case 'generic.light.mat':
      return 'mat';
    case 'generic.light.practical':
      return 'practical';
    case 'generic.light.balloon':
      return 'balloon';
    case 'generic.light.spacelight':
      return 'spacelight';
    default:
      return 'panel';
  }
}


// ---- Modifiers --------------------------------------------------------------------------

/** The size a modifier is drawn at: its own, or a fair guess from the light it sits on. */
export function modSize(m: Modifier, lightW: number): { w: number; depth: number } | null {
  const s = m.sizeCm;
  const wide = Math.max(s?.l ?? 0, s?.w ?? 0);
  switch (m.type) {
    case 'reflector':
      return { w: wide || lightW * 1.5, depth: s?.h ?? (wide || lightW * 1.5) * 0.45 };
    case 'projection':
    case 'adapter': {
      // A lens barrel: as long as its longest side, as wide as the next.
      const [a, b] = [s?.l ?? 0, s?.w ?? 0, s?.h ?? 0].sort((x, y) => y - x);
      return a ? { w: Math.min(b || a, a), depth: m.type === 'adapter' ? Math.min(...[s?.l, s?.w, s?.h].filter((v): v is number => !!v)) : a } : null;
    }
    case 'barndoors':
      return { w: wide || lightW * 1.05, depth: s?.h ?? lightW * 0.35 };
    case 'grid':
    case 'skirt':
    case 'diffusion':
      return { w: wide || lightW, depth: s?.h ?? 3 };
    case 'softbox': {
      if (!wide) return { w: lightW * 1.35, depth: lightW * 0.6 };
      // Strip and rectangular boxes stand on end (the narrow side is across); domes go deep.
      const across = s?.l && s?.w && s.l !== s.w ? Math.min(s.l, s.w) : wide;
      return { w: across, depth: s?.h ?? (isDome(m) ? wide * 0.62 : Math.min(across * 0.9, 60)) };
    }
    default:
      return wide ? { w: wide, depth: s?.h ?? wide * 0.5 } : null;
  }
}

/** Round, deep softboxes (parabolic domes, octas) rather than square-sided boxes. */
export const isDome = (m: Modifier) => m.type === 'dome' || /dome|octa|parabolic|para\b/i.test(m.model);


/** Where a light's modifiers start: its front face (a panel, mat or tube is drawn at least a little thick). */
export const modifierFront = (shape: string, d: number) => (shape === 'panel' || shape === 'mat' || shape === 'tube' ? -Math.max(d / 2, 0.8) : -d / 2);

/**
 * How far a light's modifiers reach in front of it, and how wide they get, cm (as drawn by
 * ModifierShapes). Zero when it has none.
 */
export function modifierReach(item: Item, lightW: number): { depth: number; w: number } {
  let depth = 0;
  let wide = 0;
  let frontW = lightW;
  for (const m of itemModifiers(item)) {
    const size = modSize(m, frontW);
    if (!size) continue;
    const { w } = size;
    switch (m.type) {
      case 'lantern':
        depth += w * 0.95;
        wide = Math.max(wide, w);
        frontW = w;
        break;
      case 'barndoors':
        wide = Math.max(wide, w * 1.35);
        depth += size.depth;
        break;
      case 'skirt':
        wide = Math.max(wide, w * 1.1);
        depth = Math.max(depth, depth + size.depth * 3);
        break;
      default:
        wide = Math.max(wide, w);
        depth += size.depth;
        if (m.type !== 'grid' && m.type !== 'diffusion') frontW = w;
    }
  }
  return { depth, w: wide };
}


// ---- Beam -----------------------------------------------------------------------------

/** "15–50°" in a lens's name → [50, 15] (flood first). */
function degRange(name: string): [number, number] | null {
  const m = /(\d+)\s*[–-]\s*(\d+)\s*°/.exec(name);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return [Math.max(a, b), Math.min(a, b)];
}

/** A single angle in a modifier's name ("45° grid", "35° reflector"). */
const degIn = (name: string): number | null => {
  const m = /(\d+)\s*°/.exec(name);
  return m ? Number(m[1]) : null;
};

/**
 * Spot/flood range of a light that focuses (fresnel, PAR, focusing spot, or a fresnel or
 * projection lens fitted), degrees with flood first; null when it doesn't focus.
 */
export function zoomRange(item: Item): [number, number] | null {
  const mods = itemModifiers(item);
  for (let k = mods.length - 1; k >= 0; k--) {
    const m = mods[k]!;
    if (m.type === 'fresnel') return degRange(m.model) ?? [45, 12];
    if (m.type === 'projection') return degRange(m.model) ?? [45, 20];
    if (m.type === 'parallel-beam') return [40, 10];
    if (m.type === 'softbox' || m.type === 'lantern' || m.type === 'dome' || m.type === 'reflector') return null;
  }
  switch (lightStyle(item)) {
    case 'fresnel':
      return [60, 15];
    case 'par':
      return [55, 12];
    case 'spot':
      return [55, 15];
    default:
      return null;
  }
}

/** Beam of the bare light, degrees (360: all round). */
const BARE_DEG: Record<LightStyle, number> = {
  monolight: 110,
  compact: 100,
  'cob-reflector': 55,
  fresnel: 60,
  par: 55,
  spot: 55,
  panel: 110,
  pocket: 110,
  ring: 120,
  tube: 180,
  mat: 150,
  'air-panel': 360,
  'air-tube': 220,
  balloon: 360,
  spacelight: 360,
  bulb: 360,
  practical: 360,
};

/**
 * The light's beam angle, degrees. A light that focuses goes from full flood (the default) to
 * full spot with `spotPct`; otherwise the angle set by hand, else what the light and its
 * modifiers give (a softbox spreads it, a lantern sends it all round, a grid narrows it).
 */
export function lightBeamDeg(item: Item): number {
  const zoom = zoomRange(item);
  const set = item.light?.beamDeg;
  if (zoom) {
    if (item.light?.spotPct == null && set) return clamp(set, zoom[1], zoom[0]);
    const t = clamp(item.light?.spotPct ?? 0, 0, 100) / 100;
    return zoom[0] + (zoom[1] - zoom[0]) * t;
  }
  if (set) return Math.min(360, set);
  let deg = BARE_DEG[lightStyle(item)];
  for (const m of itemModifiers(item)) {
    switch (m.type) {
      case 'softbox':
        deg = isDome(m) ? 110 : 100;
        break;
      case 'lantern':
      case 'dome':
        deg = 360;
        break;
      case 'reflector':
        deg = degIn(m.model) ?? 55;
        break;
      case 'grid':
        deg = Math.min(deg, degIn(m.model) ?? 40);
        break;
      case 'skirt':
        deg = Math.min(deg, 220);
        break;
      case 'barndoors':
        deg = Math.min(deg, 100);
        break;
      case 'diffusion':
        deg = Math.max(deg, 120);
        break;
      default:
        break;
    }
  }
  return deg;
}

/**
 * Where the light comes out: the width of the glowing face (0: a point, or all round) and how
 * far in front of the item's position it is, cm.
 */
export function lightFace(item: Item): { width: number; forward: number } {
  const { shape, w, d } = itemLook(item);
  const style = lightStyle(item);
  let width: number;
  switch (style) {
    case 'panel':
    case 'pocket':
    case 'ring':
    case 'mat':
    case 'tube':
    case 'air-tube':
      width = w * 0.95;
      break;
    case 'fresnel':
      width = w * 0.8;
      break;
    case 'par':
      width = w * 0.85;
      break;
    case 'spot':
      width = w * 0.55;
      break;
    case 'cob-reflector':
      width = w * 1.5;
      break;
    case 'monolight':
    case 'compact':
      width = w * 0.3;
      break;
    default:
      width = 0;
  }
  let forward = d / 2;
  // Each modifier in turn becomes the face: a softbox's front, a lens, a reflector's mouth.
  let frontW = w;
  let depth = 0;
  for (const m of itemModifiers(item)) {
    const size = modSize(m, frontW);
    if (!size) continue;
    switch (m.type) {
      case 'softbox':
      case 'reflector':
      case 'parallel-beam':
        width = size.w;
        break;
      case 'fresnel':
      case 'projection':
        width = size.w * 0.7;
        break;
      case 'lantern':
      case 'dome':
        width = 0;
        break;
      case 'diffusion':
        width = Math.max(width, size.w);
        break;
      default:
        break;
    }
    if (m.type === 'lantern') depth += size.w * 0.95;
    else if (m.type !== 'skirt') depth += size.depth;
    if (m.type !== 'grid' && m.type !== 'diffusion' && m.type !== 'barndoors' && m.type !== 'skirt') frontW = size.w;
  }
  if (depth > 0) forward = -modifierFront(shape, d) + depth;
  return { width, forward };
}

/**
 * The point the beam spreads from: on the light for a point source; for a broad face, behind it,
 * so the beam's edges leave the face's two ends at the beam angle.
 */
export function beamApex(item: Item, deg = lightBeamDeg(item)): { x: number; y: number } {
  const { width, forward } = lightFace(item);
  if (deg >= 360 || width < 2) return item.pos;
  const half = (Math.min(deg, 170) / 2) * (Math.PI / 180);
  const back = width / 2 / Math.tan(half);
  const r = (item.rotationDeg * Math.PI) / 180;
  const dir = { x: Math.sin(r), y: -Math.cos(r) };
  const along = forward - back;
  return { x: item.pos.x + dir.x * along, y: item.pos.y + dir.y * along };
}
