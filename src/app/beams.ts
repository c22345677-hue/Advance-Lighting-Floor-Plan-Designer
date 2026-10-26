// A light's beam on the plan, as data (so the light layer can draw it with its shadows cut out)
// and drawn straight onto a canvas. The beam is in the light's colour (temperature, HSI, gels),
// stronger for brighter lights, falling off with distance roughly as light does; through a
// diffusion frame the lamp's cone stops at the frame and the fabric spreads the light wide.
import { lightColor, type RGB } from '../model/color';
import { beamApex, lightBeamDeg, lightFace, skirtDown, skirtPoolCm, zoomRange } from '../model/emitter';
import { lightLumens } from '../model/exposure';
import { beamReach, lightReach, lightSource } from '../model/shadows';
import type { Item, Vec2 } from '../model/types';

export interface BeamSpec {
  lightId: string;
  pos: Vec2;
  rotationDeg: number;
  deg: number;
  throwCm: number;
  rgb: RGB;
  alpha: number;
  /**
   * A broad face (mat, panel, softbox, lens): the beam spreads from `apex` behind it and starts
   * at the face, `forward` cm in front of the light.
   */
  face?: { apex: Vec2; forward: number; width: number };
  /** Lantern or balloon skirt: quarters lowered (front, right, back, left) and the pool of light below them. */
  skirt?: { down: boolean[]; poolCm: number };
  /** Through a diffusion frame: where it is, how far from the lamp, and how the fabric spreads it. */
  frame?: { pos: Vec2; toFrame: number; rest: number; spread: number };
  /** Where the light gets to past the walls (null: no walls nearby). */
  reach: Vec2[] | null;
}

/** How strong a beam is drawn: dimmer, gels, and the light's output (a 1200 W HMI reads stronger than a small panel). */
export function beamAlpha(item: Item): number {
  const c = lightColor(item);
  const strength = Math.min(1, Math.max(0.15, (item.light?.intensityPct ?? 100) / 100));
  const output = Math.min(1.3, Math.max(0.55, 0.85 + 0.25 * Math.log10(lightLumens(item).lumens / 15000)));
  // A focusing light spotted in packs its light into less: brighter in the middle.
  const zoom = zoomRange(item);
  const spot = zoom ? Math.min(1.6, Math.max(1, (zoom[0] / lightBeamDeg(item)) ** 0.35)) : 1;
  return Math.max(0.05, 0.3 * strength * output * spot * Math.max(0.3, c.transmission));
}

export const beamDegOf = lightBeamDeg;

