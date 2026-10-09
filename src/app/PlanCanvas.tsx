import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Arc, Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer, Wedge } from 'react-konva';
import type { Modifier } from '../catalog/schema';
import { FABRIC_FILL, fabricById } from '../library/fabrics';
import { libraryItem } from '../library/items';
import { itemFixture, itemLook, itemModifiers } from '../model/gear';
import { aimAt } from '../model/geometry';
import { DEFAULT_LENS_MM, horizontalFovDeg } from '../model/lens';
import { followsActorId, modeOf, sceneItems, type EditMode, type SceneDoc } from '../model/project';
import type { Actor, Item, Vec2 } from '../model/types';
import type { SceneAction } from './doc';
import type { CanvasColors } from './theme';

Konva.hitOnDragEnabled = true; // lets a second finger start a pinch while dragging

/** Stage transform: screen = world * scale + (x, y). Scale is pixels per cm. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

/** W = move items, R = drag an item to rotate it. */
export type Tool = 'move' | 'rotate';

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;
const GRID_CM = 50;
/** People are drawn 1.5× their base symbol so they read clearly next to lights and gear. */
const PERSON_SCALE = 1.5;
const DEFAULT_THROW_CM = 300;
const CAMERA_CONE_CM = 660;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zoom by `factor` keeping the screen point `at` fixed. */
export function zoomAt(view: View, factor: number, at: Vec2): View {
  const scale = clampScale(view.scale * factor);
  const wx = (at.x - view.x) / view.scale;
  const wy = (at.y - view.y) / view.scale;
  return { scale, x: at.x - wx * scale, y: at.y - wy * scale };
}


/** Beam angle for a light: set on the item, else the library default, else 60°. */
export const beamDegOf = (item: Item): number =>
  item.light?.beamDeg ?? libraryItem(item.catalogId)?.beamDeg ?? 60;

/** Text shown under an item: "L1 · LS 600d Pro" for lights, the actor's name for cast. */
export function displayLabel(item: Item, actors: readonly Actor[] = []): string {
  const actor = item.actorId ? actors.find((a) => a.id === item.actorId) : undefined;
  const fabric = fabricById(item.grip?.fabric);
  const base = itemFixture(item)?.model ?? libraryItem(item.catalogId)?.name ?? '';
  const name = actor?.name ?? item.label ?? (fabric ? `${base} · ${fabric.name}` : base);
  const unit = item.light?.unitId;
  return unit ? (name ? `${unit} · ${name}` : unit) : name;
}

/** A camera whose rotation is driven by its focus actor (when that actor is in the scene). */
export const isFocusLocked = (item: Item, all: readonly Item[]): boolean =>
  !!followsActorId(item) && all.some((a) => a.actorId === followsActorId(item));

/** Renders the plan to a PNG data URL, without selection handles. */
export type ExportPng = () => string | null;

interface Props {
  width: number;
  height: number;
  view: View;
  onView: (v: View) => void;
  scene: SceneDoc;
  actors: readonly Actor[];
  dispatch: (a: SceneAction) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  colors: CanvasColors;
  /** Show the 50 cm grid (hidden it gives a clean plan; it is also left out of exports then). */
  showGrid: boolean;
  mode: EditMode;
  tool: Tool;
  exportRef: MutableRefObject<ExportPng | null>;
}

interface RotateSession {
  id: string;
  center: Vec2;
  startAngle: number;
  startRot: number;
  current: number;
}

