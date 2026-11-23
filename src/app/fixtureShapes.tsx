// Lights and their modifiers seen from above, drawn at real size facing up (-y), modelled on
// the real gear: black anodised housings shaded as if lit from the upper left, knurled lock
// knobs, vent grilles, carry handles and yokes; Bowens rings in bare aluminium; a fresnel's
// stepped lens and four-leaf barn doors (tungsten fresnels in their classic blue); an
// ellipsoidal's lamp cap, shutter handles and lens tube; tubes with end caps and pixel
// sections; softboxes in black fabric with their rods; paper lanterns with their wire ribs.
// The part that gives light glows in the light's own colour (a blue tube glows blue, a dimmed
// light less), and a thin rim in the lights' category colour keeps them easy to pick out.
import type { ReactNode } from 'react';
import { Arc, Circle, Ellipse, Group, Line, Rect } from 'react-konva';
import { lightColor } from '../model/color';
import { lightStyle, isDome, modSize, modifierFront, modifierReach, skirtDown } from '../model/emitter';
import { itemLook, itemModifiers } from '../model/gear';

export { lightStyle, modifierFront, modifierReach };
import type { Item } from '../model/types';
import type { CanvasColors } from './theme';

// ---- Colours -------------------------------------------------------------------------

const rgbOf = (s: string): [number, number, number] | null => {
  const hex = /^#([0-9a-f]{6})$/i.exec(s.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s.trim());
  return m ? (m[1]!.split(',').slice(0, 3).map((x) => parseFloat(x)) as [number, number, number]) : null;
};

