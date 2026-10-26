// Draws the light on the plan: contact shadows, every light's shadows (see model/shadows.ts),
// then the beams on top, each with its own shadows cut out. So a light never lights its own
// shadow, while another light that still reaches the spot shows its colour there (a tungsten
// key's shadow under a blue backlight comes out blue-ish). While something is dragged or
// turned, the canvas passes live positions in, so all of it follows without waiting for the
// drop; only this layer redraws.
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
import { beamBounds, beamSpec, drawBeam, type BeamSpec } from './beams';
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

/** Canvases reused to draw one light at a time (at RES of the plan's size). */
const scratch: HTMLCanvasElement[] = [];
function scratchFor(target: Native, k = 0): CanvasRenderingContext2D | null {
  const c = (scratch[k] ??= document.createElement('canvas'));
  const w = Math.ceil(target.canvas.width * RES);
  const h = Math.ceil(target.canvas.height * RES);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c.getContext('2d');
}

type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** Plan-cm points' bounds on the target canvas (device pixels), padded and kept on the canvas. */
function deviceBounds(target: Native, pts: Iterable<Vec2>, pad: number): Bounds | null {
  const t = target.getTransform();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of pts) {
    const px = t.a * q.x + t.c * q.y + t.e;
    const py = t.b * q.x + t.d * q.y + t.f;
    [x0, y0, x1, y1] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py)];
  }
  x0 = Math.max(0, Math.floor(x0 - pad));
  y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(target.canvas.width, Math.ceil(x1 + pad));
  y1 = Math.min(target.canvas.height, Math.ceil(y1 + pad));
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/** Clears `b` on a scratch canvas and sets it to the plan's view at RES. */
function prepare(off: CanvasRenderingContext2D, target: Native, b: Bounds) {
  const t = target.getTransform();
  off.setTransform(1, 0, 0, 1, 0, 0);
  off.clearRect(b.x0 * RES - 1, b.y0 * RES - 1, (b.x1 - b.x0) * RES + 2, (b.y1 - b.y0) * RES + 2);
  off.setTransform(t.a * RES, t.b * RES, t.c * RES, t.d * RES, t.e * RES, t.f * RES);
}

