import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer, Wedge } from 'react-konva';
import type { Item, Vec2 } from '../model/types';
import type { Action, PlanDoc } from './doc';
import type { CanvasColors } from './theme';

Konva.hitOnDragEnabled = true; // lets a second finger start a pinch while dragging

/** Stage transform: screen = world * scale + (x, y). Scale is pixels per cm. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;
const GRID_CM = 50;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zoom by `factor` keeping the screen point `at` fixed. */
export function zoomAt(view: View, factor: number, at: Vec2): View {
  const scale = clampScale(view.scale * factor);
  const wx = (at.x - view.x) / view.scale;
  const wy = (at.y - view.y) / view.scale;
  return { scale, x: at.x - wx * scale, y: at.y - wy * scale };
}

interface Props {
  width: number;
  height: number;
  view: View;
  onView: (v: View) => void;
  doc: PlanDoc;
  dispatch: (a: Action) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  colors: CanvasColors;
}

export function PlanCanvas({ width, height, view, onView, doc, dispatch, selected, onSelect, colors }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const pinch = useRef<{ dist: number; center: Vec2 } | null>(null);

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selected ? stage.findOne(`#${CSS.escape(selected)}`) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, doc]);

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    onView(zoomAt(view, Math.exp(-e.evt.deltaY * 0.0015), p));
  };

  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
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

  const renderItem = (item: Item) => (
    <Group
      key={item.id}
      id={item.id}
      x={item.pos.x}
      y={item.pos.y}
      rotation={item.rotationDeg}
      draggable={!item.locked}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        onSelect(item.id);
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true;
        onSelect(item.id);
      }}
      onDragEnd={(e) => dispatch({ type: 'move', id: item.id, pos: { x: e.target.x(), y: e.target.y() } })}
      onTransformEnd={(e) => dispatch({ type: 'rotate', id: item.id, rotationDeg: e.target.rotation() })}
    >
      <ItemShape item={item} colors={colors} />
    </Group>
  );

  const label = (item: Item) =>
    item.label ? (
      <Text
        key={`${item.id}-label`}
        x={item.pos.x - 200}
        y={item.pos.y + labelOffset(item)}
        width={400}
        align="center"
        text={item.label}
        fontSize={labelSize}
        fontFamily="'Barlow Semi Condensed', 'Arial Narrow', sans-serif"
        fontStyle="600"
        fill={colors.label}
        listening={false}
      />
    ) : null;

  const all = [...doc.setItems, ...doc.items];

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      x={view.x}
      y={view.y}
      scaleX={view.scale}
      scaleY={view.scale}
      draggable
      onDragMove={(e) => {
        if (e.target === stageRef.current) onView({ ...view, x: e.target.x(), y: e.target.y() });
      }}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      onTouchEnd={() => (pinch.current = null)}
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
        {grid}
      </Layer>
      <Layer>
        {doc.setItems.map(renderItem)}
        {doc.items.map(renderItem)}
        {all.map(label)}
        <Transformer
          ref={trRef}
          resizeEnabled={false}
          rotateAnchorOffset={28}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={4}
          anchorSize={14}
          borderStroke={colors.select}
          anchorStroke={colors.select}
          anchorFill={colors.canvas}
          padding={6}
        />
      </Layer>
    </Stage>
  );
}

function labelOffset(item: Item): number {
  if (item.kind === 'set' && item.sizeCm) return item.sizeCm.d / 2 + 10;
  return item.kind === 'camera' ? 30 : 26;
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

/** Simple top-down symbols, drawn at real size facing up (-y). Placeholder art. */
function ItemShape({ item, colors }: { item: Item; colors: CanvasColors }) {
  switch (item.kind) {
    case 'person':
      return (
        <>
          <Ellipse radiusX={24} radiusY={13} fill={colors.person} opacity={0.9} />
          <Circle radius={10} fill={colors.person} stroke={colors.canvas} strokeWidth={2} />
          <Line points={[-5, -12, 0, -20, 5, -12]} closed fill={colors.person} />
        </>
      );
    case 'camera':
      return (
        <>
          <Wedge radius={220} angle={44} rotation={-90 - 22} fill={colors.cameraFov} listening={false} />
          <Rect x={-13} y={-14} width={26} height={34} cornerRadius={3} fill={colors.camera} />
          <Rect x={-8} y={-26} width={16} height={13} cornerRadius={2} fill={colors.camera} />
          <Rect x={-9} y={-6} width={18} height={14} cornerRadius={2} fill={colors.canvas} opacity={0.35} />
        </>
      );
    case 'set': {
      const w = item.sizeCm?.w ?? 100;
      const d = item.sizeCm?.d ?? 20;
      const chroma = item.catalogId?.includes('green-screen');
      return (
        <Rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          fill={chroma ? colors.chroma : colors.set}
          cornerRadius={2}
        />
      );
    }
    default: {
      const w = item.sizeCm?.w ?? 40;
      const d = item.sizeCm?.d ?? 40;
      return <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={colors.set} cornerRadius={4} />;
    }
  }
}