export function PlanCanvas(p: Props) {
  const { width, height, view, onView, scene, actors, dispatch, selected, onSelect, colors, showGrid, mode, tool } = p;
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const pinch = useRef<{ dist: number; center: Vec2 } | null>(null);
  const rot = useRef<RotateSession | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const all = sceneItems(scene);
  const visible = all.filter((i) => !i.hidden);

  const node = (id: string) => stageRef.current?.findOne((n: Konva.Node) => n.id() === id);

  useEffect(() => {
    // Move tool: box around the selection. Rotate tool: a ring instead (drawn below).
    const tr = trRef.current;
    if (!tr) return;
    const n = selected && tool === 'move' ? node(selected) : undefined;
    tr.nodes(n ? [n] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, scene, tool]);

  useEffect(() => {
    const el = stageRef.current?.container();
    if (el) el.style.cursor = '';
  }, [tool, mode]);

  const setCursor = (c: string) => {
    const el = stageRef.current?.container();
    if (el && !rot.current && !space.current) el.style.cursor = c;
  };

  // ---- Panning: middle mouse button, or hold Space and drag (anywhere, items stay put) ----
  const space = useRef(false);
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const live = useRef({ view, onView });
  live.current = { view, onView };

  useEffect(() => {
    const el = stageRef.current?.container();
    if (!el) return;
    const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select');
    const setSpace = (on: boolean) => {
      space.current = on;
      if (!pan.current) el.style.cursor = on ? 'grab' : '';
    };
    const keyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target)) return;
      e.preventDefault(); // no page scroll, no "click" on a focused button
      if (!e.repeat) setSpace(true);
    };
    const keyUp = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    const blur = () => setSpace(false);
    const wantsPan = (e: MouseEvent) => e.button === 1 || (e.button === 0 && space.current);
    // Capture phase on the container runs before Konva, so a pan never selects or drags an item.
    const pointerDown = (e: PointerEvent) => {
      if (!wantsPan(e)) return;
      e.preventDefault();
      e.stopPropagation();
      pan.current = { x: e.clientX, y: e.clientY, view: live.current.view };
      el.style.cursor = 'grabbing';
    };
    const swallow = (e: MouseEvent) => {
      if (!wantsPan(e)) return;
      e.preventDefault(); // middle button: no browser autoscroll / paste
      e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      const s = pan.current;
      if (s) live.current.onView({ ...s.view, x: s.view.x + e.clientX - s.x, y: s.view.y + e.clientY - s.y });
    };
    const up = (e: PointerEvent) => {
      if (!pan.current) return;
      move(e); // land exactly where the pointer was released
      pan.current = null;
      el.style.cursor = space.current ? 'grab' : '';
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', pointerDown, true);
    el.addEventListener('mousedown', swallow, true);
    el.addEventListener('auxclick', swallow, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pointerDown, true);
      el.removeEventListener('mousedown', swallow, true);
      el.removeEventListener('auxclick', swallow, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  useEffect(() => {
    p.exportRef.current = () => {
      const stage = stageRef.current;
      const tr = trRef.current;
      if (!stage) return null;
      const nodes = tr?.nodes() ?? [];
      tr?.nodes([]);
      const uiOnly = stage.find('.ui-only');
      uiOnly.forEach((n) => n.hide());
      const url = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
      uiOnly.forEach((n) => n.show());
      tr?.nodes(nodes);
      return url;
    };
  });

  /** While an item is dragged, keep its beam and any cameras watching it in step. */
  const follow = (moved: Item, pos: Vec2) => {
    node(`${moved.id}-beam`)?.position(pos);
    const turn = (id: string, deg: number) => {
      node(id)?.rotation(deg);
      node(`${id}-beam`)?.rotation(deg);
    };
    if (moved.actorId) {
      for (const f of all) if (followsActorId(f) === moved.actorId) turn(f.id, aimAt(f.pos, pos));
    }
    const who = followsActorId(moved);
    const target = who ? all.find((a) => a.actorId === who) : undefined;
    if (target) turn(moved.id, aimAt(pos, target.pos));
  };

  const worldPointer = (): Vec2 | null => stageRef.current?.getRelativePointerPosition() ?? null;

  const startRotate = (item: Item) => {
    const ptr = worldPointer();
    if (!ptr) return;
    rot.current = {
      id: item.id,
      center: item.pos,
      startAngle: aimAt(item.pos, ptr),
      startRot: item.rotationDeg,
      current: item.rotationDeg,
    };
  };

  const moveRotate = (shift: boolean) => {
    const r = rot.current;
    const ptr = worldPointer();
    if (!r || !ptr) return;
    const step = shift ? 45 : 5;
    const raw = r.startRot + aimAt(r.center, ptr) - r.startAngle;
    r.current = Math.round(raw / step) * step;
    node(r.id)?.rotation(r.current);
    node(`${r.id}-beam`)?.rotation(r.current);
  };

  const endRotate = () => {
    const r = rot.current;
    if (!r) return;
    rot.current = null;
    if (r.current !== r.startRot) dispatch({ type: 'rotate', id: r.id, rotationDeg: r.current });
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pt = stageRef.current?.getPointerPosition();
    if (!pt) return;
    onView(zoomAt(view, Math.exp(-e.evt.deltaY * 0.0015), pt));
  };

  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
    if (rot.current && !t2) {
      e.evt.preventDefault();
      moveRotate(false);
      return;
    }
    if (!t1 || !t2) return;
    e.evt.preventDefault();
    const stage = stageRef.current!;
    if (stage.isDragging()) stage.stopDrag();
    const rect = stage.container().getBoundingClientRect();
    const a = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
    const b = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const last = pinch.current;
    pinch.current = { dist, center };
    if (!last) return;
    const zoomed = zoomAt(view, dist / last.dist, center);
    onView({ ...zoomed, x: zoomed.x + center.x - last.center.x, y: zoomed.y + center.y - last.center.y });
  };

  const grid = useMemo(() => gridLines(view, width, height, colors), [view, width, height, colors]);
  const labelSize = Math.min(28, Math.max(9, 12 / view.scale));

  const renderItem = (item: Item) => {
    const active = modeOf(item) === mode;
    const canRotate = tool === 'rotate' && active && !item.locked && !isFocusLocked(item, all);
    const press = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!active) return;
      e.cancelBubble = true;
      onSelect(item.id);
      if (canRotate) startRotate(item);
    };
    return (
      <Group
        key={item.id}
        id={item.id}
        x={item.pos.x}
        y={item.pos.y}
        rotation={item.rotationDeg}
        listening={active}
        opacity={active ? 1 : 0.5}
        draggable={active && tool === 'move' && !item.locked}
        onMouseDown={press}
        onTouchStart={press}
        onMouseEnter={() => active && !item.locked && setCursor(tool === 'move' ? 'move' : ROTATE_CURSOR)}
        onMouseLeave={() => setCursor('')}
        onDragStart={() => setDragging(item.id)}
        onDragMove={(e) => follow(item, { x: e.target.x(), y: e.target.y() })}
        onDragEnd={(e) => {
          setDragging(null);
          const pos = { x: e.target.x(), y: e.target.y() };
          follow(item, pos);
          dispatch({ type: 'move', id: item.id, pos });
        }}
      >
        <ItemShape item={item} actors={actors} colors={colors} />
      </Group>
    );
  };

  const beam = (item: Item) => {
    if (item.kind !== 'light') return null;
    const throwCm = item.light?.throwCm ?? DEFAULT_THROW_CM;
    const deg = Math.min(360, beamDegOf(item));
    const gradient = {
      fillRadialGradientStartPoint: { x: 0, y: 0 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: 0, y: 0 },
      fillRadialGradientEndRadius: throwCm,
      fillRadialGradientColorStops: [0, colors.beam, 1, 'rgba(0,0,0,0)'],
    };
    return (
      <Group key={`${item.id}-beam`} id={`${item.id}-beam`} x={item.pos.x} y={item.pos.y} rotation={item.rotationDeg} listening={false}>
        {deg >= 360 ? (
          <Circle radius={throwCm} {...gradient} />
        ) : (
          <Wedge radius={throwCm} angle={deg} rotation={-90 - deg / 2} {...gradient} />
        )}
      </Group>
    );
  };

  const label = (item: Item) => {
    const text = displayLabel(item, actors);
    if (!text || item.id === dragging) return null; // hidden while the item is being moved
    return (
      <Text
        key={`${item.id}-label`}
        x={item.pos.x - 200}
        y={item.pos.y + labelOffset(item)}
        width={400}
        align="center"
        text={text}
        fontSize={labelSize}
        fontFamily="'Barlow Semi Condensed', 'Arial Narrow', sans-serif"
        fontStyle="600"
        fill={colors.label}
        opacity={modeOf(item) === mode ? 1 : 0.6}
        listening={false}
      />
    );
  };

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      x={view.x}
      y={view.y}
      scaleX={view.scale}
      scaleY={view.scale}
      onWheel={onWheel}
      onMouseMove={(e) => rot.current && moveRotate(e.evt.shiftKey)}
      onMouseUp={endRotate}
      onTouchMove={onTouchMove}
      onTouchEnd={() => {
        pinch.current = null;
        endRotate();
      }}
      onMouseLeave={endRotate}
      onMouseDown={(e) => e.target === stageRef.current && onSelect(null)}
      onTouchStart={(e) => e.target === stageRef.current && onSelect(null)}
    >
      <Layer listening={false}>
        <Rect
          x={-view.x / view.scale}
          y={-view.y / view.scale}
          width={width / view.scale}
          height={height / view.scale}
          fill={colors.canvas}
        />
        {showGrid && grid}
        {visible.map(beam)}
      </Layer>
      <Layer>
        {visible.filter((i) => scene.setItems.includes(i)).map(renderItem)}
        {visible.filter((i) => scene.items.includes(i)).map(renderItem)}
        {visible.map(label)}
        {tool === 'rotate' && selected && (() => {
          const sel = visible.find((i) => i.id === selected);
          return sel ? <RotateRing item={sel} scale={view.scale} color={colors.rotate} /> : null;
        })()}
        <Transformer
          ref={trRef}
          resizeEnabled={false}
          rotateEnabled={false}
          borderStroke={colors.select}
          borderStrokeWidth={2}
          padding={6}
        />
      </Layer>
    </Stage>
  );
}

