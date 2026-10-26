// Lights and their modifiers seen from above, drawn at real size facing up (-y), modelled on
// the real fixtures: a monolight's finned body, handle and yoke with its Bowens ring; a panel's
// slab on its U yoke; a fresnel's lens and barn doors; tubes with end caps; mats in their frame…
// The part that gives light is drawn in a pale tint of the light colour.
import { Circle, Group, Line, Rect } from 'react-konva';
import { lightStyle, isDome, modSize, modifierFront, modifierReach } from '../model/emitter';
import { itemLook, itemModifiers } from '../model/gear';

export { lightStyle, modifierFront, modifierReach };
import type { Item } from '../model/types';
import type { CanvasColors } from './theme';

// ---- Colours -------------------------------------------------------------------------

const rgb = (s: string): [number, number, number] | null => {
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
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  const [r, g, bl] = x.map((v, k) => Math.round(v + (y[k]! - v) * t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Body, hardware (yoke, knobs, mount), outline and the glowing face. */
function palette(c: CanvasColors) {
  return {
    body: c.light,
    metal: mix(c.light, '#000000', 0.42),
    edge: mix(c.light, '#000000', 0.6),
    face: mix(c.light, '#ffffff', 0.72),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---- Shared parts ----------------------------------------------------------------------

/** A yoke seen from above: an arm beside each side of the head with a lock knob at the pivot. */
function SideYoke({ hw, y, len, size, p }: { hw: number; y: number; len: number; size: number; p: ReturnType<typeof palette> }) {
  const arm = clamp(size * 0.07, 0.8, 2.4);
  const knob = clamp(size * 0.085, 1.2, 3.2);
  return (
    <>
      {[-1, 1].map((s) => (
        <Group key={s}>
          <Rect x={s < 0 ? -hw - arm - 0.4 : hw + 0.4} y={y - len / 2} width={arm} height={len} cornerRadius={arm / 2} fill={p.metal} />
          <Circle x={s * (hw + arm + knob * 0.55)} y={y} radius={knob} fill={p.edge} />
        </Group>
      ))}
    </>
  );
}

/** Cooling fins across the back of a head. */
function Fins({ hw, from, to, p }: { hw: number; from: number; to: number; p: ReturnType<typeof palette> }) {
  const len = to - from;
  const n = clamp(Math.floor(len / 2.2), 2, 12);
  const step = len / (n + 1);
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <Line key={k} points={[-hw * 0.78, from + step * (k + 1), hw * 0.78, from + step * (k + 1)]} stroke={p.metal} strokeWidth={clamp(step * 0.35, 0.3, 0.9)} />
      ))}
    </>
  );
}

/** A panel-style U yoke from behind: arms at both ends, the cross bar behind, the stand spigot in the middle. */
function UYoke({ hw, back, p, size }: { hw: number; back: number; p: ReturnType<typeof palette>; size: number }) {
  const gap = clamp(size * 0.07, 2.5, 9);
  const arm = clamp(size * 0.025, 0.8, 2.2);
  const x = hw + arm * 0.8;
  return (
    <>
      <Line points={[-x, 0, -x, back + gap, x, back + gap, x, 0]} stroke={p.metal} strokeWidth={arm} lineJoin="round" />
      <Circle x={-x} y={0} radius={arm * 1.3} fill={p.edge} />
      <Circle x={x} y={0} radius={arm * 1.3} fill={p.edge} />
      <Circle y={back + gap} radius={arm * 1.6} fill={p.edge} />
    </>
  );
}

// ---- Fixtures -------------------------------------------------------------------------

/** The light's own drawing (no modifiers), filling `w` × `d` around the origin, front up. */
export function FixtureShape({ item, w, d, c }: { item: Item; w: number; d: number; c: CanvasColors }) {
  const style = lightStyle(item);
  const p = palette(c);
  const hw = w / 2;
  const hd = d / 2;
  const size = Math.max(w, d);
  const line = clamp(size * 0.012, 0.35, 1.2);
  switch (style) {
    case 'monolight':
    case 'compact':
    case 'cob-reflector': {
      // Reflector (generic only), mount ring, then the body with its fins, handle and yoke.
      const refl = style === 'cob-reflector' ? d * 0.32 : 0;
      const ringD = style === 'compact' ? clamp(d * 0.1, 1.2, 3) : clamp(d * 0.13, 2.2, 6);
      const ringW = style === 'compact' ? w * 0.82 : Math.min(w * 1.06, Math.max(w * 0.86, 15));
      const top = -hd + refl;
      const bodyTop = top + ringD;
      const bodyLen = hd - bodyTop;
      const pivot = bodyTop + bodyLen * 0.42;
      return (
        <>
          {refl > 0 && (
            <>
              <Line points={[-ringW * 0.42, top, ringW * 0.42, top, w * 0.78, -hd, -w * 0.78, -hd]} closed fill={p.metal} opacity={0.55} stroke={p.edge} strokeWidth={line} />
              <Line points={[-w * 0.74, -hd + line, w * 0.74, -hd + line]} stroke={p.face} strokeWidth={line * 2} />
            </>
          )}
          <Rect x={-hw} y={bodyTop} width={w} height={bodyLen} cornerRadius={Math.min(w, bodyLen) * (style === 'compact' ? 0.3 : 0.12)} fill={p.body} stroke={p.edge} strokeWidth={line} />
          <Fins hw={hw} from={bodyTop + bodyLen * 0.58} to={hd - bodyLen * 0.04} p={p} />
          {style !== 'compact' && (
            <Rect x={-w * 0.09} y={bodyTop + bodyLen * 0.12} width={w * 0.18} height={bodyLen * 0.4} cornerRadius={w * 0.09} fill={p.metal} />
          )}
          <Rect x={-ringW / 2} y={top} width={ringW} height={ringD} cornerRadius={Math.min(1.5, ringD / 2)} fill={p.metal} stroke={p.edge} strokeWidth={line} />
          {refl === 0 && <Line points={[-ringW * 0.3, top - line * 0.6, ringW * 0.3, top - line * 0.6]} stroke={p.face} strokeWidth={line * 2.2} lineCap="round" />}
          <SideYoke hw={hw} y={pivot} len={bodyLen * 0.38} size={w} p={p} />
        </>
      );
    }
    case 'fresnel': {
      // Barn doors (top leaf seen flat, side leaves opened out), the lens ring, a vented body.
      const doors = d * 0.2;
      const lens = clamp(d * 0.08, 1.5, 5);
      const bodyTop = -hd + doors + lens;
      const bodyLen = hd - bodyTop;
      const vents = Array.from({ length: 4 }, (_, k) => bodyTop + bodyLen * (0.3 + k * 0.12));
      return (
        <>
          <Rect x={-hw * 0.86} y={-hd + doors * 0.15} width={w * 0.86} height={doors * 0.85} fill={p.metal} opacity={0.3} stroke={p.edge} strokeWidth={line * 0.8} />
          {[-1, 1].map((s) => (
            <Line key={s} points={[s * hw * 0.98, -hd + doors, s * hw * 1.35, -hd]} stroke={p.edge} strokeWidth={line * 2.2} lineCap="round" />
          ))}
          <Rect x={-hw * 1.04} y={-hd + doors} width={w * 1.08} height={lens} cornerRadius={lens / 3} fill={p.metal} stroke={p.edge} strokeWidth={line} />
          <Line points={[-hw * 0.8, -hd + doors - line * 0.6, hw * 0.8, -hd + doors - line * 0.6]} stroke={p.face} strokeWidth={line * 1.8} />
          <Rect x={-hw} y={bodyTop} width={w} height={bodyLen} cornerRadius={[1, 1, w * 0.12, w * 0.12]} fill={p.body} stroke={p.edge} strokeWidth={line} />
          {vents.map((y) => (
            <Line key={y} points={[-hw * 0.45, y, hw * 0.45, y]} stroke={p.metal} strokeWidth={line * 1.4} lineCap="round" />
          ))}
          <SideYoke hw={hw} y={bodyTop + bodyLen * 0.45} len={bodyLen * 0.45} size={w} p={p} />
        </>
      );
    }
    case 'par': {
      // A can with a round back and a wide lens ring at the front.
      const ring = clamp(d * 0.1, 2, 6);
      const bodyTop = -hd + ring;
      const bodyLen = hd - bodyTop - d * 0.08;
      return (
        <>
          <Rect x={-hw * 0.95} y={bodyTop} width={w * 0.95} height={bodyLen} cornerRadius={[1, 1, w * 0.42, w * 0.42]} fill={p.body} stroke={p.edge} strokeWidth={line} />
          <Rect x={-w * 0.12} y={hd - d * 0.1} width={w * 0.24} height={d * 0.1} cornerRadius={1} fill={p.metal} />
          <Rect x={-hw * 1.05} y={-hd} width={w * 1.05} height={ring} cornerRadius={ring / 3} fill={p.metal} stroke={p.edge} strokeWidth={line} />
          <Line points={[-hw * 0.85, -hd - line * 0.6, hw * 0.85, -hd - line * 0.6]} stroke={p.face} strokeWidth={line * 2} />
          <SideYoke hw={hw * 0.95} y={bodyTop + bodyLen * 0.4} len={bodyLen * 0.45} size={w} p={p} />
        </>
      );
    }
    case 'spot': {
      // Focusing spot: the head at the back, a lens barrel forward with its focus ring and knob.
      const headLen = d * 0.52;
      const barrelW = w * 0.72;
      const headTop = hd - headLen;
      return (
        <>
          <Rect x={-barrelW / 2} y={-hd} width={barrelW} height={d - headLen + 1} cornerRadius={1} fill={p.body} stroke={p.edge} strokeWidth={line} />
          <Rect x={-barrelW / 2 - 0.6} y={-hd + d * 0.12} width={barrelW + 1.2} height={d * 0.07} fill={p.metal} />
          <Rect x={barrelW / 2} y={-hd + d * 0.25} width={w * 0.12} height={d * 0.06} cornerRadius={0.5} fill={p.edge} />
          <Line points={[-barrelW * 0.4, -hd - line * 0.6, barrelW * 0.4, -hd - line * 0.6]} stroke={p.face} strokeWidth={line * 2} />
          <Rect x={-hw} y={headTop} width={w} height={headLen} cornerRadius={w * 0.12} fill={p.body} stroke={p.edge} strokeWidth={line} />
          <Fins hw={hw} from={headTop + headLen * 0.45} to={hd - 1} p={p} />
          <SideYoke hw={hw} y={headTop + headLen * 0.4} len={headLen * 0.5} size={w} p={p} />
        </>
      );
    }
    case 'panel':
    case 'ring':
    case 'pocket': {
      // Seen edge on: the slab, its glowing face at the front, ribs on the back, on a U yoke.
      const t = Math.max(d, 1.6);
      const ht = t / 2;
      const ribs = style === 'panel' && t >= 6 ? clamp(Math.floor(w / 12), 3, 6) : 0;
      return (
        <>
          {style !== 'pocket' && <UYoke hw={hw} back={ht} p={p} size={w} />}
          <Rect x={-hw} y={-ht} width={w} height={t} cornerRadius={style === 'ring' ? ht : Math.min(ht, style === 'pocket' ? 1.5 : 1)} fill={p.body} stroke={p.edge} strokeWidth={line} />
          {Array.from({ length: ribs }, (_, k) => {
            const x = -hw + (w / (ribs + 1)) * (k + 1);
            return <Line key={k} points={[x, ht * 0.2, x, ht * 0.8]} stroke={p.metal} strokeWidth={line} opacity={0.7} />;
          })}
          {style === 'ring' && <Line points={[-w * 0.18, 0, w * 0.18, 0]} stroke={p.edge} strokeWidth={t * 0.5} dash={[1.5, 1.5]} />}
          <Line points={[-hw + Math.min(1.5, w * 0.06), -ht + line * 0.6, hw - Math.min(1.5, w * 0.06), -ht + line * 0.6]} stroke={p.face} strokeWidth={Math.max(line * 1.6, Math.min(t * 0.35, 2))} lineCap="round" />
        </>
      );
    }
    case 'tube': {
      // Tube with end caps, lit along its length, held by a clamp at the middle.
      const t = Math.max(d, 3);
      const cap = Math.min(5, w * 0.06);
      return (
        <>
          <Rect x={-2.5} y={t / 2 - 0.5} width={5} height={3} cornerRadius={0.8} fill={p.edge} />
          <Rect x={-hw} y={-t / 2} width={w} height={t} cornerRadius={t / 2} fill={p.face} stroke={p.edge} strokeWidth={line} />
          <Rect x={-hw + cap} y={0} width={w - cap * 2} height={t / 2} fill={p.body} opacity={0.55} />
          <Rect x={-hw} y={-t / 2} width={cap} height={t} cornerRadius={[t / 2, 0, 0, t / 2]} fill={p.metal} />
          <Rect x={hw - cap} y={-t / 2} width={cap} height={t} cornerRadius={[0, t / 2, t / 2, 0]} fill={p.metal} />
        </>
      );
    }
    case 'mat': {
      // A flexible mat in its frame, seen edge on, with the X bracket meeting at the stand behind.
      const t = Math.max(d, 2.5);
      const gap = clamp(w * 0.12, 6, 20);
      return (
        <>
          {[-1, 1].map((s) => (
            <Line key={s} points={[s * hw * 0.62, t / 2, 0, t / 2 + gap]} stroke={p.metal} strokeWidth={clamp(w * 0.012, 0.8, 1.8)} />
          ))}
          <Circle y={t / 2 + gap} radius={clamp(w * 0.018, 1.4, 2.6)} fill={p.edge} />
          <Rect x={-hw - 1} y={-t / 2 + t * 0.35} width={w + 2} height={t * 0.65} cornerRadius={0.6} fill={p.metal} />
          <Rect x={-hw} y={-t / 2} width={w} height={t * 0.5} fill={p.face} stroke={p.edge} strokeWidth={line * 0.8} />
          <Rect x={hw - Math.min(12, w * 0.12)} y={t / 2 + 1} width={Math.min(10, w * 0.1)} height={4} cornerRadius={1} fill={p.edge} opacity={0.8} />
        </>
      );
    }
    case 'air-panel': {
      // Inflatable soft panel: an air-filled rim round a glowing face, baffles inside.
      const rim = clamp(Math.min(w, d) * 0.07, 3, 12);
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={rim * 1.4} fill={p.face} opacity={0.9} stroke={p.body} strokeWidth={rim} />
          <Line points={[0, -hd + rim, 0, hd - rim]} stroke={p.body} strokeWidth={line} opacity={0.6} dash={[4, 3]} />
          <Line points={[-hw + rim, 0, hw - rim, 0]} stroke={p.body} strokeWidth={line} opacity={0.6} dash={[4, 3]} />
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={rim * 1.4} stroke={p.edge} strokeWidth={line} />
        </>
      );
    }
    case 'air-tube': {
      // Inflatable tube in air-filled chambers.
      const t = Math.max(d, 6);
      const n = clamp(Math.round(w / 20), 2, 10);
      return (
        <>
          <Rect x={-hw} y={-t / 2} width={w} height={t} cornerRadius={t / 2} fill={p.face} stroke={p.body} strokeWidth={clamp(t * 0.12, 1, 3)} />
          {Array.from({ length: n - 1 }, (_, k) => {
            const x = -hw + (w / n) * (k + 1);
            return <Line key={k} points={[x, -t / 2 + 1, x, t / 2 - 1]} stroke={p.body} strokeWidth={line * 1.4} />;
          })}
        </>
      );
    }
    case 'balloon': {
      // A lit sphere: highlight towards the top, the rigging point in the middle.
      const r = Math.max(hw, 4);
      return (
        <>
          <Circle radius={r} fill={p.body} opacity={0.85} stroke={p.edge} strokeWidth={line} />
          <Circle radius={r * 0.72} fill={p.face} opacity={0.75} />
          <Circle x={-r * 0.22} y={-r * 0.25} radius={r * 0.3} fill="#ffffff" opacity={0.45} />
          <Circle radius={Math.max(1, r * 0.07)} fill={p.edge} />
        </>
      );
    }
    case 'spacelight': {
      // Silk skirt seen from above with the ring of lamps inside it.
      const r = hw;
      return (
        <>
          <Circle radius={r} fill={p.body} opacity={0.22} stroke={p.metal} strokeWidth={line * 1.5} dash={[6, 4]} />
          <Circle radius={r * 0.48} fill={p.metal} opacity={0.75} />
          {Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return <Circle key={k} x={Math.cos(a) * r * 0.32} y={Math.sin(a) * r * 0.32} radius={r * 0.09} fill={p.face} />;
          })}
          <Circle radius={r * 0.08} fill={p.edge} />
        </>
      );
    }
    case 'practical': {
      // Table lamp from above: the shade with the bulb glowing through the top.
      const r = hw;
      return (
        <>
          <Circle radius={r} fill={p.body} opacity={0.75} stroke={p.edge} strokeWidth={line} />
          <Circle radius={r * 0.55} fill={p.face} opacity={0.9} />
          <Circle radius={r * 0.18} fill="#ffffff" opacity={0.8} />
        </>
      );
    }
    case 'bulb':
    default: {
      const r = Math.max(hw, 3.5);
      return (
        <>
          <Circle radius={r} fill={p.face} stroke={p.body} strokeWidth={Math.max(line, r * 0.18)} />
          <Circle radius={r * 0.35} fill={p.body} opacity={0.6} />
        </>
      );
    }
  }
}

