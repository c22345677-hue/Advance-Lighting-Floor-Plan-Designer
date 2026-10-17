// Draws the shadows (see model/shadows.ts) under everything on the plan. While something is
// dragged or turned, the canvas passes live positions in, so shadows follow without waiting
// for the drop; only this layer redraws.
//
// How they're drawn, so they read like light rather than cut-outs:
// - Each light's shadows from one point of its source are filled as one shape (their union, walls
//   included), so where two shadows of the same light overlap it isn't darker: light can't be
//   blocked twice. How dark they get depends on the distance from the source (bigger sources fill
//   shadows in close by), which a gradient across the union carries.
// - The points across a big source give the soft edge; a slight blur, sized to their spacing,
//   melts the steps between them.
// - Shadows fade with distance from the light (it is weaker out there, so they show less), and
//   soften at the sides of the beam, where the light falls off, instead of being cut straight.
// - People and props sit on a faint contact shadow, so they don't float.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Shape } from 'react-konva';
import type Konva from 'konva';
import { darknessAt, lightReach, occluders, sceneShadows, SHADOW_REACH, type LightSource, type ShadowShape } from '../model/shadows';
import type { Item, Vec2 } from '../model/types';

export type LivePatch = { pos?: Vec2; rot?: number };
/** Set live changes for some items, or `null` to clear them all. */
export type ShadowLive = (id: string | null, patch?: LivePatch) => void;

/** Canvas blur support (not in older Safari: the soft edge then comes from the samples alone). */
const canBlur = (() => {
  try {
    return typeof document !== 'undefined' && typeof document.createElement('canvas').getContext('2d')?.filter === 'string';
  } catch {
    return false;
  }
})();

type Native = CanvasRenderingContext2D;
const nativeOf = (ctx: Konva.Context) => (ctx as unknown as { _context: Native })._context;

function polyPath(n: Native, points: Vec2[]) {
  points.forEach((q, k) => (k ? n.lineTo(q.x, q.y) : n.moveTo(q.x, q.y)));
  n.closePath();
}

/** One light's shadows, grouped so each group is filled once (a union). */
interface LightShadows {
  source: LightSource;
  /** One group per point across the source (plus the hot spot through light diffusion). */
  groups: { hot: boolean; polys: Vec2[][] }[];
  samples: number;
  /** Where the light gets to past the walls (none: no walls nearby); its shadows stay inside. */
  reach: Vec2[] | null;
}

function groupShadows(source: LightSource, mine: ShadowShape[], items: readonly Item[]): LightShadows {
  const by = new Map<number, Vec2[][]>();
  const samples = new Set(mine.filter((sh) => (sh.sample ?? 0) >= 0).map((sh) => sh.sample ?? 0)).size || 1;
  for (const sh of mine) {
    // Walls don't throw a shadow on the plan: the light just stops there (see reach).
    if (sh.wall) continue;
    const k = sh.sample ?? 0;
    by.set(k, [...(by.get(k) ?? []), sh.points]);
  }
  const reach = source.clip ? null : lightReach(source.pos, items, source.throwCm * SHADOW_REACH);
  return { source, samples, reach, groups: [...by.entries()].map(([k, polys]) => ({ hot: k < 0, polys })) };
}

/** Shadows are drawn at this fraction of the plan's resolution (they're soft; it's 4× less work). */
const RES = 0.5;

/** A canvas, reused to draw one light's shadows at a time (at RES of the plan's size). */
let scratch: HTMLCanvasElement | null = null;
function scratchFor(target: Native): CanvasRenderingContext2D | null {
  scratch ??= document.createElement('canvas');
  const w = Math.ceil(target.canvas.width * RES);
  const h = Math.ceil(target.canvas.height * RES);
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  return scratch.getContext('2d');
}

/**
 * How dark the shadows are with distance from the source: a big source seen from close by fills
 * shadows in (see darknessAt), and out past the beam's reach the light is weak, so they fade.
 */
function distanceMask(n: Native, s: LightSource): CanvasGradient {
  const reach = s.throwCm * SHADOW_REACH;
  const g = n.createRadialGradient(s.pos.x, s.pos.y, 0, s.pos.x, s.pos.y, reach);
  const fade = (r: number) => (r <= s.throwCm ? 1 - 0.25 * (r / s.throwCm) ** 2 : 0.75 * (1 - (r - s.throwCm) / (reach - s.throwCm)) ** 1.4);
  const intensity = s.intensity ?? 1;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const r = t * reach;
    g.addColorStop(t, `rgba(0,0,0,${Math.max(0, Math.min(1, darknessAt(s.sizeCm, Math.max(20, r)) * fade(r) * intensity)).toFixed(3)})`);
  }
  return g;
}