/** `a` moved `t` of the way to `b`. */
function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return a;
  const [r, g, bl] = x.map((v, k) => Math.round(v + (y[k]! - v) * t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Same lightness, no hue. */
function grey(s: string): string {
  const c = rgbOf(s);
  if (!c) return s;
  const y = Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
  return `rgb(${y}, ${y}, ${y})`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Housing finishes. */
const FINISH = {
  black: { base: '#2b2e33', hi: '#545a63', lo: '#141518' },
  // Tungsten fresnels: the classic blue.
  blue: { base: '#2c5c8f', hi: '#6a9bcd', lo: '#173556' },
} as const;
const ALU = { base: '#9ba2ab', hi: '#eef1f4', lo: '#555b63' };
const FABRIC = { base: '#202226', hi: '#3a3e45', lo: '#121315' };

/** Everything a fixture is drawn in. */
interface Look {
  shell: string;
  shellHi: string;
  shellLo: string;
  metal: string;
  metalHi: string;
  metalLo: string;
  fabric: string;
  fabricHi: string;
  fabricLo: string;
  /** Darkest lines: seams, slots, outlines. */
  edge: string;
  /** Category colour: the thin rim round the housing. */
  rim: string;
  /** The light's own colour, as it glows. */
  glow: string;
  /** Diffusion and lenses: a bright tint of the light's colour. */
  lit: string;
  /** Brightest: hot spots, the middle of a lit face. */
  hot: string;
  /** A lit diffuse surface turning away from us (gives balloons and pillows their form). */
  shade: string;
  /** Seams and wires on a lit surface. */
  seam: string;
  /** Soft glow round lit parts (off for outlines and greyed-out lights). */
  glowOn: boolean;
}

function look(item: Item, c: CanvasColors, muted: boolean, glowOn: boolean): Look {
  const tone: keyof typeof FINISH = TONE[item.catalogId ?? ''] ?? 'black';
  const f = FINISH[tone];
  const [r, g, b] = lightColor(item).rgb;
  const on = clamp((item.light?.intensityPct ?? 100) / 100, 0, 1);
  // Dimmed down, the face goes back towards dark glass.
  let glow = mix('#3c4046', `rgb(${r}, ${g}, ${b})`, 0.35 + 0.65 * on);
  // Saturated colours stay coloured even at their brightest; white light goes white.
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
  let lit = mix(glow, '#ffffff', 0.3 - 0.15 * sat);
  let hot = mix(glow, '#ffffff', 0.62 - 0.3 * sat);
  let shade = mix(lit, '#7d838c', 0.42);
  let seam = mix(glow, '#1d2024', 0.55);
  // Greyed out (another category is being edited): flat and quiet, nearer the canvas.
  const fade = (s: string) => (muted ? mix(grey(s), c.canvas, 0.3) : s);
  if (muted) [glow, lit, hot, shade, seam] = [fade(glow), fade(lit), fade(hot), fade(shade), fade(seam)];
  return {
    shell: fade(f.base),
    shellHi: fade(f.hi),
    shellLo: fade(f.lo),
    metal: fade(ALU.base),
    metalHi: fade(ALU.hi),
    metalLo: fade(ALU.lo),
    fabric: fade(FABRIC.base),
    fabricHi: fade(FABRIC.hi),
    fabricLo: fade(FABRIC.lo),
    edge: fade('#0c0d0f'),
    rim: c.light,
    glow,
    lit,
    hot,
    shade,
    seam,
    glowOn: glowOn && !muted && on > 0.02,
  };
}

/** Housing colour by fixture, where it isn't black. */
const TONE: Record<string, keyof typeof FINISH> = {
  'generic.light.fresnel': 'blue',
  'generic.light.fresnel-2k': 'blue',
  'generic.light.hmi-fresnel': 'blue',
};

// ---- Drawing helpers ---------------------------------------------------------------------

type Stops = (number | string)[];
/** Linear gradient across a Rect's width (its own coordinates start at 0). */
const gx = (w: number, stops: Stops) => ({ fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: w, y: 0 }, fillLinearGradientColorStops: stops });
/** …down a Rect's height. */
const gy = (h: number, stops: Stops) => ({ fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: 0, y: h }, fillLinearGradientColorStops: stops });
/** Linear gradient between two points, for shapes drawn in the item's own coordinates. */
const gAt = (x0: number, y0: number, x1: number, y1: number, stops: Stops) => ({
  fillLinearGradientStartPoint: { x: x0, y: y0 },
  fillLinearGradientEndPoint: { x: x1, y: y1 },
  fillLinearGradientColorStops: stops,
});
/** A round thing lit from the upper left. */
const dome = (r: number, stops: Stops) => ({
  fillRadialGradientStartPoint: { x: -r * 0.35, y: -r * 0.35 },
  fillRadialGradientStartRadius: 0,
  fillRadialGradientEndPoint: { x: 0, y: 0 },
  fillRadialGradientEndRadius: r,
  fillRadialGradientColorStops: stops,
});

/** A box-section housing: highlight on the left shoulder, shade on the right. */
const shellStops = (L: Look): Stops => [0, L.shellLo, 0.1, L.shellHi, 0.3, L.shell, 0.82, L.shell, 1, L.shellLo];
/** A cylinder seen from above: bright down its top. */
const tubeStops = (lo: string, hi: string, base: string): Stops => [0, lo, 0.28, base, 0.42, hi, 0.58, base, 1, lo];
const aluStops = (L: Look): Stops => tubeStops(L.metalLo, L.metalHi, L.metal);

/** The thin category-colour rim, the same few pixels whatever the zoom. */
const rim = (L: Look) => ({ stroke: L.rim, strokeWidth: 1.1, strokeScaleEnabled: false });
/** A hairline edge (fixed on screen). */
const hair = (color: string, px = 0.8) => ({ stroke: color, strokeWidth: px, strokeScaleEnabled: false });
/** A soft glow `blur` cm round something lit. */
const glowOf = (L: Look, blur: number) => (L.glowOn ? { shadowColor: L.glow, shadowBlur: blur, shadowOpacity: 0.95, shadowForStrokeEnabled: false } : {});

// ---- Shared parts ------------------------------------------------------------------------

/** A knurled lock knob seen from above. */
function Knob({ x, y, r, L }: { x: number; y: number; r: number; L: Look }) {
  return (
    <Group x={x} y={y}>
      <Circle radius={r} {...dome(r, [0, L.shellHi, 0.55, L.shell, 1, L.shellLo])} {...hair(L.edge)} />
      <Circle radius={r * 0.7} stroke={L.edge} strokeWidth={r * 0.22} dash={[r * 0.16, r * 0.16]} opacity={0.55} />
      <Circle radius={r * 0.3} {...dome(r * 0.3, [0, L.metalHi, 1, L.metalLo])} />
    </Group>
  );
}

/** A yoke seen from above: an arm beside each side of the head and a lock knob at the pivot. */
function SideYoke({ hw, y, len, size, L }: { hw: number; y: number; len: number; size: number; L: Look }) {
  const arm = clamp(size * 0.075, 0.9, 2.6);
  const knob = clamp(size * 0.1, 1.3, 3.6);
  return (
    <>
      {[-1, 1].map((s) => {
        const x = s < 0 ? -hw - arm - 0.3 : hw + 0.3;
        return (
          <Group key={s}>
            <Rect x={x} y={y - len / 2} width={arm} height={len} cornerRadius={arm / 2} {...gx(arm, tubeStops(L.shellLo, L.shellHi, L.shell))} {...hair(L.edge, 0.6)} />
            <Knob x={s * (hw + arm + knob * 0.75)} y={y} r={knob} L={L} />
          </Group>
        );
      })}
    </>
  );
}

/** A vent grille: a recessed panel with slots across it, each catching light on its far lip. */
function Grille({ x0, x1, y0, y1, L, glowing = 0 }: { x0: number; x1: number; y0: number; y1: number; L: Look; glowing?: number }) {
  const len = y1 - y0;
  const n = clamp(Math.floor(len / 1.6), 2, 14);
  const step = len / n;
  const slot = clamp(step * 0.42, 0.25, 1.1);
  return (
    <>
      <Rect x={x0} y={y0} width={x1 - x0} height={len} cornerRadius={Math.min(1.2, (x1 - x0) * 0.08)} fill={L.shellLo} opacity={0.75} />
      {Array.from({ length: n }, (_, k) => {
        const y = y0 + step * (k + 0.5);
        return (
          <Group key={k}>
            <Line points={[x0 + slot, y, x1 - slot, y]} stroke={glowing ? L.glow : L.edge} strokeWidth={slot} lineCap="round" opacity={glowing || 1} />
            <Line points={[x0 + slot, y + slot * 0.85, x1 - slot, y + slot * 0.85]} stroke={L.shellHi} strokeWidth={slot * 0.35} lineCap="round" opacity={0.6} />
          </Group>
        );
      })}
    </>
  );
}

/** A carry handle along the top: a round bar on two feet. */
function TopHandle({ y0, y1, w, L }: { y0: number; y1: number; w: number; L: Look }) {
  const foot = w * 1.3;
  return (
    <>
      {[y0, y1].map((y) => (
        <Rect key={y} x={-foot / 2} y={y - w * 0.3} width={foot} height={w * 0.6} cornerRadius={w * 0.25} fill={L.shellLo} opacity={0.8} />
      ))}
      <Rect x={-w / 2} y={y0} width={w} height={y1 - y0} cornerRadius={w / 2} {...gx(w, tubeStops(L.shellLo, L.shellHi, L.shell))} {...hair(L.edge, 0.6)} />
    </>
  );
}

/** A Bowens-type mount ring in bare aluminium, with its lock lever. */
function MountRing({ y, w, depth, L }: { y: number; w: number; depth: number; L: Look }) {
  return (
    <>
      <Rect x={w / 2 - depth * 0.4} y={y + depth * 0.15} width={depth * 1.6} height={depth * 0.7} cornerRadius={depth * 0.3} fill={L.shell} {...hair(L.edge, 0.6)} />
      <Rect x={-w / 2} y={y} width={w} height={depth} cornerRadius={Math.min(1.5, depth * 0.35)} {...gx(w, aluStops(L))} {...hair(L.edge, 0.7)} />
      {[-0.28, 0.28].map((k) => (
        <Rect key={k} x={w * k - depth * 0.45} y={y + depth * 0.2} width={depth * 0.9} height={depth * 0.6} fill={L.metalLo} opacity={0.8} />
      ))}
    </>
  );
}

/** The bare emitter's glass dome, just showing in front of the mount. */
function EmitterDome({ y, rx, ry, L }: { y: number; rx: number; ry: number; L: Look }) {
  const pts: number[] = [];
  for (let k = 0; k <= 12; k++) {
    const a = (Math.PI * k) / 12;
    pts.push(-Math.cos(a) * rx, y - Math.sin(a) * ry);
  }
  return <Line points={pts} closed {...gAt(0, y - ry, 0, y, [0, L.hot, 0.6, L.lit, 1, L.glow])} {...glowOf(L, Math.max(2, rx * 0.8))} />;
}

/** A lens or diffuser seen edge on: a bright band across the front. */
function LitBand({ x0, x1, y, t, L, blur }: { x0: number; x1: number; y: number; t: number; L: Look; blur?: number }) {
  return (
    <Rect
      x={x0}
      y={y - t / 2}
      width={x1 - x0}
      height={t}
      cornerRadius={t / 2}
      {...gy(t, [0, L.hot, 0.5, L.lit, 1, L.glow])}
      {...glowOf(L, blur ?? Math.max(2, (x1 - x0) * 0.08))}
    />
  );
}

/** Lowered skirt panels round a lantern or balloon: black fabric with a stitched edge on each quarter that's down. */
function SkirtArcs({ r, down, L }: { r: number; down: boolean[] | null; L: Look }) {
  if (!down) return null;
  const band = clamp(r * 0.16, 3, 10);
  return (
    <>
      {down.map((on, k) =>
        on ? (
          <Group key={k}>
            <Arc innerRadius={r} outerRadius={r + band} angle={88} rotation={-90 + k * 90 - 44} fill={L.fabric} {...hair(L.edge, 0.6)} />
            <Arc innerRadius={r + band * 0.78} outerRadius={r + band * 0.82} angle={84} rotation={-90 + k * 90 - 42} fill={L.fabricHi} />
          </Group>
        ) : null,
      )}
    </>
  );
}

/** Four-leaf barn doors in front of a lens: the top leaf seen nearly flat, the side leaves opened out. */
function BarnDoors({ y, w, depth, L }: { y: number; w: number; depth: number; L: Look }) {
  const hw = w / 2;
  const leaf = clamp(w * 0.035, 0.6, 2);
  return (
    <>
      {[-1, 1].map((s) => (
        <Group key={s}>
          <Line points={[s * hw * 0.98, y, s * hw * 1.4, y - depth]} stroke={L.shellLo} strokeWidth={leaf * 1.6} lineCap="round" />
          <Line points={[s * hw * 0.98, y, s * hw * 1.4, y - depth]} stroke={L.shellHi} strokeWidth={leaf * 0.45} lineCap="round" opacity={0.8} />
          <Circle x={s * hw * 0.98} y={y} radius={leaf * 0.9} {...dome(leaf, [0, L.metalHi, 1, L.metalLo])} />
        </Group>
      ))}
      {/* Top leaf, tilted up towards us: a trapezoid, lighter where it faces the sky. */}
      <Line
        points={[-hw * 0.9, y, hw * 0.9, y, hw * 1.02, y - depth * 0.92, -hw * 1.02, y - depth * 0.92]}
        closed
        {...gAt(0, y, 0, y - depth, [0, L.shellLo, 0.5, L.shell, 1, L.shellHi])}
        {...hair(L.edge, 0.7)}
      />
      <Line points={[-hw * 1.02, y - depth * 0.92, hw * 1.02, y - depth * 0.92]} stroke={L.metal} strokeWidth={leaf * 0.7} lineCap="round" opacity={0.75} />
      <Rect x={-hw * 1.02} y={y - leaf * 0.6} width={w * 1.04} height={leaf * 1.2} cornerRadius={leaf * 0.4} {...gx(w * 1.04, aluStops(L))} />
    </>
  );
}

/** A softbox from above: speed ring at the back, black fabric with its rods, the front diffusion lit. */
function Softbox({ y, ringW, w, depth, curved, L }: { y: number; ringW: number; w: number; depth: number; curved: boolean; L: Look }) {
  const hw = w / 2;
  const front = y - depth;
  // A deep dome's sides bow out like a parabola; a box's run straight.
  const sideAt = (t: number) => (curved ? ringW / 2 + (hw - ringW / 2) * Math.sqrt(t) : ringW / 2 + (hw - ringW / 2) * t);
  const outline: number[] = [];
  for (let k = 0; k <= 10; k++) outline.push(-sideAt(k / 10), y - (depth * k) / 10);
  for (let k = 10; k >= 0; k--) outline.push(sideAt(k / 10), y - (depth * k) / 10);
  const rods = curved ? [-0.72, -0.36, 0, 0.36, 0.72] : [-0.5, 0.5];
  const band = clamp(depth * 0.035, 0.8, 3);
  return (
    <>
      <Line points={outline} closed {...gAt(-hw, 0, hw, 0, [0, L.fabricLo, 0.18, L.fabricHi, 0.45, L.fabric, 1, L.fabricLo])} {...rim(L)} />
      {rods.map((k) => {
        const pts: number[] = [];
        for (let i = 0; i <= 8; i++) pts.push(k * sideAt(i / 8) * 0.96, y - (depth * i) / 8);
        return <Line key={k} points={pts} stroke={L.fabricHi} strokeWidth={clamp(w * 0.006, 0.25, 0.8)} opacity={0.9} />;
      })}
      {/* Seam just behind the front, where the diffusion's velcro edge sits. */}
      <Line points={[-sideAt(0.94), front + depth * 0.06, sideAt(0.94), front + depth * 0.06]} stroke={L.fabricLo} strokeWidth={band * 0.5} />
      <LitBand x0={-hw} x1={hw} y={front + band / 2} t={band} L={L} blur={Math.max(3, w * 0.05)} />
      <Rect x={-ringW / 2} y={y - 1.6} width={ringW} height={3.2} cornerRadius={1.2} {...gx(ringW, aluStops(L))} {...hair(L.edge, 0.6)} />
    </>
  );
}

/** A bare metal reflector: a polished cone, the lit rim of its mouth at the front. */
function Reflector({ y, ringW, w, depth, L }: { y: number; ringW: number; w: number; depth: number; L: Look }) {
  const hw = w / 2;
  const rw = ringW / 2;
  return (
    <>
      <Line points={[-rw, y, rw, y, hw, y - depth, -hw, y - depth]} closed {...gAt(-hw, 0, hw, 0, [0, L.metalLo, 0.22, L.metalHi, 0.4, L.metal, 0.7, L.metalLo, 0.88, L.metal, 1, L.metalLo])} {...rim(L)} />
      {[0.35, 0.7].map((k) => (
        <Line key={k} points={[-(rw + (hw - rw) * k), y - depth * k, rw + (hw - rw) * k, y - depth * k]} stroke={L.metalLo} strokeWidth={clamp(depth * 0.02, 0.2, 0.6)} opacity={0.7} />
      ))}
      <Line points={[-hw, y - depth, hw, y - depth]} stroke={L.metalHi} strokeWidth={clamp(depth * 0.05, 0.5, 1.6)} lineCap="round" />
      <LitBand x0={-hw * 0.94} x1={hw * 0.94} y={y - depth + clamp(depth * 0.06, 0.6, 2)} t={clamp(depth * 0.04, 0.4, 1.4)} L={L} />
    </>
  );
}

/** A paper lantern from above: glowing paper, its wire ribs, the opening and socket on top. */
function Lantern({ r, L, item }: { r: number; L: Look; item: Item }) {
  return (
    <>
      <Circle radius={r} fill={L.glow} opacity={L.glowOn ? 0.35 : 0} {...glowOf(L, r * 0.5)} />
      <Circle radius={r} {...dome(r, [0, L.hot, 0.45, L.lit, 0.9, L.shade, 1, mix(L.shade, L.seam, 0.4)])} {...rim(L)} />
      {[0.32, 0.56, 0.76, 0.91].map((k) => (
        <Circle key={k} radius={r * k} stroke={L.seam} strokeWidth={clamp(r * 0.014, 0.15, 0.6)} opacity={0.4} />
      ))}
      <Circle radius={r * 0.15} stroke={L.metalLo} strokeWidth={clamp(r * 0.02, 0.2, 0.8)} />
      <Circle radius={Math.max(0.8, r * 0.07)} {...dome(r * 0.07, [0, L.shellHi, 1, L.shellLo])} />
      <SkirtArcs r={r} down={skirtDown(item)} L={L} />
    </>
  );
}

// ---- Fixtures ----------------------------------------------------------------------------

/**
 * The light's own drawing (no modifiers), filling `w` × `d` around the origin, front up.
 * `muted`: greyed out (another category is being edited). `glow`: the soft glow round lit
 * parts (left off for outlines and thumbnails).
 */
export function FixtureShape({ item, w, d, c, muted = false, glow = true }: { item: Item; w: number; d: number; c: CanvasColors; muted?: boolean; glow?: boolean }) {
  const style = lightStyle(item);
  const L = look(item, c, muted, glow);
  const hw = w / 2;
  const hd = d / 2;
  switch (style) {
    case 'monolight':
    case 'compact':
    case 'cob-reflector': {
      // A COB head: (generic: its standard reflector,) the Bowens ring, the body with its top
      // handle, rear vent grille and yoke.
      const compact = style === 'compact';
      const refl = style === 'cob-reflector' ? d * 0.34 : 0;
      const ringD = compact ? clamp(d * 0.11, 1.2, 3) : clamp(d * 0.12, 2.2, 5.5);
      const ringW = compact ? w * 0.92 : Math.min(w * 1.06, Math.max(w * 0.9, 15));
      const top = -hd + refl;
      const bodyTop = top + ringD;
      const bodyLen = hd - bodyTop;
      const pivot = bodyTop + bodyLen * 0.4;
      const corner = Math.min(w, bodyLen) * (compact ? 0.26 : 0.13);
      return (
        <>
          <SideYoke hw={hw} y={pivot} len={bodyLen * 0.42} size={w} L={L} />
          <Rect x={-hw} y={bodyTop} width={w} height={bodyLen} cornerRadius={corner} {...gx(w, shellStops(L))} {...rim(L)} />
          {/* The flat top panel, a touch lighter than the shoulders. */}
          <Rect x={-hw * 0.78} y={bodyTop + bodyLen * 0.05} width={w * 0.78} height={bodyLen * 0.88} cornerRadius={corner * 0.7} fill={L.shellHi} opacity={0.12} />
          <Grille x0={-hw * 0.74} x1={hw * 0.74} y0={bodyTop + bodyLen * (compact ? 0.38 : 0.56)} y1={hd - bodyLen * 0.07} L={L} />
          {!compact && <TopHandle y0={bodyTop + bodyLen * 0.1} y1={bodyTop + bodyLen * 0.46} w={clamp(w * 0.13, 1.2, 4)} L={L} />}
          {compact && <Circle y={bodyTop + bodyLen * 0.2} radius={clamp(w * 0.07, 0.5, 1.5)} fill={L.glow} opacity={0.85} />}
          <MountRing y={top} w={ringW} depth={ringD} L={L} />
          {refl > 0 ? <Reflector y={top} ringW={ringW * 0.86} w={w * 1.6} depth={refl} L={L} /> : <EmitterDome y={top} rx={ringW * 0.24} ry={Math.max(ringD * 0.8, 1)} L={L} />}
        </>
      );
    }
    case 'cob-softbox': {
      // A COB head at the back, its softbox flaring out to the glowing front diffusion.
      const headW = Math.min(26, w * 0.3);
      const headLen = Math.min(32, d * 0.34);
      const top = hd - headLen;
      const ring = headW * 0.95;
      return (
        <>
          <SideYoke hw={headW / 2} y={top + headLen * 0.5} len={headLen * 0.4} size={headW} L={L} />
          <Rect x={-headW / 2} y={top + 1.5} width={headW} height={headLen - 1.5} cornerRadius={headW * 0.12} {...gx(headW, shellStops(L))} {...rim(L)} />
          <Grille x0={-headW * 0.37} x1={headW * 0.37} y0={top + headLen * 0.52} y1={hd - headLen * 0.08} L={L} />
          <TopHandle y0={top + headLen * 0.12} y1={top + headLen * 0.42} w={clamp(headW * 0.13, 1.2, 3.5)} L={L} />
          <Softbox y={top} ringW={ring} w={w} depth={d - headLen} curved={false} L={L} />
        </>
      );
    }
    case 'fresnel': {
      // Barn doors, the lens ring with the stepped glass showing, a body with a louvred lamp
      // house on top (a little light leaks through), the focus knob behind and the yoke.
      const doors = d * 0.2;
      const lensD = clamp(d * 0.075, 1.5, 4.5);
      const ringTop = -hd + doors;
      const bodyTop = ringTop + lensD;
      const bodyLen = hd - bodyTop - clamp(d * 0.04, 0.8, 2.5);
      const knob = clamp(w * 0.08, 1.2, 3.5);
      return (
        <>
          <SideYoke hw={hw} y={bodyTop + bodyLen * 0.42} len={bodyLen * 0.5} size={w} L={L} />
          <Rect x={-knob * 0.45} y={bodyTop + bodyLen - 1} width={knob * 0.9} height={knob * 1.4} fill={L.shellLo} />
          <Knob x={0} y={bodyTop + bodyLen + knob * 0.9} r={knob} L={L} />
          <Rect x={-hw} y={bodyTop} width={w} height={bodyLen} cornerRadius={[1, 1, w * 0.16, w * 0.16]} {...gx(w, shellStops(L))} {...rim(L)} />
          {/* Lamp house: a raised, louvred chimney. */}
          <Rect x={-hw * 0.62} y={bodyTop + bodyLen * 0.22} width={w * 0.62} height={bodyLen * 0.56} cornerRadius={w * 0.05} {...gx(w * 0.62, shellStops(L))} {...hair(L.edge, 0.7)} />
          <Grille x0={-hw * 0.52} x1={hw * 0.52} y0={bodyTop + bodyLen * 0.27} y1={bodyTop + bodyLen * 0.73} L={L} glowing={0.5} />
          {/* Accessory clips each side of the lens ring. */}
          {[-1, 1].map((s) => (
            <Rect key={s} x={s < 0 ? -hw * 1.12 : hw * 1.02} y={ringTop + lensD * 0.15} width={w * 0.1} height={lensD * 0.7} cornerRadius={0.4} fill={L.metalLo} />
          ))}
          <Rect x={-hw * 1.04} y={ringTop} width={w * 1.08} height={lensD} cornerRadius={lensD / 3} {...gx(w * 1.08, shellStops(L))} {...hair(L.edge, 0.7)} />
          <LitBand x0={-hw * 0.82} x1={hw * 0.82} y={ringTop - 0.2} t={clamp(lensD * 0.45, 0.6, 1.8)} L={L} />
          <BarnDoors y={ringTop - 0.4} w={w * 0.98} depth={doors * 0.92} L={L} />
        </>
      );
    }
    case 'par': {
      // An HMI PAR: the wide lens ring at the front, a can rounding off at the back with its
      // cooling fins following the curve, a handle along the top, the yoke at the sides.
      const ring = clamp(d * 0.1, 2, 6);
      const bodyTop = -hd + ring;
      const bodyLen = hd - bodyTop - d * 0.06;
      const bw = w * 0.94;
      const fins = clamp(Math.floor(bodyLen * 0.45 / 1.8), 3, 10);
      return (
        <>
          <SideYoke hw={bw / 2} y={bodyTop + bodyLen * 0.38} len={bodyLen * 0.45} size={w} L={L} />
          <Rect x={-w * 0.13} y={hd - d * 0.09} width={w * 0.26} height={d * 0.09} cornerRadius={1} {...gx(w * 0.26, shellStops(L))} />
          <Rect x={-bw / 2} y={bodyTop} width={bw} height={bodyLen} cornerRadius={[1, 1, bw * 0.45, bw * 0.45]} {...gx(bw, shellStops(L))} {...rim(L)} />
          {Array.from({ length: fins }, (_, k) => {
            const t = (k + 0.5) / fins;
            const y = bodyTop + bodyLen * (0.5 + t * 0.44);
            // How wide the can is here, as it rounds off.
            const across = (bw / 2) * Math.sqrt(Math.max(0, 1 - ((y - (hd - d * 0.06 - bw * 0.45)) / (bw * 0.45)) ** 2));
            const half = Math.min(bw / 2, across) * 0.8;
            return half > 0.5 ? <Line key={k} points={[-half, y, half, y]} stroke={L.edge} strokeWidth={clamp(bodyLen * 0.012, 0.25, 0.8)} lineCap="round" /> : null;
          })}
          <TopHandle y0={bodyTop + bodyLen * 0.08} y1={bodyTop + bodyLen * 0.42} w={clamp(w * 0.08, 1.2, 3.5)} L={L} />
          <Rect x={-hw * 1.03} y={-hd} width={w * 1.03} height={ring} cornerRadius={ring / 3} {...gx(w * 1.03, shellStops(L))} {...hair(L.edge, 0.7)} />
          <LitBand x0={-hw * 0.86} x1={hw * 0.86} y={-hd + 0.2} t={clamp(ring * 0.4, 0.6, 2)} L={L} />
        </>
      );
    }
    case 'spot': {
      if (item.catalogId === 'generic.light.leko') {
        // Ellipsoidal (Source Four style): lamp cap and burner knob at the back, the round
        // reflector housing, the shutter barrel with its handles sticking out, the lens tube
        // with its focus knob, and the gel frame holder at the front.
        const tubeW = w * 0.42;
        const barrelW = w * 0.54;
        const cap = w * 0.14;
        const reflY = hd - d * 0.22;
        const barrel0 = -hd + d * 0.42;
        const barrel1 = hd - d * 0.36;
        const handle = clamp(w * 0.07, 0.8, 2.4);
        return (
          <>
            <Rect x={-cap * 0.7} y={hd - cap * 1.9} width={cap * 1.4} height={cap * 1.9} cornerRadius={cap * 0.5} {...gx(cap * 1.4, tubeStops(L.shellLo, L.shellHi, L.shell))} {...rim(L)} />
            <Grille x0={-cap * 0.5} x1={cap * 0.5} y0={hd - cap * 1.6} y1={hd - cap * 0.6} L={L} glowing={0.35} />
            <Rect x={-cap * 0.3} y={hd - cap * 0.5} width={cap * 0.6} height={cap * 0.5} fill={L.metalLo} />
            <Ellipse y={reflY} radiusX={w * 0.4} radiusY={d * 0.15} {...dome(w * 0.4, [0, L.shellHi, 0.55, L.shell, 1, L.shellLo])} {...rim(L)} />
            {/* Spun reflector housing: a ring of light catching its curve. */}
            <Ellipse y={reflY} radiusX={w * 0.29} radiusY={d * 0.105} stroke={L.shellHi} strokeWidth={clamp(w * 0.01, 0.2, 0.6)} opacity={0.5} />
            <SideYoke hw={barrelW / 2} y={(barrel0 + barrel1) / 2 + d * 0.04} len={d * 0.12} size={w * 0.6} L={L} />
            {/* Shutter handles: left, right and the top one, pointing at us. */}
            {[-1, 1].map((s) => (
              <Group key={s}>
                <Rect x={s < 0 ? -hw * 0.98 : barrelW / 2} y={barrel0 + d * 0.025 + (s < 0 ? 0 : d * 0.03)} width={hw * 0.98 - barrelW / 2} height={handle * 0.55} fill={L.metalLo} />
                <Circle x={s * hw * 0.98} y={barrel0 + d * 0.025 + (s < 0 ? 0 : d * 0.03) + handle * 0.27} radius={handle * 0.6} {...dome(handle * 0.6, [0, L.shellHi, 1, L.shellLo])} />
              </Group>
            ))}
            <Rect x={-barrelW / 2} y={barrel0} width={barrelW} height={barrel1 - barrel0} cornerRadius={1} {...gx(barrelW, tubeStops(L.shellLo, L.shellHi, L.shell))} {...rim(L)} />
            <Rect x={-barrelW * 0.18} y={barrel0 + d * 0.04} width={barrelW * 0.36} height={d * 0.035} cornerRadius={0.4} {...gx(barrelW * 0.36, aluStops(L))} />
            <Rect x={-barrelW / 2 - 0.3} y={barrel1 - d * 0.04} width={barrelW + 0.6} height={d * 0.03} {...gx(barrelW + 0.6, aluStops(L))} />
            <Rect x={-tubeW / 2} y={-hd + d * 0.05} width={tubeW} height={barrel0 - (-hd + d * 0.05) + 0.5} {...gx(tubeW, tubeStops(L.shellLo, L.shellHi, L.shell))} {...rim(L)} />
            <Knob x={tubeW / 2 + handle * 0.7} y={-hd + d * 0.24} r={handle * 0.65} L={L} />
            <Rect x={-w * 0.3} y={-hd + d * 0.02} width={w * 0.6} height={d * 0.045} cornerRadius={0.5} {...gx(w * 0.6, shellStops(L))} {...hair(L.edge, 0.7)} />
            <LitBand x0={-tubeW * 0.42} x1={tubeW * 0.42} y={-hd + d * 0.02} t={clamp(d * 0.012, 0.4, 1)} L={L} />
          </>
        );
      }
      // Focusing LED spot: the finned head at the back, a lens barrel forward with its knurled
      // focus ring and the glass at the front.
      const headLen = d * 0.48;
      const barrelW = w * 0.74;
      const headTop = hd - headLen;
      return (
        <>
          <SideYoke hw={hw} y={headTop + headLen * 0.42} len={headLen * 0.45} size={w} L={L} />
          <Rect x={-barrelW / 2} y={-hd} width={barrelW} height={d - headLen + 1} cornerRadius={0.8} {...gx(barrelW, tubeStops(L.shellLo, L.shellHi, L.shell))} {...rim(L)} />
          <Rect x={-barrelW / 2 - 0.5} y={-hd + d * 0.14} width={barrelW + 1} height={d * 0.09} {...gx(barrelW + 1, aluStops(L))} />
          <Rect x={-barrelW / 2 - 0.5} y={-hd + d * 0.14} width={barrelW + 1} height={d * 0.09} stroke={L.metalLo} strokeWidth={d * 0.09} dash={[0.35, 0.35]} opacity={0.5} />
          <Rect x={-hw * 0.84} y={-hd} width={w * 0.84} height={d * 0.04} cornerRadius={0.4} {...gx(w * 0.84, shellStops(L))} />
          <LitBand x0={-barrelW * 0.38} x1={barrelW * 0.38} y={-hd + 0.1} t={clamp(d * 0.02, 0.4, 1)} L={L} />
          <Rect x={-hw} y={headTop} width={w} height={headLen} cornerRadius={w * 0.12} {...gx(w, shellStops(L))} {...rim(L)} />
          <Grille x0={-hw * 0.72} x1={hw * 0.72} y0={headTop + headLen * 0.4} y1={hd - headLen * 0.08} L={L} />
        </>
      );
    }
    case 'panel':
    case 'ring':
    case 'pocket': {
      // Seen edge on: the slab with its diffuser lit at the front, heat-sink fins along the
      // back, the control box behind the middle, on a U yoke.
      const t = Math.max(d, 1.6);
      const ht = t / 2;
      const face = clamp(t * 0.24, 0.5, 3);
      const finsBack = style === 'panel' && t >= 5;
      const pitch = clamp(t * 0.35, 1.2, 2.5);
      const fins = finsBack ? Math.floor((w - 4) / pitch) : 0;
      return (
        <>
          {style !== 'pocket' && <UYoke hw={hw} back={ht} L={L} size={w} />}
          {style === 'panel' && w >= 25 && t >= 5 && (
            <Group>
              <Rect x={-w * 0.12} y={ht - 0.5} width={w * 0.24} height={t * 0.55} cornerRadius={0.8} {...gx(w * 0.24, shellStops(L))} {...hair(L.edge, 0.6)} />
              <Rect x={-w * 0.07} y={ht + t * 0.12} width={w * 0.1} height={t * 0.2} cornerRadius={0.3} fill="#8fd6ff" opacity={L.glowOn ? 0.9 : 0.4} />
            </Group>
          )}
          {style === 'ring' && <Rect x={-w * 0.05} y={ht - 0.5} width={w * 0.1} height={t * 3} cornerRadius={0.6} {...gx(w * 0.1, tubeStops(L.shellLo, L.shellHi, L.shell))} />}
          <Rect x={-hw} y={-ht} width={w} height={t} cornerRadius={style === 'ring' ? ht : Math.min(ht, style === 'pocket' ? 1.2 : 1)} {...gy(t, [0, L.shellHi, 0.35, L.shell, 1, L.shellLo])} {...rim(L)} />
          {Array.from({ length: fins }, (_, k) => {
            const x = -hw + 2 + pitch * (k + 0.5);
            return <Line key={k} points={[x, -ht + face + t * 0.12, x, ht - t * 0.06]} stroke={L.edge} strokeWidth={pitch * 0.35} opacity={0.75} />;
          })}
          {style === 'pocket' &&
            [-0.25, 0, 0.25].map((k) => <Circle key={k} x={w * k} y={ht * 0.25} radius={Math.min(0.5, t * 0.16)} fill={L.shellHi} />)}
          <LitBand x0={-hw + Math.min(1.5, w * 0.05)} x1={hw - Math.min(1.5, w * 0.05)} y={-ht + face / 2 + 0.1} t={face} L={L} blur={Math.max(2, w * 0.06)} />
        </>
      );
    }
    case 'tube': {
      // A tube from above: the lit diffuser along the front half, the black spine behind, pixel
      // sections, end caps with the control end's little screen, the mounting clip in the middle.
      const t = Math.max(d, 3);
      const cap = Math.min(4.5, Math.max(1.2, w * 0.05));
      const pix = clamp(Math.round(w / 7.5), 4, 16);
      return (
        <>
          <Rect x={-2.5} y={t / 2 - 0.6} width={5} height={2.6} cornerRadius={0.8} {...gx(5, aluStops(L))} />
          <Rect x={-hw} y={-t / 2} width={w} height={t} cornerRadius={t / 2} {...gy(t, [0, L.hot, 0.3, L.lit, 0.52, L.glow, 0.56, L.shellHi, 0.72, L.shell, 1, L.shellLo])} {...glowOf(L, Math.max(2.5, t * 1.4))} />
          {Array.from({ length: pix - 1 }, (_, k) => {
            const x = -hw + cap + ((w - cap * 2) / pix) * (k + 1);
            return <Line key={k} points={[x, -t / 2 + 0.2, x, 0]} stroke={L.glow} strokeWidth={clamp(t * 0.06, 0.12, 0.3)} opacity={0.6} />;
          })}
          {[-1, 1].map((s) => (
            <Rect key={s} x={s < 0 ? -hw : hw - cap} y={-t / 2} width={cap} height={t} cornerRadius={s < 0 ? [t / 2, 0, 0, t / 2] : [0, t / 2, t / 2, 0]} {...gy(t, [0, L.shellHi, 0.45, L.shell, 1, L.shellLo])} />
          ))}
          <Rect x={hw - cap * 0.85} y={-t * 0.18} width={cap * 0.5} height={t * 0.36} cornerRadius={0.2} fill="#8fd6ff" opacity={L.glowOn ? 0.85 : 0.35} />
          <Rect x={-hw} y={-t / 2} width={w} height={t} cornerRadius={t / 2} {...rim(L)} />
        </>
      );
    }
    case 'mat': {
      // A flexible mat in its frame, seen edge on: the lit fabric face, the aluminium frame, the
      // X bracket meeting at the stand behind, the control box hanging off one side.
      const t = Math.max(d, 2.5);
      const gap = clamp(w * 0.12, 6, 20);
      const hub = clamp(w * 0.022, 1.4, 3);
      return (
        <>
          {[-1, 1].map((s) => (
            <Group key={s}>
              <Line points={[s * hw * 0.62, t / 2, 0, t / 2 + gap]} stroke={L.metalLo} strokeWidth={clamp(w * 0.014, 0.9, 2)} lineCap="round" />
              <Line points={[s * hw * 0.62, t / 2, 0, t / 2 + gap]} stroke={L.metalHi} strokeWidth={clamp(w * 0.005, 0.3, 0.7)} lineCap="round" opacity={0.7} />
            </Group>
          ))}
          <Knob x={0} y={t / 2 + gap} r={hub} L={L} />
          <Rect x={hw - Math.min(14, w * 0.14)} y={t / 2 + 0.6} width={Math.min(11, w * 0.11)} height={4.2} cornerRadius={0.8} {...gx(Math.min(11, w * 0.11), shellStops(L))} {...hair(L.edge, 0.6)} />
          <Rect x={hw - Math.min(12.5, w * 0.125)} y={t / 2 + 1.4} width={Math.min(4, w * 0.04)} height={1.6} cornerRadius={0.2} fill="#8fd6ff" opacity={L.glowOn ? 0.85 : 0.35} />
          <Rect x={-hw - 1} y={-t / 2 + t * 0.35} width={w + 2} height={t * 0.65} cornerRadius={0.6} {...gy(t * 0.65, aluStops(L))} {...rim(L)} />
          <LitBand x0={-hw} x1={hw} y={-t / 2 + t * 0.22} t={t * 0.44} L={L} blur={Math.max(3, w * 0.05)} />
        </>
      );
    }
    case 'air-panel': {
      // Inflatable soft panel, usually rigged overhead: an air-filled rim round the quilted
      // face, the blower box in the middle, D-rings at the corners for rigging.
      const rimW = clamp(Math.min(w, d) * 0.07, 3, 12);
      const q = clamp(Math.round(w / 40), 2, 6);
      const fan = clamp(Math.min(w, d) * 0.06, 3, 9);
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={rimW * 1.6} fill={L.glow} opacity={L.glowOn ? 0.4 : 0} {...glowOf(L, Math.min(w, d) * 0.12)} />
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={rimW * 1.6} {...dome(Math.max(w, d) * 0.8, [0, L.hot, 0.55, L.lit, 1, L.shade])} {...rim(L)} />
          {/* The air-filled rim: a fat tube, shaded on its inner side, catching light on top. */}
          <Rect x={-hw + rimW} y={-hd + rimW} width={w - rimW * 2} height={d - rimW * 2} cornerRadius={rimW} stroke={L.shade} strokeWidth={rimW * 0.5} opacity={0.75} />
          <Rect x={-hw + rimW * 0.45} y={-hd + rimW * 0.45} width={w - rimW * 0.9} height={d - rimW * 0.9} cornerRadius={rimW * 1.3} stroke={L.hot} strokeWidth={rimW * 0.18} opacity={0.9} />
          {Array.from({ length: q - 1 }, (_, k) => {
            const x = -hw + rimW + ((w - rimW * 2) / q) * (k + 1);
            const y = -hd + rimW + ((d - rimW * 2) / q) * (k + 1);
            return (
              <Group key={k}>
                <Line points={[x, -hd + rimW * 1.3, x, hd - rimW * 1.3]} stroke={L.seam} strokeWidth={clamp(w * 0.004, 0.3, 1)} opacity={0.35} dash={[3, 2]} />
                <Line points={[-hw + rimW * 1.3, y, hw - rimW * 1.3, y]} stroke={L.seam} strokeWidth={clamp(w * 0.004, 0.3, 1)} opacity={0.35} dash={[3, 2]} />
              </Group>
            );
          })}
          <Rect x={-fan * 1.3} y={-fan} width={fan * 2.6} height={fan * 2} cornerRadius={fan * 0.3} {...gx(fan * 2.6, shellStops(L))} {...hair(L.edge, 0.7)} />
          <Circle radius={fan * 0.7} stroke={L.edge} strokeWidth={fan * 0.3} dash={[fan * 0.12, fan * 0.12]} opacity={0.8} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <Circle key={`${sx}${sy}`} x={sx * (hw - rimW * 0.4)} y={sy * (hd - rimW * 0.4)} radius={clamp(rimW * 0.28, 0.8, 2.5)} stroke={L.metal} strokeWidth={clamp(rimW * 0.1, 0.3, 0.8)} />))}
        </>
      );
    }
    case 'air-tube': {
      // Inflatable tube in air-filled chambers, the blower at one end.
      const t = Math.max(d, 6);
      const n = clamp(Math.round(w / 20), 2, 10);
      return (
        <>
          <Rect x={-hw} y={-t / 2} width={w} height={t} cornerRadius={t / 2} {...gy(t, [0, L.shade, 0.25, L.hot, 0.5, L.lit, 1, L.shade])} {...glowOf(L, t * 0.8)} {...rim(L)} />
          {Array.from({ length: n - 1 }, (_, k) => {
            const x = -hw + (w / n) * (k + 1);
            return <Line key={k} points={[x, -t / 2 + 0.6, x, t / 2 - 0.6]} stroke={L.seam} strokeWidth={clamp(t * 0.05, 0.3, 1.2)} opacity={0.45} />;
          })}
          <Rect x={hw - t * 0.4} y={-t * 0.3} width={t * 0.55} height={t * 0.6} cornerRadius={t * 0.12} {...gx(t * 0.55, shellStops(L))} />
        </>
      );
    }
    case 'balloon': {
      // A lit balloon from above: its gores meeting at the top, the rigging ring there.
      const r = Math.max(hw, 4);
      return (
        <>
          <Circle radius={r} fill={L.glow} opacity={L.glowOn ? 0.35 : 0} {...glowOf(L, r * 0.45)} />
          <Circle radius={r} {...dome(r, [0, L.hot, 0.45, L.lit, 0.88, L.shade, 1, mix(L.shade, L.seam, 0.4)])} {...rim(L)} />
          {Array.from({ length: 8 }, (_, k) => {
            const a = (k * Math.PI) / 4;
            return <Line key={k} points={[Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12, Math.cos(a) * r, Math.sin(a) * r]} stroke={L.seam} strokeWidth={clamp(r * 0.014, 0.15, 0.7)} opacity={0.35} />;
          })}
          <Circle radius={r * 0.12} stroke={L.metal} strokeWidth={clamp(r * 0.03, 0.3, 1.2)} />
          <SkirtArcs r={r} down={skirtDown(item)} L={L} />
        </>
      );
    }
    case 'lantern':
      return <Lantern r={hw} L={L} item={item} />;
    case 'practical': {
      // A table lamp from above: the shade glowing from inside, the bulb through its top
      // opening, the harp and finial across the middle.
      const r = hw;
      const top = r * 0.62;
      const shade = mix('#efe3c8', L.lit, 0.45);
      return (
        <>
          <Circle radius={r} fill={L.glow} opacity={L.glowOn ? 0.3 : 0} {...glowOf(L, r * 0.35)} />
          <Circle radius={r} {...dome(r, [0, L.hot, 0.6, shade, 1, mix(shade, '#7a6a52', 0.35)])} {...rim(L)} />
          <Circle radius={top} fill={mix(L.glow, '#000000', 0.35)} {...hair(L.edge, 0.6)} />
          <Circle radius={top * 0.42} {...dome(top * 0.42, [0, '#ffffff', 0.5, L.hot, 1, L.lit])} {...glowOf(L, top * 0.4)} />
          <Line points={[-top, 0, top, 0]} stroke={L.metalLo} strokeWidth={clamp(r * 0.02, 0.2, 0.6)} />
          <Circle radius={clamp(r * 0.06, 0.4, 1.4)} {...dome(r * 0.06, [0, L.metalHi, 1, L.metalLo])} />
        </>
      );
    }
    case 'bulb':
    default: {
      // A bulb from above: the glowing glass dome, brightest in the middle.
      const r = Math.max(hw, 3.5);
      return (
        <>
          <Circle radius={r} {...dome(r, [0, '#ffffff', 0.3, L.hot, 0.75, L.lit, 1, L.shade])} {...glowOf(L, r * 0.7)} {...rim(L)} />
          <Circle radius={r * 0.82} stroke={L.seam} strokeWidth={clamp(r * 0.03, 0.1, 0.4)} opacity={0.3} />
          <Circle x={-r * 0.3} y={-r * 0.32} radius={r * 0.18} fill="#ffffff" opacity={0.7} />
        </>
      );
    }
  }
}