// ---- Modifiers ------------------------------------------------------------------------

/** Modifiers stacked in front of the light (towards -y), in the order they're fitted. */
export function ModifierShapes({ item, front, lightW, c }: { item: Item; front: number; lightW: number; c: CanvasColors }) {
  const p = palette(c);
  let y = front;
  // Width of whatever is at the front now (a grid or doors fit the softbox before them).
  let frontW = lightW;
  const out = [];
  for (const m of itemModifiers(item)) {
    const size = modSize(m, frontW);
    if (!size) continue;
    const { w, depth } = size;
    const hw = w / 2;
    const line = clamp(w * 0.012, 0.4, 1.4);
    const ring = Math.min(lightW * 0.9, 16);
    switch (m.type) {
      case 'dome': {
        // Diffusion ball: a glowing sphere on a short neck.
        const r = hw;
        out.push(
          <Group key={m.id}>
            <Rect x={-ring / 3} y={y - r * 0.35} width={(ring * 2) / 3} height={r * 0.35} fill={p.metal} />
            <Circle y={y - r * 0.25 - r} radius={r} fill={p.face} opacity={0.9} stroke={p.body} strokeWidth={line * 1.4} />
          </Group>,
        );
        y -= depth;
        frontW = w;
        break;
      }
      case 'softbox':
      case 'reflector': {
        // Speed ring at the light, fabric (or metal) flaring out, the front diffusion glowing.
        const soft = m.type !== 'reflector';
        // A dome's sides bow out like a parabola; a box's run straight.
        const side = (s: number): number[] => {
          if (!isDome(m)) return [s * ring * 0.5, y, s * hw, y - depth];
          const pts: number[] = [];
          for (let k = 0; k <= 8; k++) {
            const t = k / 8;
            // Quadratic from the ring, bending out to run nearly straight at the front.
            const x = (1 - t) ** 2 * (ring * 0.5) + 2 * (1 - t) * t * hw + t * t * hw;
            const yy = (1 - t) ** 2 * y + 2 * (1 - t) * t * (y - depth * 0.3) + t * t * (y - depth);
            pts.push(s * x, yy);
          }
          return pts;
        };
        const left = side(-1);
        const right = side(1);
        const back: number[] = [];
        for (let k = right.length - 2; k >= 0; k -= 2) back.push(right[k]!, right[k + 1]!);
        out.push(
          <Group key={m.id}>
            <Line points={[...left, ...back]} closed fill={soft ? p.body : p.metal} opacity={soft ? 0.25 : 0.5} />
            <Line points={left} stroke={p.metal} strokeWidth={line} />
            <Line points={right} stroke={p.metal} strokeWidth={line} />
            {soft && <Line points={[-ring * 0.3, y - depth * 0.45, ring * 0.3, y - depth * 0.45]} stroke={p.face} strokeWidth={line} opacity={0.8} />}
            <Line points={[-hw, y - depth, hw, y - depth]} stroke={p.face} strokeWidth={line * 2.4} lineCap="round" />
            <Rect x={-ring / 2} y={y - 1.5} width={ring} height={3} cornerRadius={1} fill={p.edge} />
          </Group>,
        );
        y -= depth;
        frontW = w;
        break;
      }
      case 'parallel-beam': {
        // Deep parabolic dish: a curved shell, the light's rod reaching forward to the focus.
        const curve: number[] = [];
        for (let k = 0; k <= 10; k++) curve.push(-(ring / 2 + (hw - ring / 2) * Math.sqrt(k / 10)), y - (depth * k) / 10);
        for (let k = 10; k >= 0; k--) curve.push(ring / 2 + (hw - ring / 2) * Math.sqrt(k / 10), y - (depth * k) / 10);
        out.push(
          <Group key={m.id}>
            <Line points={curve} closed fill={p.metal} opacity={0.4} stroke={p.metal} strokeWidth={line} />
            <Line points={[0, y, 0, y - depth * 0.55]} stroke={p.edge} strokeWidth={line * 1.5} />
            <Line points={[-hw, y - depth, hw, y - depth]} stroke={p.face} strokeWidth={line * 2} />
          </Group>,
        );
        y -= depth;
        frontW = w;
        break;
      }
      case 'lantern': {
        // Round paper lantern with its ribs, and the dark skirt half (towards the back) folded up.
        const r = hw;
        const cy = y - r * 0.9;
        out.push(
          <Group key={m.id}>
            <Circle y={cy} radius={r} fill={p.face} opacity={0.85} stroke={p.body} strokeWidth={line * 1.5} />
            {[0.45, 0.8].map((k) => (
              <Circle key={k} y={cy} radius={r * k} stroke={p.body} strokeWidth={line * 0.8} opacity={0.6} />
            ))}
            <Rect x={-ring / 2} y={y - 1.5} width={ring} height={3} cornerRadius={1} fill={p.edge} />
          </Group>,
        );
        y = cy - r;
        frontW = w;
        break;
      }
      case 'fresnel':
      case 'projection':
      case 'adapter': {
        // A lens barrel: narrower than its housing, rings round it, lens glowing at the front.
        const bw = Math.min(w, depth > w ? w : w * 0.9);
        out.push(
          <Group key={m.id}>
            <Rect x={-bw / 2} y={y - depth} width={bw} height={depth} cornerRadius={Math.min(2, bw * 0.08)} fill={p.body} stroke={p.edge} strokeWidth={line} />
            {m.type === 'projection' && <Rect x={-bw / 2 - 1} y={y - depth * 0.5} width={bw + 2} height={depth * 0.08} fill={p.metal} />}
            <Rect x={-bw / 2 - 0.6} y={y - depth} width={bw + 1.2} height={Math.min(3, depth * 0.12)} fill={p.metal} />
            <Line points={[-bw * 0.38, y - depth - line * 0.6, bw * 0.38, y - depth - line * 0.6]} stroke={p.face} strokeWidth={line * 2} />
          </Group>,
        );
        y -= depth;
        frontW = bw;
        break;
      }
      case 'barndoors': {
        // Four leaves: top one seen flat, the side ones opened out.
        out.push(
          <Group key={m.id}>
            <Rect x={-hw * 0.9} y={y - depth} width={w * 0.9} height={depth} fill={p.metal} opacity={0.3} stroke={p.edge} strokeWidth={line * 0.8} />
            {[-1, 1].map((s) => (
              <Line key={s} points={[s * hw, y, s * hw * 1.35, y - depth]} stroke={p.edge} strokeWidth={line * 2.2} lineCap="round" />
            ))}
          </Group>,
        );
        y -= depth;
        break;
      }
      case 'grid': {
        // Egg crate across the front.
        const cells = clamp(Math.round(w / 6), 3, 16);
        out.push(
          <Group key={m.id}>
            <Rect x={-hw} y={y - depth} width={w} height={depth} stroke={p.edge} strokeWidth={line} />
            {Array.from({ length: cells - 1 }, (_, k) => {
              const x = -hw + (w / cells) * (k + 1);
              return <Line key={k} points={[x, y, x, y - depth]} stroke={p.edge} strokeWidth={line * 0.8} />;
            })}
          </Group>,
        );
        y -= depth;
        break;
      }
      case 'skirt': {
        out.push(<Line key={m.id} points={[-hw, y, -hw * 1.1, y - depth * 3, hw * 1.1, y - depth * 3, hw, y]} stroke={p.edge} strokeWidth={line * 1.4} dash={[3, 2]} />);
        break;
      }
      case 'diffusion': {
        out.push(<Line key={m.id} points={[-hw, y - depth / 2, hw, y - depth / 2]} stroke={p.face} strokeWidth={Math.max(depth * 0.6, line * 2)} lineCap="round" />);
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
