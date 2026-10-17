// A light's beam on the plan, as data (so the light layer can draw it with its shadows cut out)
// and drawn straight onto a canvas. The beam is in the light's colour (temperature, HSI, gels),
// stronger for brighter lights, falling off with distance roughly as light does; through a
// diffusion frame the lamp's cone stops at the frame and the fabric spreads the light wide.
import { libraryItem } from '../library/items';
import { lightColor, type RGB } from '../model/color';
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
  return Math.max(0.05, 0.3 * strength * output * Math.max(0.3, c.transmission));
}

export const beamDegOf = (item: Item): number => item.light?.beamDeg ?? libraryItem(item.catalogId)?.beamDeg ?? 60;

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
  return {
    lightId: item.id,
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
    n.fillStyle = grad(b.pos, b.throwCm, falloff(1));
    n.beginPath();
    n.arc(b.pos.x, b.pos.y, b.throwCm, 0, Math.PI * 2);
    n.fill();
  } else {
    // Soft edges: the full beam faint, its brighter core inside.
    n.fillStyle = grad(b.pos, b.throwCm, falloff(0.55));
    wedge(b.pos, b.throwCm, b.deg);
    n.fill();
    n.fillStyle = grad(b.pos, b.throwCm, falloff(0.6));
    wedge(b.pos, b.throwCm, b.deg * 0.6);
    n.fill();
  }
  n.restore();
}

/** The beam's bounds in plan cm (generous). */
export function beamBounds(b: BeamSpec): { x0: number; y0: number; x1: number; y1: number } {
  const r = b.frame ? b.frame.toFrame + b.frame.rest : b.throwCm;
  return { x0: b.pos.x - r, y0: b.pos.y - r, x1: b.pos.x + r, y1: b.pos.y + r };
}