/** Mouse cursor for the rotate tool: a circular arrow (hotspot in the middle). */
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g fill="none" stroke-linecap="round"><path d="M22 14a8 8 0 1 1-2.3-5.6" stroke="#000" stroke-width="5"/><path d="M22 14a8 8 0 1 1-2.3-5.6" stroke="#fff" stroke-width="2.5"/></g><path d="M23.5 4.5l-.5 6.5-6.5-.5z" fill="#fff" stroke="#000" stroke-width="1"/></svg>',
)}") 14 14, crosshair`;

/** Rotate tool selection: a dashed ring with two curved arrows around the item. */
function RotateRing({ item, scale, color }: { item: Item; scale: number; color: string }) {
  const { w, d, shape } = itemLook(item);
  const px = 1 / scale;
  const r = (shape === 'person' ? 26 * PERSON_SCALE : Math.max(w, d) / 2) + 14 * px;
  const arc = (from: number, to: number) => {
    const pts: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = ((from + ((to - from) * i) / 8) * Math.PI) / 180;
      pts.push(Math.sin(a) * r, -Math.cos(a) * r);
    }
    return pts;
  };
  const arrow = { stroke: color, fill: color, strokeWidth: 3 * px, pointerLength: 9 * px, pointerWidth: 9 * px, tension: 0.4 };
  return (
    <Group name="ui-only" x={item.pos.x} y={item.pos.y} listening={false}>
      <Circle radius={r} stroke={color} strokeWidth={1.5 * px} dash={[6 * px, 5 * px]} />
      <Arrow points={arc(20, 70)} {...arrow} />
      <Arrow points={arc(200, 250)} {...arrow} />
    </Group>
  );
}