/** Lays scratch area `b` onto the plan (optionally blurred). */
function present(target: Native, off: CanvasRenderingContext2D, b: Bounds, blurPx = 0) {
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  if (canBlur && blurPx > 0) target.filter = `blur(${blurPx.toFixed(1)}px)`;
  target.imageSmoothingEnabled = true;
  target.drawImage(off.canvas, b.x0 * RES, b.y0 * RES, (b.x1 - b.x0) * RES, (b.y1 - b.y0) * RES, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  target.restore();
}

/** Where all the source's points are blocked it's 1, where some are, a share (penumbra). */
function fillCoverage(off: CanvasRenderingContext2D, ls: LightShadows, withHot: boolean) {
  const s = ls.source;
  off.save();
  off.globalCompositeOperation = 'lighter';
  off.fillStyle = '#000';
  for (const g of ls.groups) {
    if (g.hot && !withHot) continue;
    // Through light diffusion the hot spot adds a harder shadow of its own.
    const hot = g.hot ? ((1 - (s.scatter ?? 1)) * 0.8 * darknessAt(15, s.subjectCm ?? s.throwCm)) / Math.max(0.05, darknessAt(s.sizeCm, s.subjectCm ?? s.throwCm)) : 0;
    off.globalAlpha = g.hot ? Math.min(1, hot) : 1 / ls.samples;
    off.beginPath();
    for (const poly of g.polys) polyPath(off, poly);
    off.fill('nonzero');
  }
  off.restore();
}

/** The light's beam, minus where its own light is blocked (its shadows). */
function drawBeamCut(target: Native, beam: BeamSpec, ls: LightShadows | undefined) {
  const bb = beamBounds(beam);
  const box = deviceBounds(target, [{ x: bb.x0, y: bb.y0 }, { x: bb.x1, y: bb.y0 }, { x: bb.x1, y: bb.y1 }, { x: bb.x0, y: bb.y1 }], 2);
  if (!box) return;
  if (!ls) {
    drawBeam(target, beam);
    return;
  }
  const off = scratchFor(target, 0);
  const cut = scratchFor(target, 1);
  if (!off || !cut) return drawBeam(target, beam);
  prepare(off, target, box);
  drawBeam(off, beam);
  // Its shadows, softened like they're drawn, taken out of the beam.
  prepare(cut, target, box);
  fillCoverage(cut, ls, false);
  off.save();
  off.setTransform(1, 0, 0, 1, 0, 0);
  off.globalCompositeOperation = 'destination-out';
  const spacing = ls.source.sizeCm / ls.samples;
  const blur = Math.min(8, Math.max(0.5, spacing * target.getTransform().a * RES * 0.55));
  if (canBlur) off.filter = `blur(${blur.toFixed(1)}px)`;
  const sx = box.x0 * RES;
  const sy = box.y0 * RES;
  const sw = (box.x1 - box.x0) * RES;
  const sh = (box.y1 - box.y0) * RES;
  off.drawImage(cut.canvas, sx, sy, sw, sh, sx, sy, sw, sh);
  off.restore();
  present(target, off, box);
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
  const from = s.beamApex ?? s.apex;
  const g = n.createConicGradient(mid - Math.PI, from.x, from.y);
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
  if (s.beamDeg >= 360 && s.skirt) {
    // Behind a lowered skirt quarter the light (and so its shadows) only reaches the pool below.
    for (let k = 0; k < 4; k++) {
      const r = s.skirt.down[k] ? s.skirt.poolCm : reach;
      const mid = ((s.rotationDeg - 90 + k * 90) * Math.PI) / 180;
      n.moveTo(s.apex.x, s.apex.y);
      n.arc(s.apex.x, s.apex.y, r, mid - Math.PI / 4 - 0.001, mid + Math.PI / 4 + 0.001);
      n.closePath();
    }
    return;
  }
  if (s.beamDeg >= 360) return n.arc(s.apex.x, s.apex.y, reach, 0, Math.PI * 2);
  const at = s.beamApex ?? s.apex;
  const mid = ((s.rotationDeg - 90) * Math.PI) / 180;
  const half = (Math.min(359, s.beamDeg * 1.2) * Math.PI) / 360;
  n.moveTo(at.x, at.y);
  n.arc(at.x, at.y, reach, mid - half, mid + half);
  n.closePath();
}

/**
 * Draws one light's shadows: each point of the source adds its share where it's blocked (so the
 * full shadow reaches full strength and the edges grade off), then the lot is faded by distance
 * and towards the beam's sides, kept to where the light gets past the walls, and laid on the plan
 * with a slight blur. Only the area the shadows cover is worked on.
 */
function drawShadows(target: Native, ls: LightShadows) {
  const s = ls.source;
  const scale = target.getTransform().a; // canvas pixels per cm
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
  const off = scratchFor(target, 0);
  const box = deviceBounds(target, ls.groups.flatMap((g) => g.polys.flat()), blur * 2 + 4);
  if (!off || !box) return;
  prepare(off, target, box);
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
  fillCoverage(off, ls, true);
  off.restore();
  // Fade by distance and towards the sides of the beam, over the shadows' bounds only (the
  // gradients live in plan space, so the box is mapped back into it).
  const inv = off.getTransform().inverse();
  const corners = [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x1, box.y1],
    [box.x0, box.y1],
  ].map(([x, y]) => inv.transformPoint(new DOMPoint(x! * RES, y! * RES)));
  off.save();
  off.globalCompositeOperation = 'destination-in';
  for (const m of [distanceMask(off, s), angleMask(off, s)]) {
    if (!m) continue;
    off.fillStyle = m;
    off.beginPath();
    corners.forEach((c, k) => (k ? off.lineTo(c.x, c.y) : off.moveTo(c.x, c.y)));
    off.closePath();
    off.fill();
  }
  off.restore();
  present(target, off, box, blur);
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

export function LightLayer({
  items,
  beamIds,
  showShadows,
  showBeams,
  extra = [],
  liveRef,
}: {
  items: Item[];
  /** Lights whose beams are drawn (hidden layers still light and cast shadows). */
  beamIds: ReadonlySet<string>;
  showShadows: boolean;
  showBeams: boolean;
  extra?: LightSource[];
  liveRef: MutableRefObject<ShadowLive | null>;
}) {
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

  const { lights, blobs, beams } = useMemo(() => {
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
    const beams = now.filter((i) => i.kind === 'light' && beamIds.has(i.id)).map((i) => beamSpec(i, now)).filter((b): b is BeamSpec => !!b);
    return { lights, blobs, beams };
  }, [items, live, extra, beamIds]);

  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const n = nativeOf(ctx);
        if (showShadows) {
          drawContact(n, blobs);
          for (const l of lights) drawShadows(n, l);
        }
        // Beams over the shadows, each cut where its own light is blocked.
        if (showBeams) for (const b of beams) drawBeamCut(n, b, showShadows ? lights.find((l) => l.source.lightId === b.lightId) : undefined);
      }}
    />
  );
}