/** Softens shadows towards the sides of the beam, where its light falls off (null: no conic gradients here). */
function angleMask(n: Native, s: LightSource): CanvasGradient | null {
  if (s.beamDeg >= 300 || typeof n.createConicGradient !== 'function') return null;
  const mid = ((s.rotationDeg - 90) * Math.PI) / 180;
  const g = n.createConicGradient(mid - Math.PI, s.apex.x, s.apex.y);
  const half = s.beamDeg / 720; // half the beam, as a share of a full turn
  const at = (k: number) => Math.min(0.5, half * k);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5 - at(1.18), 'rgba(0,0,0,0)');
  g.addColorStop(0.5 - at(1), 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5 - at(0.7), 'rgba(0,0,0,1)');
  g.addColorStop(0.5 + at(0.7), 'rgba(0,0,0,1)');
  g.addColorStop(0.5 + at(1), 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5 + at(1.18), 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  return g;
}

/** The beam as a clip, for when there's no conic gradient to soften its sides. */
function beamClip(n: Native, s: LightSource) {
  const reach = s.throwCm * SHADOW_REACH;
  if (s.beamDeg >= 360) return n.arc(s.apex.x, s.apex.y, reach, 0, Math.PI * 2);
  const mid = ((s.rotationDeg - 90) * Math.PI) / 180;
  const half = (Math.min(359, s.beamDeg * 1.2) * Math.PI) / 360;
  n.moveTo(s.apex.x, s.apex.y);
  n.arc(s.apex.x, s.apex.y, reach, mid - half, mid + half);
  n.closePath();
}

/**
 * Draws one light's shadows: each point of the source adds its share where it's blocked (so the
 * full shadow reaches full strength and the edges grade off), then the lot is faded by distance
 * and towards the beam's sides, kept to where the light gets past the walls, and laid on the plan
 * with a slight blur. Only the area the shadows cover is worked on.
 */
function drawLight(target: Native, ls: LightShadows) {
  const s = ls.source;
  const t = target.getTransform();
  const scale = t.a; // canvas pixels per cm
  // Blur about half the gap between neighbouring sample shadows (hard light: just anti-aliasing).
  const spacing = s.clip ? 0 : s.sizeCm / ls.samples;
  const blur = Math.min(16, Math.max(0.7, spacing * scale * 0.55));
  // Sunlight: drawn straight on, in its patch.
  if (s.clip) {
    target.save();
    target.beginPath();
    polyPath(target, s.clip);
    target.clip();
    if (canBlur) target.filter = `blur(${blur.toFixed(1)}px)`;
    target.globalAlpha = s.darkness;
    target.fillStyle = '#000';
    target.beginPath();
    for (const g of ls.groups) for (const poly of g.polys) polyPath(target, poly);
    target.fill('nonzero');
    target.restore();
    return;
  }
  const off = scratchFor(target);
  if (!off) return;
  // The shadows' bounds on the canvas (plus room for the blur).
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const g of ls.groups)
    for (const poly of g.polys)
      for (const q of poly) {
        const px = t.a * q.x + t.c * q.y + t.e;
        const py = t.b * q.x + t.d * q.y + t.f;
        [x0, y0, x1, y1] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py)];
      }
  const pad = blur * 2 + 4;
  x0 = Math.max(0, Math.floor(x0 - pad));
  y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(target.canvas.width, Math.ceil(x1 + pad));
  y1 = Math.min(target.canvas.height, Math.ceil(y1 + pad));
  if (x1 <= x0 || y1 <= y0) return;
  // Same view as the plan at RES, fresh for this light (only the part we use).
  off.setTransform(1, 0, 0, 1, 0, 0);
  off.clearRect(x0 * RES - 1, y0 * RES - 1, (x1 - x0) * RES + 2, (y1 - y0) * RES + 2);
  off.setTransform(t.a * RES, t.b * RES, t.c * RES, t.d * RES, t.e * RES, t.f * RES);
  off.save();
  off.beginPath();
  if (ls.reach) polyPath(off, ls.reach);
  else beamClip(off, s);
  off.clip();
  if (!angleMask(off, s) && ls.reach) {
    // No soft sides available: at least keep to the beam.
    off.beginPath();
    beamClip(off, s);
    off.clip();
  }
  // Adding up (not layering) the samples: where all of them are blocked it's fully dark.
  off.globalCompositeOperation = 'lighter';
  off.fillStyle = '#000';
  for (const g of ls.groups) {
    // Through light diffusion the hot spot adds a harder shadow of its own.
    const hot = g.hot ? ((1 - (s.scatter ?? 1)) * 0.8 * darknessAt(15, s.subjectCm ?? s.throwCm)) / Math.max(0.05, darknessAt(s.sizeCm, s.subjectCm ?? s.throwCm)) : 0;
    off.globalAlpha = g.hot ? Math.min(1, hot) : 1 / ls.samples;
    off.beginPath();
    for (const poly of g.polys) polyPath(off, poly);
    off.fill('nonzero');
  }
  off.restore();
  // Fade by distance and towards the sides of the beam, over the shadows' bounds only (the
  // gradients live in plan space, so the box is mapped back into it).
  const inv = off.getTransform().inverse();
  const box = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => inv.transformPoint(new DOMPoint(x! * RES, y! * RES)));
  off.save();
  off.globalCompositeOperation = 'destination-in';
  for (const m of [distanceMask(off, s), angleMask(off, s)]) {
    if (!m) continue;
    off.fillStyle = m;
    off.beginPath();
    box.forEach((c, k) => (k ? off.lineTo(c.x, c.y) : off.moveTo(c.x, c.y)));
    off.closePath();
    off.fill();
  }
  off.restore();
  // Lay it on the plan, blurred a little.
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  if (canBlur) target.filter = `blur(${blur.toFixed(1)}px)`;
  target.imageSmoothingEnabled = true;
  target.drawImage(off.canvas, x0 * RES, y0 * RES, (x1 - x0) * RES, (y1 - y0) * RES, x0, y0, x1 - x0, y1 - y0);
  target.restore();
}