function labelOffset(item: Item): number {
  const { d, shape } = itemLook(item);
  if (shape === 'person') return 18 * PERSON_SCALE;
  return Math.max(18, d / 2 + 8);
}

/** Grid lines for the visible area: 50 cm squares, stronger every 1 m and 5 m. */
function gridLines(view: View, width: number, height: number, c: CanvasColors) {
  const x0 = -view.x / view.scale;
  const y0 = -view.y / view.scale;
  const x1 = (width - view.x) / view.scale;
  const y1 = (height - view.y) / view.scale;
  // Skip lines that would be closer than ~6px on screen.
  let step = GRID_CM;
  while (step * view.scale < 6) step *= step === GRID_CM ? 2 : 5;
  const lines = [];
  const px = 1 / view.scale;
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
    const major = x % 500 === 0;
    const meter = x % 100 === 0;
    lines.push(
      <Line
        key={`x${x}`}
        points={[x, y0, x, y1]}
        stroke={x === 0 ? c.origin : major || meter ? c.gridMajor : c.gridMinor}
        strokeWidth={(major ? 1.5 : 1) * px}
        opacity={meter && !major && x !== 0 ? 0.6 : 1}
      />,
    );
  }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
    const major = y % 500 === 0;
    const meter = y % 100 === 0;
    lines.push(
      <Line
        key={`y${y}`}
        points={[x0, y, x1, y]}
        stroke={y === 0 ? c.origin : major || meter ? c.gridMajor : c.gridMinor}
        strokeWidth={(major ? 1.5 : 1) * px}
        opacity={meter && !major && y !== 0 ? 0.6 : 1}
      />,
    );
  }
  return lines;
}