/** A panel-style U yoke from behind: arms at both ends, the cross bar behind, the stand spigot in the middle. */
function UYoke({ hw, back, L, size }: { hw: number; back: number; L: Look; size: number }) {
  const gap = clamp(size * 0.07, 2.5, 9);
  const arm = clamp(size * 0.028, 0.9, 2.4);
  const x = hw + arm * 0.8;
  return (
    <>
      <Line points={[-x, 0, -x, back + gap, x, back + gap, x, 0]} stroke={L.shellLo} strokeWidth={arm} lineJoin="round" />
      <Line points={[-x, 0, -x, back + gap, x, back + gap, x, 0]} stroke={L.shellHi} strokeWidth={arm * 0.3} lineJoin="round" opacity={0.7} />
      <Knob x={-x} y={0} r={arm * 1.35} L={L} />
      <Knob x={x} y={0} r={arm * 1.35} L={L} />
      <Circle y={back + gap} radius={arm * 1.6} {...dome(arm * 1.6, [0, L.metalHi, 0.6, L.metal, 1, L.metalLo])} {...hair(L.edge, 0.6)} />
    </>
  );
}

// ---- Modifiers ---------------------------------------------------------------------------

/** Modifiers stacked in front of the light (towards -y), in the order they're fitted. */
export function ModifierShapes({ item, front, lightW, c, muted = false, glow = true }: { item: Item; front: number; lightW: number; c: CanvasColors; muted?: boolean; glow?: boolean }) {
  const L = look(item, c, muted, glow);
  let y = front;
  // Width of whatever is at the front now (a grid or doors fit the softbox before them).
  let frontW = lightW;
  const out: ReactNode[] = [];
  for (const m of itemModifiers(item)) {
    const size = modSize(m, frontW);
    if (!size) continue;
    const { w, depth } = size;
    const hw = w / 2;
    const ring = Math.min(lightW * 0.9, 16);
    switch (m.type) {
      case 'dome': {
        // Diffusion ball: an opal glass sphere on a short neck.
        const r = hw;
        out.push(
          <Group key={m.id}>
            <Rect x={-ring / 3} y={y - r * 0.35} width={(ring * 2) / 3} height={r * 0.35} {...gx((ring * 2) / 3, aluStops(L))} />
            <Circle y={y - r * 0.25 - r} radius={r} {...dome(r, [0, '#ffffff', 0.35, L.hot, 0.8, L.lit, 1, L.shade])} {...glowOf(L, r * 0.6)} {...rim(L)} />
          </Group>,
        );
        y -= depth;
        frontW = w;
        break;
      }
      case 'softbox':
        out.push(<Softbox key={m.id} y={y} ringW={ring} w={w} depth={depth} curved={isDome(m)} L={L} />);
        y -= depth;
        frontW = w;
        break;
      case 'reflector':
        out.push(<Reflector key={m.id} y={y} ringW={ring} w={w} depth={depth} L={L} />);
        y -= depth;
        frontW = w;
        break;
      case 'parallel-beam': {
        // Deep parabolic dish in polished aluminium, the light's rod reaching forward to the focus.
        const curve: number[] = [];
        for (let k = 0; k <= 12; k++) curve.push(-(ring / 2 + (hw - ring / 2) * Math.sqrt(k / 12)), y - (depth * k) / 12);
        for (let k = 12; k >= 0; k--) curve.push(ring / 2 + (hw - ring / 2) * Math.sqrt(k / 12), y - (depth * k) / 12);
        out.push(
          <Group key={m.id}>
            <Line points={curve} closed {...gAt(-hw, 0, hw, 0, [0, L.metalLo, 0.2, L.metalHi, 0.38, L.metal, 0.62, L.metalLo, 0.85, L.metal, 1, L.metalLo])} {...rim(L)} />
            {[0.3, 0.6].map((k) => {
              const x = ring / 2 + (hw - ring / 2) * Math.sqrt(k);
              return <Line key={k} points={[-x, y - depth * k, x, y - depth * k]} stroke={L.metalLo} strokeWidth={clamp(depth * 0.015, 0.2, 0.6)} opacity={0.7} />;
            })}
            <Line points={[0, y, 0, y - depth * 0.55]} stroke={L.edge} strokeWidth={clamp(w * 0.02, 0.6, 2)} lineCap="round" />
            <Circle y={y - depth * 0.55} radius={clamp(w * 0.025, 0.6, 2.2)} {...dome(w * 0.025, [0, '#ffffff', 1, L.glow])} {...glowOf(L, 3)} />
            <LitBand x0={-hw * 0.96} x1={hw * 0.96} y={y - depth + 0.5} t={clamp(depth * 0.03, 0.4, 1.4)} L={L} />
          </Group>,
        );
        y -= depth;
        frontW = w;
        break;
      }
      case 'lantern': {
        // Round paper lantern on its speed ring, the skirt (where lowered) in black fabric.
        const r = hw;
        const cy = y - r * 0.9;
        out.push(
          <Group key={m.id}>
            <Rect x={-ring / 2} y={y - 1.6} width={ring} height={3.2} cornerRadius={1} {...gx(ring, aluStops(L))} />
            <Group y={cy}>
              <Lantern r={r} L={L} item={item} />
            </Group>
          </Group>,
        );
        y = cy - r;
        frontW = w;
        break;
      }
      case 'fresnel':
      case 'projection':
      case 'adapter': {
        // A lens barrel: knurled focus ring, a knob at the side, the lens glowing at the front;
        // a projection lens also has its shutter handles.
        const bw = Math.min(w, depth > w ? w : w * 0.9);
        const knob = clamp(bw * 0.07, 0.8, 2.5);
        out.push(
          <Group key={m.id}>
            {m.type === 'projection' &&
              [-1, 1].map((s) => (
                <Group key={s}>
                  <Rect x={s < 0 ? -bw / 2 - bw * 0.22 : bw / 2} y={y - depth * 0.42} width={bw * 0.22} height={knob * 0.6} fill={L.metalLo} />
                  <Circle x={s * (bw / 2 + bw * 0.22)} y={y - depth * 0.42 + knob * 0.3} radius={knob * 0.6} {...dome(knob * 0.6, [0, L.shellHi, 1, L.shellLo])} />
                </Group>
              ))}
            <Rect x={-bw / 2} y={y - depth} width={bw} height={depth} cornerRadius={Math.min(2, bw * 0.08)} {...gx(bw, tubeStops(L.shellLo, L.shellHi, L.shell))} {...rim(L)} />
            {m.type !== 'adapter' && (
              <>
                <Rect x={-bw / 2 - 0.4} y={y - depth * 0.62} width={bw + 0.8} height={depth * 0.16} {...gx(bw + 0.8, aluStops(L))} />
                <Rect x={-bw / 2 - 0.4} y={y - depth * 0.62} width={bw + 0.8} height={depth * 0.16} stroke={L.metalLo} strokeWidth={depth * 0.16} dash={[0.35, 0.35]} opacity={0.45} />
                <Knob x={bw / 2 + knob * 0.8} y={y - depth * 0.3} r={knob} L={L} />
              </>
            )}
            <Rect x={-bw / 2 - 0.6} y={y - depth} width={bw + 1.2} height={Math.min(3, depth * 0.12)} {...gx(bw + 1.2, shellStops(L))} />
            <LitBand x0={-bw * 0.4} x1={bw * 0.4} y={y - depth - 0.1} t={clamp(depth * 0.04, 0.5, 1.6)} L={L} />
          </Group>,
        );
        y -= depth;
        frontW = bw;
        break;
      }
      case 'barndoors':
        out.push(<BarnDoors key={m.id} y={y} w={w} depth={depth} L={L} />);
        y -= depth;
        break;
      case 'grid': {
        // Fabric egg crate seen edge on: a black band, its cell walls catching the light.
        const cells = clamp(Math.round(w / 5), 3, 24);
        out.push(
          <Group key={m.id}>
            <Rect x={-hw} y={y - depth} width={w} height={depth} {...gy(depth, [0, L.fabricHi, 1, L.fabricLo])} {...rim(L)} />
            {Array.from({ length: cells - 1 }, (_, k) => {
              const x = -hw + (w / cells) * (k + 1);
              return <Line key={k} points={[x, y, x, y - depth]} stroke={L.glow} strokeWidth={clamp(w * 0.003, 0.15, 0.5)} opacity={0.35} />;
            })}
          </Group>,
        );
        y -= depth;
        break;
      }
      case 'skirt': {
        out.push(
          <Line key={m.id} points={[-hw, y, -hw * 1.1, y - depth * 3, hw * 1.1, y - depth * 3, hw, y]} closed fill={L.fabric} opacity={0.55} stroke={L.fabricHi} strokeWidth={clamp(w * 0.01, 0.4, 1.4)} dash={[3, 2]} />,
        );
        break;
      }
      case 'diffusion': {
        out.push(<LitBand key={m.id} x0={-hw} x1={hw} y={y - depth / 2} t={Math.max(depth * 0.6, 1)} L={L} />);
        y -= depth;
        break;
      }
      default:
        break;
    }
  }
  return <>{out}</>;
}

/** An item's box in its own frame (front up), cm, reaching over a light's modifiers. */
export function itemLocalBox(item: Item): { x0: number; y0: number; x1: number; y1: number } {
  const { shape, w, d } = itemLook(item);
  const box = { x0: -w / 2, y0: -d / 2, x1: w / 2, y1: d / 2 };
  if (item.kind === 'light') {
    const reach = modifierReach(item, w);
    if (reach.depth > 0) {
      box.y0 = Math.min(box.y0, modifierFront(shape, d) - reach.depth);
      box.x0 = Math.min(box.x0, -reach.w / 2);
      box.x1 = Math.max(box.x1, reach.w / 2);
    }
  }
  return box;
}

/** The corners of `itemLocalBox`, turned with the item, relative to its position (cm). */
export function turnedCorners(item: Item): { x: number; y: number }[] {
  const { x0, y0, x1, y1 } = itemLocalBox(item);
  const r = (item.rotationDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({ x: x! * c - y! * s, y: x! * s + y! * c }));
}