/** Faint contact shadows under people and props (not walls or flags, which reach the floor everywhere). */
function drawContact(n: Native, blobs: { c: Vec2; r: number }[]) {
  n.save();
  for (const b of blobs) {
    const g = n.createRadialGradient(b.c.x, b.c.y, b.r * 0.2, b.c.x, b.c.y, b.r * 1.35);
    g.addColorStop(0, 'rgba(0,0,0,0.3)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = g;
    n.beginPath();
    n.arc(b.c.x, b.c.y, b.r * 1.35, 0, Math.PI * 2);
    n.fill();
  }
  n.restore();
}

export function ShadowLayer({ items, extra = [], liveRef }: { items: Item[]; extra?: LightSource[]; liveRef: MutableRefObject<ShadowLive | null> }) {
  const [live, setLive] = useState<Record<string, LivePatch>>({});
  const pending = useRef<Record<string, LivePatch> | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    liveRef.current = (id, patch) => {
      if (id === null) {
        pending.current = null;
        cancelAnimationFrame(frame.current);
        setLive({});
        return;
      }
      pending.current = { ...(pending.current ?? live), [id]: { ...(pending.current?.[id] ?? live[id]), ...patch } };
      // At most one redraw per frame.
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => pending.current && setLive(pending.current));
    };
    return () => {
      liveRef.current = null;
      cancelAnimationFrame(frame.current);
    };
  }, [liveRef, live]);

  // New saved positions replace live ones.
  useEffect(() => setLive({}), [items]);

  const { lights, blobs } = useMemo(() => {
    const ids = Object.keys(live);
    const now = ids.length
      ? items.map((i) => (live[i.id] ? { ...i, pos: live[i.id]!.pos ?? i.pos, rotationDeg: live[i.id]!.rot ?? i.rotationDeg } : i))
      : items;
    const { sources, shadows } = sceneShadows(now, extra);
    const lights = sources.map((s) => groupShadows(s, shadows.filter((sh) => sh.lightId === s.lightId), now)).filter((l) => l.groups.length);
    const blobs = occluders(now)
      .filter((o) => Number.isFinite(o.heightCm))
      .map((o) => {
        const c = o.points.reduce((a, q) => ({ x: a.x + q.x / o.points.length, y: a.y + q.y / o.points.length }), { x: 0, y: 0 });
        return { c, r: Math.max(...o.points.map((q) => Math.hypot(q.x - c.x, q.y - c.y))) };
      });
    return { lights, blobs };
  }, [items, live, extra]);

  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const n = nativeOf(ctx);
        drawContact(n, blobs);
        for (const l of lights) drawLight(n, l);
      }}
    />
  );
}