export function beamSpec(item: Item, lit: readonly Item[]): BeamSpec | null {
  if (item.kind !== 'light') return null;
  const throwCm = beamReach(item, lit);
  const deg = Math.min(360, beamDegOf(item));
  const src = lightSource(item, lit);
  const frameItem = src?.frameId ? lit.find((f) => f.id === src.frameId) : undefined;
  let frame: BeamSpec['frame'];
  if (frameItem && deg < 360) {
    const toFrame = Math.hypot(frameItem.pos.x - item.pos.x, frameItem.pos.y - item.pos.y);
    // Light grid keeps a narrower throw, 216 spreads about 160°.
    frame = { pos: frameItem.pos, toFrame, rest: Math.max(150, throwCm - toFrame), spread: 70 + 90 * (src!.scatter ?? 0.7) };
  }
  const f = lightFace(item);
  const face = deg < 360 && f.width >= 2 ? { apex: beamApex(item, deg), forward: f.forward, width: f.width } : undefined;
  const down = skirtDown(item);
  return {
    lightId: item.id,
    face,
    skirt: down ? { down, poolCm: skirtPoolCm(item) } : undefined,
    pos: item.pos,
    rotationDeg: item.rotationDeg,
    deg,
    throwCm,
    rgb: lightColor(item).rgb,
    alpha: beamAlpha(item),
    frame,
    reach: lightReach(item.pos, lit, throwCm * 1.6),
  };
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const RAD = Math.PI / 180;

/** Draws the beam in plan coordinates (the context already maps plan cm to the canvas). */
export function drawBeam(n: CanvasRenderingContext2D, b: BeamSpec) {
  const grad = (at: Vec2, radius: number, stops: [number, number][]) => {
    const g = n.createRadialGradient(at.x, at.y, 0, at.x, at.y, Math.max(1, radius));
    for (const [t, a] of stops) g.addColorStop(t, rgba(b.rgb, a));
    return g;
  };
  const falloff = (k: number): [number, number][] => [
    [0, b.alpha * k],
    [0.2, b.alpha * k * 0.75],
    [0.5, b.alpha * k * 0.4],
    [0.8, b.alpha * k * 0.15],
    [1, 0],
  ];
  /** A wedge around the light's direction (0 = up, clockwise), from `at`. */
  const wedge = (at: Vec2, radius: number, deg: number) => {
    const mid = (b.rotationDeg - 90) * RAD;
    n.beginPath();
    n.moveTo(at.x, at.y);
    n.arc(at.x, at.y, radius, mid - (deg / 2) * RAD, mid + (deg / 2) * RAD);
    n.closePath();
  };
  n.save();
  if (b.reach) {
    n.beginPath();
    b.reach.forEach((q, k) => (k ? n.lineTo(q.x, q.y) : n.moveTo(q.x, q.y)));
    n.closePath();
    n.clip();
  }
  if (b.frame) {
    n.fillStyle = grad(b.pos, b.frame.toFrame * 1.6, falloff(0.8));
    wedge(b.pos, b.frame.toFrame, b.deg);
    n.fill();
    n.fillStyle = grad(b.frame.pos, b.frame.rest, [
      [0, b.alpha * 0.7],
      [0.25, b.alpha * 0.45],
      [0.6, b.alpha * 0.15],
      [1, 0],
    ]);
    wedge(b.frame.pos, b.frame.rest, b.frame.spread);
    n.fill();
  } else if (b.deg >= 360) {
    // All round; behind a lowered skirt quarter only the pool straight below is lit.
    for (let k = 0; k < 4; k++) {
      const r = b.skirt?.down[k] ? b.skirt.poolCm : b.throwCm;
      const mid = (b.rotationDeg - 90 + k * 90) * RAD;
      n.fillStyle = grad(b.pos, r, falloff(1));
      n.beginPath();
      n.moveTo(b.pos.x, b.pos.y);
      n.arc(b.pos.x, b.pos.y, r, mid - Math.PI / 4, mid + Math.PI / 4);
      n.closePath();
      n.fill();
    }
  } else {
    // A broad face shines from all of it: each part of the beam spreads from behind the face so
    // its edges leave the face's two ends, kept to in front of the face, brightest at the face.
    const r = b.rotationDeg * RAD;
    const dir = { x: Math.sin(r), y: -Math.cos(r) };
    const at = b.face ? { x: b.pos.x + dir.x * b.face.forward, y: b.pos.y + dir.y * b.face.forward } : b.pos;
    const apexFor = (deg: number) => {
      if (!b.face) return b.pos;
      const back = b.face.width / 2 / Math.tan((Math.min(deg, 170) / 2) * RAD);
      return { x: at.x - dir.x * back, y: at.y - dir.y * back };
    };
    if (b.face) {
      const side = { x: -dir.y, y: dir.x };
      const far = b.throwCm * 3 + b.face.width;
      n.beginPath();
      n.moveTo(at.x + side.x * far, at.y + side.y * far);
      n.lineTo(at.x - side.x * far, at.y - side.y * far);
      n.lineTo(at.x - side.x * far + dir.x * far, at.y - side.y * far + dir.y * far);
      n.lineTo(at.x + side.x * far + dir.x * far, at.y + side.y * far + dir.y * far);
      n.closePath();
      n.clip();
    }
    // Soft edges: the full beam faint, its brighter core inside.
    for (const [k, share] of [
      [1, 0.55],
      [0.6, 0.6],
    ] as const) {
      const from = apexFor(b.deg * k);
      const reach = b.throwCm + Math.hypot(from.x - at.x, from.y - at.y);
      n.fillStyle = grad(at, b.throwCm, falloff(share));
      wedge(from, reach, b.deg * k);
      n.fill();
    }
  }
  n.restore();
}

/** The beam's bounds in plan cm (generous). */
export function beamBounds(b: BeamSpec): { x0: number; y0: number; x1: number; y1: number } {
  const r = b.frame ? b.frame.toFrame + b.frame.rest : b.throwCm + (b.face ? Math.hypot(b.face.apex.x - b.pos.x, b.face.apex.y - b.pos.y) + b.face.width : 0);
  return { x0: b.pos.x - r, y0: b.pos.y - r, x1: b.pos.x + r, y1: b.pos.y + r };
}