/** Softboxes, domes and lanterns drawn in front of the light (towards -y). */
function ModifierShapes({ mods, front, c }: { mods: Modifier[]; front: number; c: CanvasColors }) {
  let y = front;
  const out = [];
  for (const m of mods) {
    const size = m.sizeCm;
    const dia = Math.max(size?.l ?? 0, size?.w ?? 0);
    if (!dia) continue;
    if (m.type === 'lantern') {
      out.push(<Circle key={m.id} y={y - dia / 2} radius={dia / 2} fill={c.label} opacity={0.18} stroke={c.light} strokeWidth={1.5} />);
      y -= dia;
    } else if (m.type === 'softbox' || m.type === 'dome' || m.type === 'parallel-beam') {
      const depth = size?.h ?? dia * 0.5;
      out.push(
        <Line
          key={m.id}
          points={[-8, y, 8, y, dia / 2, y - depth, -dia / 2, y - depth]}
          closed
          fill={c.label}
          opacity={0.18}
          stroke={c.light}
          strokeWidth={1.5}
        />,
      );
      y -= depth;
    }
  }
  return <>{out}</>;
}

/** Simple top-down symbols, drawn at real size facing up (-y). */
function ItemShape({ item, actors, colors: c }: { item: Item; actors: readonly Actor[]; colors: CanvasColors }) {
  const { shape, w, d } = itemLook(item);
  const hw = w / 2;
  const hd = d / 2;
  const mods = item.kind === 'light' ? <ModifierShapes mods={itemModifiers(item)} front={-hd} c={c} /> : null;
  switch (shape) {
    case 'cob':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={3} fill={c.light} />
          <Rect x={-hw * 0.8} y={-hd} width={w * 0.8} height={Math.min(4, d * 0.15)} fill={c.canvas} opacity={0.5} />
          {mods}
        </>
      );
    case 'fresnel':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={3} fill={c.light} />
          <Rect x={-hw - 3} y={-hd - 3} width={w + 6} height={6} cornerRadius={2} fill={c.label} opacity={0.6} />
          {mods}
        </>
      );
    case 'panel':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={2} fill={c.light} />
          <Line points={[-hw, -hd, hw, -hd]} stroke={c.label} strokeWidth={2} />
          {mods}
        </>
      );
    case 'mat':
    case 'tube':
      return (
        <>
          <Rect x={-hw} y={-Math.max(hd, 2.5)} width={w} height={Math.max(d, 5)} cornerRadius={2.5} fill={c.light} />
          {mods}
        </>
      );
    case 'bulb':
      return <Circle radius={Math.max(hw, 8)} fill={c.light} stroke={c.label} strokeWidth={1.5} />;
    case 'inflatable':
      return (
        <>
          <Circle radius={hw} fill={c.light} opacity={0.75} />
          <Circle radius={hw * 0.6} stroke={c.label} strokeWidth={1.5} opacity={0.5} />
        </>
      );
    case 'spacelight':
      return (
        <>
          <Circle radius={hw} stroke={c.light} strokeWidth={3} dash={[8, 6]} />
          <Circle radius={hw * 0.55} fill={c.light} />
        </>
      );
    case 'flag':
      return <Rect x={-hw} y={-Math.max(hd, 3)} width={w} height={Math.max(d, 6)} fill={c.grip} cornerRadius={1} />;
    case 'polyboard':
      return <Rect x={-hw} y={-Math.max(hd, 3)} width={w} height={Math.max(d, 6)} fill="#ffffff" />;
    case 'frame': {
      const fabric = fabricById(item.grip?.fabric);
      if (fabric) {
        const look = FABRIC_FILL[fabric.kind];
        const h = Math.max(d, 6);
        return (
          <>
            <Rect x={-hw} y={-h / 2} width={w} height={h} fill={look.fill} opacity={look.opacity} />
            <Rect x={-hw} y={-h / 2} width={w} height={h} stroke={c.grip} strokeWidth={1.5} />
          </>
        );
      }
      return (
        <Rect x={-hw} y={-Math.max(hd, 3)} width={w} height={Math.max(d, 6)} fill={c.label} opacity={0.55} stroke={c.grip} strokeWidth={2} />
      );
    }
    case 'stand':
      return (
        <>
          {[0, 120, 240].map((a) => {
            const r = (a * Math.PI) / 180;
            return <Line key={a} points={[0, 0, Math.sin(r) * hw, -Math.cos(r) * hw]} stroke={c.grip} strokeWidth={4} lineCap="round" />;
          })}
          <Circle radius={5} fill={c.grip} />
        </>
      );
    case 'sandbag':
      return <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={hd} fill={c.prop} stroke={c.grip} strokeWidth={1} />;
    case 'camera':
      return (
        <>
          {(() => {
            // Angle of view from the lens; drawn 6.6 m long.
            const fov = horizontalFovDeg(item.camera?.focalMm ?? DEFAULT_LENS_MM);
            return <Wedge radius={CAMERA_CONE_CM} angle={fov} rotation={-90 - fov / 2} fill={c.cameraFov} listening={false} />;
          })()}
          <Rect x={-13} y={-14} width={26} height={34} cornerRadius={3} fill={c.camera} />
          <Rect x={-8} y={-26} width={16} height={13} cornerRadius={2} fill={c.camera} />
          <Rect x={-9} y={-6} width={18} height={14} cornerRadius={2} fill={c.canvas} opacity={0.35} />
        </>
      );
    case 'monitor':
      // Screen on a stand; the light edge is the screen side.
      return (
        <>
          <Rect x={-6} y={0} width={12} height={hd} fill={c.camera} opacity={0.7} />
          <Rect x={-hw * 0.35} y={hd - 6} width={hw * 0.7} height={6} cornerRadius={3} fill={c.camera} opacity={0.7} />
          <Rect x={-hw} y={-hd} width={w} height={8} cornerRadius={2} fill={c.camera} />
          <Line points={[-hw + 3, -hd, hw - 3, -hd]} stroke={c.label} strokeWidth={2} />
        </>
      );
    case 'video-village': {
      // Large monitor at the front, two people behind it watching (facing it), one colour.
      const mw = Math.min(w * 0.7, 130);
      const viewer = (x: number) => (
        <Group key={x} x={x} y={hd - 36} scaleX={PERSON_SCALE} scaleY={PERSON_SCALE}>
          <Rect x={-22} y={-10} width={44} height={20} cornerRadius={10} fill={c.camera} opacity={0.85} />
          <Circle radius={9} fill={c.camera} stroke={c.canvas} strokeWidth={2} />
          <Line points={[-4, -11, 0, -18, 4, -11]} closed fill={c.camera} />
        </Group>
      );
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={8} stroke={c.camera} strokeWidth={1.5} dash={[6, 5]} opacity={0.6} />
          <Rect x={-mw / 2} y={-hd + 6} width={mw} height={9} cornerRadius={2} fill={c.camera} />
          <Line points={[-mw / 2 + 3, -hd + 15, mw / 2 - 3, -hd + 15]} stroke={c.label} strokeWidth={2} />
          <Rect x={-7} y={-hd + 15} width={14} height={14} fill={c.camera} opacity={0.7} />
          {viewer(-w * 0.24)}
          {viewer(w * 0.24)}
        </>
      );
    }
    case 'dolly':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={6} stroke={c.camera} strokeWidth={3} />
          <Line points={[0, hd - 15, 0, -hd + 15]} stroke={c.camera} strokeWidth={3} />
          <Line points={[-12, -hd + 30, 0, -hd + 15, 12, -hd + 30]} stroke={c.camera} strokeWidth={3} />
        </>
      );
    case 'person': {
      const actor = item.actorId ? actors.find((a) => a.id === item.actorId) : undefined;
      const fill = actor?.color ?? (item.catalogId === 'generic.person.crew' ? c.prop : c.person);
      return actor?.gender === 'female' ? (
        <Group scaleX={PERSON_SCALE} scaleY={PERSON_SCALE}>
          <Ellipse radiusX={19} radiusY={11} fill={fill} opacity={0.9} />
          <Circle y={12} radius={5} fill={c.grip} opacity={0.85} />
          <Circle y={2} radius={11} fill={c.grip} opacity={0.85} />
          <Circle radius={8.5} fill={fill} stroke={c.canvas} strokeWidth={1.5} />
          <Line points={[-4, -9, 0, -16, 4, -9]} closed fill={fill} />
        </Group>
      ) : (
        <Group scaleX={PERSON_SCALE} scaleY={PERSON_SCALE}>
          <Rect x={-25} y={-11} width={50} height={22} cornerRadius={11} fill={fill} opacity={0.9} />
          <Circle radius={10} fill={fill} stroke={c.canvas} strokeWidth={2} />
          <Line points={[-5, -12, 0, -20, 5, -12]} closed fill={fill} />
        </Group>
      );
    }
    case 'wall': {
      const chroma = item.catalogId?.includes('green-screen');
      return <Rect x={-hw} y={-hd} width={w} height={d} fill={chroma ? c.chroma : c.set} cornerRadius={1} />;
    }
    case 'door':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} fill={c.canvas} stroke={c.set} strokeWidth={2} />
          <Line points={[-hw, 0, -hw, -w]} stroke={c.set} strokeWidth={3} />
          <Arc x={-hw} y={0} innerRadius={w} outerRadius={w} angle={90} rotation={-90} stroke={c.set} strokeWidth={1.5} dash={[6, 5]} />
        </>
      );
    case 'window':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} fill={c.canvas} stroke={c.set} strokeWidth={3} />
          <Line points={[-hw, 0, hw, 0]} stroke={c.set} strokeWidth={1.5} />
        </>
      );
    case 'round':
      return <Circle radius={hw} fill={c.prop} />;
    default:
      return <Rect x={-hw} y={-hd} width={w} height={d} fill={item.kind === 'set' ? c.set : c.prop} cornerRadius={4} />;
  }
}
