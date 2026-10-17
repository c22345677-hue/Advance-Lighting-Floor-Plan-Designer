import Konva from 'konva';
import { lightColor, rgbCss } from '../model/color';
import { marksOf, moveMark } from '../model/blocking';
import { sunRgb, windowLights, type WindowLight } from '../model/sun';
import { meterReadings, stopParts, type CameraSettings, type Reading } from '../model/exposure';
import { beamReach, lightReach, lightSource } from '../model/shadows';
import { assemblyOf, canAttach, isMeter, rootOf } from '../model/attach';
import { LightLayer, type LivePatch, type ShadowLive } from './LightLayer';
import { beamAlpha, beamDegOf } from './beams';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Arc, Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer, Wedge } from 'react-konva';
import type { Modifier } from '../catalog/schema';
import { FABRIC_FILL, fabricById } from '../library/fabrics';
import { isOpening, libraryItem } from '../library/items';
import { itemFixture, itemLook, itemModifiers } from '../model/gear';
import { aimAt, normDeg, rotate } from '../model/geometry';
import { DEFAULT_LENS_MM, horizontalFovDeg } from '../model/lens';
import { followsActorId, inMode, modeOf, sceneItems, twoShotTargets, type Category, type EditMode, type SceneDoc } from '../model/project';
import type { Actor, Item, Vec2 } from '../model/types';
import {
  clampHit,
  DEFAULT_WALL_CM,
  nearestWall,
  onWallCorner,
  openWallEnd,
  placeInSegment,
  seatOpening,
  snapWallPoint,
  toLocal,
  wallPoints,
  wallSegments,
} from '../model/walls';
import type { SceneAction } from './doc';
import { greyOf, mutedColors, tonedColors, type CanvasColors } from './theme';

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
/** Actors and crew on the plan: 15% bigger again than the people in a video village. */
const ACTOR_SCALE = PERSON_SCALE * 1.15;
const CAMERA_CONE_CM = 660;
/** Hold a finger this long on an item to add it to the selection. */
const LONG_PRESS_MS = 500;
/** Touch screens: every item can be picked within this many screen pixels of its centre. */
const TOUCH_PAD_PX = 28;
/** A tap this close to an item (screen pixels) picks it, even off its outline. */
const NEAR_TAP_PX = { touch: 32, mouse: 10 };
const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zoom by `factor` keeping the screen point `at` fixed. */
export function zoomAt(view: View, factor: number, at: Vec2): View {
  const scale = clampScale(view.scale * factor);
  const wx = (at.x - view.x) / view.scale;
  const wy = (at.y - view.y) / view.scale;
  return { scale, x: at.x - wx * scale, y: at.y - wy * scale };
}


/** Beam angle for a light: set on the item, else the library default, else 60°. */
export { beamDegOf };

/** Text shown under an item: "L1 · LS 600d Pro" for lights, the actor's name for cast. */
export function displayLabel(item: Item, actors: readonly Actor[] = [], opts: { unit?: boolean } = {}): string {
  const actor = item.actorId ? actors.find((a) => a.id === item.actorId) : undefined;
  const fabric = fabricById(item.grip?.fabric);
  const lib = libraryItem(item.catalogId);
  // Walls, doors and windows are self-explanatory: no label unless one was typed.
  if (!item.label && (item.wall || isOpening(item.catalogId))) return '';
  if (item.kind === 'note') return ''; // notes draw their own text
  const base = itemFixture(item)?.model ?? lib?.name ?? '';
  const name = actor?.name ?? item.label ?? (fabric ? `${base} · ${fabric.name}` : base);
  // Light numbers (L1, L2…) are for lists; the plan shows just the name.
  const unit = opts.unit === false ? undefined : item.light?.unitId;
  return unit ? (name ? `${unit} · ${name}` : unit) : name;
}

/** A light meter's name in lists: its label, or whose it is ("Meter · Anna"). */
export function meterName(meter: Item, all: readonly Item[], actors: readonly Actor[] = []): string {
  if (meter.label) return meter.label;
  const on = meter.attachedTo ? all.find((i) => i.id === meter.attachedTo!.to) : undefined;
  const whose = on ? displayLabel(on, actors, { unit: true }) || itemName(on) : '';
  return whose ? `Meter · ${whose}` : 'Light meter';
}

/** What an item is called when it has no label: "Room"/"Walls" for wall chains, else its library name. */
export function itemName(item: Item): string {
  if (item.wall) return item.wall.closed ? 'Room' : 'Walls';
  return itemFixture(item)?.model ?? libraryItem(item.catalogId)?.name ?? item.kind;
}

/** A camera whose rotation is driven by its focus actor (when that actor is in the scene). */
export const isFocusLocked = (item: Item, all: readonly Item[]): boolean =>
  !!twoShotTargets(item, all) ||
  (!!followsActorId(item) && all.some((a) => a.actorId === followsActorId(item))) ||
  (item.kind === 'light' && !!item.light?.aimItemId && all.some((a) => a.id === item.light!.aimItemId)) ||
  (item.kind === 'camera' && !!item.camera?.focusItemId && all.some((a) => a.id === item.camera!.focusItemId));

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
  /** Selected item ids (one, several, or none). */
  selection: string[];
  onSelect: (id: string | null) => void;
  /** Box-select, Shift+click. */
  onSelectMany: (ids: string[]) => void;
  /** Right-click or double-click an item: open its settings. */
  onConfigure: (id: string) => void;
  /** Filled with the name tags' and meter screens' boxes on screen (px), for placing the selection bar. */
  labelBoxesRef?: MutableRefObject<{ id: string; x: number; y: number; w: number; h: number }[]>;
  /** Attaching from the selection bar: the item, where the pointer is (plan cm) and what it would attach to. */
  linkPreview?: { from: string; at: Vec2 | null; target: string | null } | null;
  /** Select mode: a tap adds an item to the selection or takes it out; a drag on empty space boxes more in. */
  pickMode?: boolean;
  /** Alt + drag of several selected items: copies moved by `delta`. */
  onDuplicateMany: (ids: string[], delta: Vec2) => void;
  colors: CanvasColors;
  /** Show the 50 cm grid (hidden it gives a clean plan; it is also left out of exports then). */
  showGrid: boolean;
  /** Draw shadows cast by the lights. */
  showShadows: boolean;
  /** Light meter readings under each person (camera settings), or off. */
  meter: CameraSettings | null;
  /** Per category: hidden from the plan, or locked (can't be picked or moved). */
  layers?: Partial<Record<Category, LayerState>>;
  showBeams?: boolean;
  mode: EditMode;
  tool: Tool;
  exportRef: MutableRefObject<ExportPng | null>;
  /** Draw walls tool: corners clicked so far, and callbacks to add a corner or finish. */
  wallTool: boolean;
  wallDraft: Vec2[];
  onWallDraft: (points: Vec2[], extend?: WallExtend) => void;
  onWallFinish: (closed: boolean) => void;
  /** Right-click with nothing being drawn: leave the tool. */
  onWallExit: () => void;
  /** The open wall the draft continues, if it started on one of its ends. */
  wallExtend: WallExtend | null;
  /** Click on a wall (not a corner) with the tool: add a corner there. */
  onWallInsert: (wallId: string, seg: number, offsetCm: number) => void;
  /** Snapping while drawing walls (Ctrl / Cmd held turns it off for the moment). */
  wallSnap: boolean;
  /** Alt + drag: leave the item where it was and add a copy where it was dropped. */
  onDuplicate: (item: Item, patch: Partial<Item>) => void;
}

export type LayerState = { hidden?: boolean; locked?: boolean };

export type WallExtend = { wallId: string; atStart: boolean };

interface RotateSession {
  id: string;
  /** What the pointer turns around: the group's root, or the item a light meter hangs on. */
  center: Vec2;
  startAngle: number;
  /** Turn so far, degrees (snapped). */
  delta: number;
  /** Everything turning: where it started and the point it swings around. */
  members: { item: Item; pivot: Vec2 }[];
}

export function PlanCanvas(p: Props) {
  const { width, height, view, onView, scene, actors, dispatch, selection, onSelect, colors, showGrid, mode, tool } = p;
  const selected = selection.length === 1 ? selection[0]! : null;
  const multi = selection.length > 1;
  const coarse = useMemo(coarsePointer, []);
  /** A press in select mode on an item already selected: a tap (no drag) takes it out. */
  const pickRemove = useRef<string | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const pinch = useRef<{ dist: number; center: Vec2 } | null>(null);
  const rot = useRef<RotateSession | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Alt + drag: the originals, drawn in place while their copy is being dragged. */
  const [ghosts, setGhosts] = useState<Item[]>([]);
  const ghostOf = (i: Item): Item => ({ ...i, id: `${i.id}~original` });
  const all = sceneItems(scene);
  /** Everything that's there (lights it, casts shadows), shown or not. */
  const lit = useMemo(() => all.filter((i) => !i.hidden), [scene]);
  const layer = (i: Item) => p.layers?.[modeOf(i)];
  /** What's drawn: hidden layers are left out. */
  const visible = lit.filter((i) => !layer(i)?.hidden);
  const walls = all.filter((i) => i.wall);
  const [hover, setHover] = useState<Vec2 | null>(null);
  /** What a click would do on an existing wall, shown next to the pointer. */
  const [hoverHint, setHoverHint] = useState<string | null>(null);
  /** Wall segment a new corner would split (its two lengths are shown live). */
  const [hoverSplit, setHoverSplit] = useState<[Vec2, Vec2] | null>(null);
  /** Door or window being moved or resized: its wall segment, centre and width. */
  const [openingGuide, setOpeningGuide] = useState<{ seg: [Vec2, Vec2]; center: Vec2; w: number } | null>(null);
  const guideFor = (hit: { wallId: string; seg: number }, center: Vec2, w: number) => {
    const wall = walls.find((x) => x.id === hit.wallId);
    const seg = wall && wallSegments(wall)[hit.seg];
    setOpeningGuide(seg ? { seg, center, w } : null);
  };
  const snapRadius = 14 / view.scale;

  const node = (id: string) => stageRef.current?.findOne((n: Konva.Node) => n.id() === id);

  useEffect(() => {
    // Move tool: box around the selection. Rotate tool: a ring instead (drawn below).
    const tr = trRef.current;
    if (!tr) return;
    // Selected items get a tight outline (SelectOutline); the transformer is only kept for the
    // side handles that resize a door or window.
    const sel = all.find((i) => i.id === selected);
    // Doors and windows resize along the wall from their side handles.
    const resizable = !!sel && tool === 'move' && isOpening(sel.catalogId) && !sel.locked;
    tr.resizeEnabled(resizable);
    tr.enabledAnchors(resizable ? ['middle-left', 'middle-right'] : []);
    tr.nodes(resizable ? [node(sel.id)].filter((n): n is Konva.Node => !!n) : []);
    tr.getLayer()?.batchDraw();
  }, [selection, scene, tool]);

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

  /** Live positions and turns for the shadow layer while things move. */
  const shadowLive = useRef<ShadowLive | null>(null);
  // Beams and shadows both follow live moves.
  const liveShadow = (id: string | null, patch?: LivePatch) => shadowLive.current?.(id, patch);

  /** While an item is dragged, keep its beam and any cameras watching it in step. */
  const follow = (moved: Item, pos: Vec2) => {
    node(`${moved.id}-beam`)?.position(pos);
    liveShadow(moved.id, { pos });
    // The name stays under the item while it moves.
    const lay = labelShift.current.get(moved.id);
    const lt = labelTop(moved, pos, lay?.w, lay?.h);
    node(`${moved.id}-label`)?.position({ x: lt.x - 200, y: lt.y + (labelShift.current.get(moved.id)?.shift ?? 0) });
    const turn = (id: string, deg: number) => {
      node(id)?.rotation(deg);
      node(`${id}-beam`)?.rotation(deg);
      liveShadow(id, { rot: deg });
    };
    if (moved.actorId) {
      for (const f of all) if (followsActorId(f) === moved.actorId) turn(f.id, aimAt(f.pos, pos));
      // Two-shot cameras keep aiming between their two people (lens and distance settle on drop).
      for (const f of all) {
        const ids = f.camera?.twoShot;
        const pair = twoShotTargets(f, all);
        if (!ids || !pair || !ids.includes(moved.actorId)) continue;
        const other = pair[ids[0] === moved.actorId ? 1 : 0];
        turn(f.id, aimAt(f.pos, { x: (pos.x + other.x) / 2, y: (pos.y + other.y) / 2 }));
      }
    }
    const pair = twoShotTargets(moved, all);
    if (pair) turn(moved.id, aimAt(pos, { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 }));
    const who = followsActorId(moved);
    const target = who ? all.find((a) => a.actorId === who) : undefined;
    if (target) turn(moved.id, aimAt(pos, target.pos));
  };

  /**
   * Where an item's tag goes (centre x, top y): under it, except a light meter held by someone,
   * whose reading sits on the far side of the meter so it never covers the person.
   */
  const labelTop = (item: Item, pos: Vec2 = item.pos, w = labelSize * 9, h = labelSize * 1.3): Vec2 => {
    const holder = isMeter(item) && item.attachedTo ? all.find((i) => i.id === item.attachedTo!.to) : undefined;
    if (!holder) return { x: pos.x, y: pos.y + labelOffset(item) };
    const dx = pos.x - holder.pos.x;
    const dy = pos.y - holder.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const u = { x: dx / len, y: dy / len };
    // Just clear of the meter, whichever side it's on (the tag is wider than it is tall).
    const reach = 10 + Math.abs(u.y) * (h / 2) + Math.abs(u.x) * (w / 2);
    return { x: pos.x + u.x * reach, y: pos.y + u.y * reach - h / 2 };
  };

  /** Where each name tag was nudged to (so it keeps its place while its item is dragged). */
  const labelShift = useRef(new Map<string, { shift: number; w: number; h: number }>());

  /** Pending long-press (touch): where the finger went down. */
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  const cancelLongPress = () => {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };
  useEffect(() => {
    // Any real finger movement turns a long-press into a drag (or a pan).
    const move = (e: TouchEvent) => {
      const lp = longPress.current;
      const t = e.touches[0];
      if (lp && (!t || e.touches.length > 1 || Math.hypot(t.clientX - lp.x, t.clientY - lp.y) > 8)) cancelLongPress();
    };
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', cancelLongPress);
    window.addEventListener('touchcancel', cancelLongPress);
    return () => {
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', cancelLongPress);
      window.removeEventListener('touchcancel', cancelLongPress);
    };
  }, []);

  /** Item being Alt + dragged (copied on drop). */
  const altCopy = useRef<string | null>(null);
  /** Other selected items moving with the dragged one, and where they started. */
  const groupDrag = useRef<{ id: string; item: Item }[]>([]);
  /** Selected items that move with `item` (doors and windows follow their walls instead). */
  const groupOf = (item: Item) => {
    // The selection (when the item is part of it), and everything attached to any of them.
    const base = multi && selection.includes(item.id) && !isOpening(item.catalogId) ? all.filter((o) => selection.includes(o.id) && (!o.locked || o.id === item.id) && !isOpening(o.catalogId)) : [item];
    const ids = new Set<string>();
    for (const b of base) for (const m of assemblyOf(b, all)) if (!isOpening(m.catalogId)) ids.add(m.id);
    ids.delete(item.id);
    return all.filter((o) => ids.has(o.id));
  };
  const moveGroup = (delta: Vec2) => {
    for (const { item: o } of groupDrag.current) {
      const at = { x: o.pos.x + delta.x, y: o.pos.y + delta.y };
      node(o.id)?.position(at);
      if (o.wall) liveOpenings({ ...o, pos: at });
      follow(o, at);
    }
  };

  // ---- Box select: drag on empty space (mouse) selects the active category's items ----
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number; add: boolean; touch?: boolean } | null>(null);
  const boxRef = useRef(box);
  boxRef.current = box;
  const endBox = () => {
    const b = boxRef.current;
    if (!b) return;
    setBox(null);
    const [l, r, t, btm] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1), Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
    const stage = stageRef.current!;
    const toScreen = (q: Vec2) => stage.getAbsoluteTransform().point(q);
    /** An item's footprint on screen, as a circle (its outline drawing can reach much further, e.g. a camera's view lines). */
    const footprint = (i: Item) => {
      const look = itemLook(i);
      return { c: toScreen(i.pos), r: (Math.max(20, Math.min(look.w, look.d)) / 2) * view.scale };
    };
    const pickable = visible.filter((i) => inMode(i, mode) && !layer(i)?.locked);
    if (r - l < 6 && btm - t < 6) {
      // A tap on empty space: pick the nearest item close by (fingers are bigger than icons).
      const tol = b.touch ? NEAR_TAP_PX.touch : NEAR_TAP_PX.mouse;
      let best: { id: string; d: number; layer: number } | null = null;
      for (const i of pickable) {
        if (i.wall) continue;
        const f = footprint(i);
        const d = Math.max(0, Math.hypot(f.c.x - b.x0, f.c.y - b.y0) - f.r);
        // Nearest; at the same distance (a camera on a dolly), the one drawn on top.
        if (d <= tol && (!best || d < best.d - 1 || (d <= best.d + 1 && drawLayer(i) > best.layer))) best = { id: i.id, d, layer: drawLayer(i) };
      }
      const id = best?.id;
      if (id && p.pickMode) p.onSelectMany(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);
      else if (id) onSelect(id);
      else if (!b.add) onSelect(null);
      return;
    }
    const inBox = (q: Vec2) => q.x >= l && q.x <= r && q.y >= t && q.y <= btm;
    const hits = pickable
      .filter((i) => {
        // Walls: one of their corners in the box (their bounding box would catch too much).
        if (i.wall) return wallPoints(i).some((q) => inBox(toScreen(q)));
        // Others: the box reaches their footprint.
        const f = footprint(i);
        const dx = Math.max(l - f.c.x, 0, f.c.x - r);
        const dy = Math.max(t - f.c.y, 0, f.c.y - btm);
        return Math.hypot(dx, dy) <= f.r;
      })
      .map((i) => i.id);
    p.onSelectMany(b.add ? [...new Set([...selection, ...hits])] : hits);
  };

  /** While a wall is dragged or reshaped, its doors and windows move with it. */
  const liveOpenings = (wall: Item) => {
    const segs = wallSegments(wall);
    for (const o of all) {
      const seg = o.inWall?.wallId === wall.id ? segs[o.inWall.seg] : undefined;
      if (!seg) continue;
      const at = placeInSegment(o, seg, wall.wall?.thicknessCm ?? DEFAULT_WALL_CM);
      node(o.id)?.position(at.pos);
      node(o.id)?.rotation(at.rotationDeg);
    }
  };

  const worldPointer = (): Vec2 | null => stageRef.current?.getRelativePointerPosition() ?? null;

  /**
   * What turns when `item` is turned (with the rest of the selection): each attached group
   * swings around its root; a light meter that hangs on something orbits it instead.
   */
  const rotateMembers = (item: Item, others: Item[]): { center: Vec2; members: RotateSession['members'] } => {
    const parentOf = (i: Item) => (i.attachedTo ? all.find((o) => o.id === i.attachedTo!.to) : undefined);
    const members: RotateSession['members'] = [];
    const seen = new Set<string>();
    const addGroup = (i: Item) => {
      const holder = isMeter(i) ? parentOf(i) : undefined;
      if (holder) {
        if (!seen.has(i.id)) members.push({ item: i, pivot: holder.pos });
        seen.add(i.id);
        return holder.pos;
      }
      const root = rootOf(i, all);
      for (const m of assemblyOf(root, all)) {
        if (seen.has(m.id) || m.inWall || (m.locked && m.id !== i.id)) continue;
        seen.add(m.id);
        members.push({ item: m, pivot: root.pos });
      }
      return root.pos;
    };
    const center = addGroup(item);
    for (const o of others) addGroup(o);
    return { center, members };
  };

  const startRotate = (item: Item, group: Item[] = []) => {
    const ptr = worldPointer();
    if (!ptr) return;
    const { center, members } = rotateMembers(item, group);
    rot.current = { id: item.id, center, startAngle: aimAt(center, ptr), delta: 0, members };
  };

  /** Where a turning member is now. */
  const turned = (m: RotateSession['members'][number], delta: number) => {
    const r = rotate({ x: m.item.pos.x - m.pivot.x, y: m.item.pos.y - m.pivot.y }, delta);
    return { pos: { x: m.pivot.x + r.x, y: m.pivot.y + r.y }, rot: m.item.rotationDeg + delta };
  };

  const moveRotate = (shift: boolean) => {
    const r = rot.current;
    const ptr = worldPointer();
    if (!r || !ptr) return;
    const step = shift ? 45 : 5;
    r.delta = Math.round((aimAt(r.center, ptr) - r.startAngle) / step) * step;
    for (const m of r.members) {
      const t = turned(m, r.delta);
      node(m.item.id)?.position(t.pos).rotation(t.rot);
      node(`${m.item.id}-beam`)?.position(t.pos).rotation(t.rot);
      const lay = labelShift.current.get(m.item.id);
      const lt = labelTop(m.item, t.pos, lay?.w, lay?.h);
      node(`${m.item.id}-label`)?.position({ x: lt.x - 200, y: lt.y + (labelShift.current.get(m.item.id)?.shift ?? 0) });
      liveShadow(m.item.id, { pos: t.pos, rot: t.rot });
    }
  };

  const endRotate = () => {
    const r = rot.current;
    if (!r) return;
    rot.current = null;
    setTimeout(() => liveShadow(null), 60);
    if (normDeg(r.delta) === 0) return;
    dispatch({
      type: 'updateMany',
      patches: r.members.map((m) => {
        const t = turned(m, r.delta);
        return { id: m.item.id, patch: { pos: t.pos, rotationDeg: normDeg(t.rot) } };
      }),
    });
  };

  // ---- Draw walls tool ----
  const corners = (): Vec2[] => [...walls.flatMap(wallPoints), ...p.wallDraft];
  type PtrEvt = MouseEvent | TouchEvent | undefined;
  const snapOff = (e: PtrEvt) => !p.wallSnap || (!!e && 'ctrlKey' in e && (e.ctrlKey || e.metaKey));
  const snapDraft = (pt: Vec2, e: PtrEvt) =>
    snapOff(e)
      ? pt
      : snapWallPoint(pt, {
          from: p.wallDraft[p.wallDraft.length - 1],
          corners: corners(),
          radius: snapRadius,
          angle: e && 'shiftKey' in e && e.shiftKey ? 'fine' : 'auto',
          lines: walls.flatMap(wallSegments),
        }).point;
  const extended = p.wallExtend ? walls.find((w) => w.id === p.wallExtend!.wallId) : undefined;
  /** Where a click closes the shape: the first corner, or the far end of the wall being continued. */
  const closeTarget = (): Vec2 | null => {
    if (extended) {
      const pts = wallPoints(extended);
      if (pts.length + p.wallDraft.length - 1 < 3) return null;
      return p.wallExtend!.atStart ? pts[pts.length - 1]! : pts[0]!;
    }
    return p.wallDraft.length >= 3 ? p.wallDraft[0]! : null;
  };
  const closesRoom = (pt: Vec2) => {
    const t = closeTarget();
    return !!t && Math.hypot(pt.x - t.x, pt.y - t.y) <= snapRadius;
  };
  /** With nothing drawn yet: continue an open wall from its end, or add a corner to a wall. */
  const wallAction = (ptr: Vec2, e: PtrEvt) => {
    if (p.wallDraft.length || snapOff(e)) return null;
    const end = openWallEnd(ptr, walls, snapRadius);
    if (end) return { kind: 'continue' as const, end };
    if (onWallCorner(ptr, walls, snapRadius)) return null;
    const hit = nearestWall(ptr, walls, Math.max(snapRadius, DEFAULT_WALL_CM / 2));
    const seg = hit && wallSegments(walls.find((w) => w.id === hit.wallId)!)[hit.seg];
    if (!hit || !seg) return null;
    // Whole centimetres from the first corner, so the readouts are exact.
    const len = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
    const offsetCm = Math.min(len, Math.max(0, Math.round(hit.offsetCm)));
    const t = len ? offsetCm / len : 0;
    const point = { x: seg[0].x + (seg[1].x - seg[0].x) * t, y: seg[0].y + (seg[1].y - seg[0].y) * t };
    return { kind: 'insert' as const, hit: { ...hit, offsetCm, point }, seg };
  };
  // Konva's own dblclick fires for two quick clicks anywhere, which would end a wall while
  // clicking corners fast; a double-click here means two clicks on the same spot.
  const lastClick = useRef<{ t: number; x: number; y: number } | null>(null);
  const wallClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ('button' in e.evt && e.evt.button === 2) {
      // Right-click ends the walls being drawn, or leaves the tool when there are none.
      lastClick.current = null;
      if (p.wallDraft.length) p.onWallFinish(false);
      else p.onWallExit();
      return;
    }
    if ('button' in e.evt && e.evt.button !== 0) return;
    const ptr = worldPointer();
    const scr = stageRef.current?.getPointerPosition();
    if (!ptr || !scr) return;
    const prev = lastClick.current;
    lastClick.current = { t: e.evt.timeStamp, x: scr.x, y: scr.y };
    if (prev && e.evt.timeStamp - prev.t < 350 && Math.hypot(scr.x - prev.x, scr.y - prev.y) < 8) {
      lastClick.current = null;
      p.onWallFinish(false);
      return;
    }
    const act = wallAction(ptr, e.evt);
    if (act?.kind === 'continue') {
      p.onWallDraft([act.end.point], { wallId: act.end.wallId, atStart: act.end.atStart });
      setHoverHint(null);
      return;
    }
    if (act?.kind === 'insert') {
      lastClick.current = null;
      p.onWallInsert(act.hit.wallId, act.hit.seg, act.hit.offsetCm);
      return;
    }
    const pt = snapDraft(ptr, e.evt);
    if (closesRoom(pt)) p.onWallFinish(true);
    else p.onWallDraft([...p.wallDraft, pt]);
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
    const active = inMode(item, mode) && !layer(item)?.locked;
    const canRotate = tool === 'rotate' && active && !item.locked && !isFocusLocked(item, all);
    const press = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!active) return;
      e.cancelBubble = true;
      pickRemove.current = null;
      if (p.pickMode) {
        // Select mode: pressing adds the item (and drags the whole selection); a tap on one
        // already selected takes it out.
        if (selection.includes(item.id)) pickRemove.current = item.id;
        else p.onSelectMany([...selection, item.id]);
        const group = selection.includes(item.id) ? all.filter((o) => o.id !== item.id && selection.includes(o.id) && !o.locked && !isFocusLocked(o, all)) : [];
        if (canRotate) startRotate(item, group);
        return;
      }
      if ('button' in e.evt && e.evt.shiftKey) {
        // Shift + click adds the item to the selection, or takes it out.
        p.onSelectMany(selection.includes(item.id) ? selection.filter((id) => id !== item.id) : [...selection, item.id]);
        return;
      }
      // Pressing one of several selected items keeps them all (to move or turn them together).
      if (!(multi && selection.includes(item.id))) onSelect(item.id);
      const group = multi && selection.includes(item.id) ? all.filter((o) => o.id !== item.id && selection.includes(o.id) && !o.locked && !isFocusLocked(o, all)) : [];
      if (canRotate) startRotate(item, group);
      // A person appears once per scene, so Alt + drag only moves them.
      altCopy.current = e.evt.altKey && !item.actorId ? item.id : null;
      // Touch: holding a finger still on an item adds it to the selection, or takes it out
      // (the touch version of Shift + click).
      if ('touches' in e.evt && e.evt.touches.length === 1) {
        const before = selection;
        const t = e.evt.touches[0]!;
        cancelLongPress();
        longPress.current = {
          x: t.clientX,
          y: t.clientY,
          timer: window.setTimeout(() => {
            longPress.current = null;
            node(item.id)?.stopDrag();
            node(item.id)?.position(item.pos);
            p.onSelectMany(before.includes(item.id) ? before.filter((id) => id !== item.id) : [...before, item.id]);
            navigator.vibrate?.(15);
          }, LONG_PRESS_MS),
        };
      }
    };
    return (
      <Group
        key={item.id}
        id={item.id}
        x={item.pos.x}
        y={item.pos.y}
        rotation={item.rotationDeg}
        listening={active}
        opacity={active ? 1 : 0.75}
        draggable={active && tool === 'move' && !item.locked}
        onMouseDown={press}
        onTouchStart={press}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          if (active) p.onConfigure(item.id);
        }}
        onClick={() => {
          if (p.pickMode && pickRemove.current === item.id) p.onSelectMany(selection.filter((id) => id !== item.id));
          pickRemove.current = null;
        }}
        onTap={() => {
          if (p.pickMode && pickRemove.current === item.id) p.onSelectMany(selection.filter((id) => id !== item.id));
          pickRemove.current = null;
        }}
        onDblClick={() => active && p.onConfigure(item.id)}
        onDblTap={() => active && p.onConfigure(item.id)}
        onMouseEnter={() => active && !item.locked && setCursor(tool === 'move' ? 'move' : ROTATE_CURSOR)}
        onMouseLeave={() => setCursor('')}
        onDragStart={() => {
          pickRemove.current = null;
          setDragging(item.id);
          groupDrag.current = groupOf(item).map((o) => ({ id: o.id, item: o }));
          if (altCopy.current === item.id) {
            // Alt + drag: the originals stay drawn where they were while the copy is dragged away.
            const moving = [item, ...groupDrag.current.map((g) => g.item)];
            const wallIds = new Set(moving.filter((m) => m.wall).map((m) => m.id));
            setGhosts([...moving, ...all.filter((o) => o.inWall && wallIds.has(o.inWall.wallId) && !moving.includes(o))]);
          }
        }}
        onDragMove={(e) => {
          const pos = { x: e.target.x(), y: e.target.y() };
          if (isOpening(item.catalogId)) {
            // Doors and windows snap into the nearest wall, lined up with it.
            // Doors and windows never leave the walls: they slide along the nearest one.
            const near = nearestWall(pos, walls, Infinity);
            const hit = near && clampHit(near, walls, itemLook(item).w);
            if (hit) {
              e.target.position(hit.point);
              node(`${item.id}-label`)?.position({ x: hit.point.x - 200, y: hit.point.y + labelOffset(item) });
              e.target.rotation(seatOpening(item, hit, itemLook(item).w).rotationDeg!);
              guideFor(hit, hit.point, itemLook(item).w);
            }
            return;
          }
          if (item.wall) liveOpenings({ ...item, pos });
          follow(item, pos);
          if (groupDrag.current.length) moveGroup({ x: pos.x - item.pos.x, y: pos.y - item.pos.y });
        }}
        onDragEnd={(e) => {
          setDragging(null);
          setGhosts([]);
          // Saved positions take over from the live ones (also when nothing was saved).
          setTimeout(() => liveShadow(null), 60);
          setOpeningGuide(null);
          const pos = { x: e.target.x(), y: e.target.y() };
          let patch: Partial<Item>;
          if (isOpening(item.catalogId)) {
            const near = nearestWall(pos, walls, Infinity);
            const hit = near && clampHit(near, walls, itemLook(item).w);
            patch = hit ? seatOpening(item, hit, itemLook(item).w) : { pos, rotationDeg: normDeg(e.target.rotation()) };
          } else patch = { pos };
          const group = groupDrag.current;
          groupDrag.current = [];
          if (group.length) {
            const delta = { x: pos.x - item.pos.x, y: pos.y - item.pos.y };
            if (altCopy.current === item.id) {
              // Put the originals back and drop copies of the whole selection here.
              altCopy.current = null;
              e.target.position(item.pos);
              follow(item, item.pos);
              if (item.wall) liveOpenings(item);
              groupDrag.current = group;
              moveGroup({ x: 0, y: 0 });
              groupDrag.current = [];
              p.onDuplicateMany([item.id, ...group.map((g) => g.id)], delta);
              return;
            }
            dispatch({
              type: 'updateMany',
              patches: [item, ...group.map((g) => g.item)].map((o) => ({ id: o.id, patch: { pos: { x: o.pos.x + delta.x, y: o.pos.y + delta.y } } })),
            });
            return;
          }
          if (altCopy.current === item.id) {
            // Put the original back (with anything that followed it) and drop a copy here.
            altCopy.current = null;
            e.target.position(item.pos);
            e.target.rotation(item.rotationDeg);
            follow(item, item.pos);
            if (item.wall) liveOpenings(item);
            p.onDuplicate(item, patch);
            return;
          }
          if (isOpening(item.catalogId)) {
            dispatch({ type: 'update', id: item.id, patch });
            return;
          }
          follow(item, pos);
          dispatch({ type: 'move', id: item.id, pos });
        }}
        onTransform={(e) => {
          // Live lengths while a door or window is stretched.
          if (!item.inWall) return;
          const n = e.target;
          guideFor(item.inWall, { x: n.x(), y: n.y() }, itemLook(item).w * n.scaleX());
        }}
        onTransformEnd={(e) => {
          setOpeningGuide(null);
          // Side handles stretch the opening; store the new width and keep the scale at 1.
          const n = e.target;
          const sx = n.scaleX();
          n.scaleX(1);
          n.scaleY(1);
          const look = itemLook(item);
          const w = Math.max(30, Math.round(look.w * sx));
          const pos = { x: n.x(), y: n.y() };
          // Still in its wall: remember the new distance along it.
          const hit = item.inWall ? nearestWall(pos, walls.filter((x) => x.id === item.inWall!.wallId), Infinity) : null;
          dispatch({
            type: 'update',
            id: item.id,
            patch: hit ? seatOpening(item, hit, w) : { pos, sizeCm: { w, d: look.d } },
          });
        }}
      >
        {selection.includes(item.id) && (
          <SelectOutline item={item} actors={actors} colors={colors} scale={view.scale} color={tool === 'rotate' ? colors.rotate : colors.select} />
        )}
        {coarse && !item.wall && <Circle name="hit-pad" radius={TOUCH_PAD_PX / view.scale} fill="#000" opacity={0} />}
        <ItemShape item={item} actors={actors} colors={colors} muted={!active} tone={stackTone.get(item.id)} />
      </Group>
    );
  };

  /** A person's blocking: numbered marks joined by a dashed path; marks can be dragged when they're selected. */
  const blockingPath = (item: Item) => {
    const marks = marksOf(item);
    if (marks.length < 2) return null;
    const color = actors.find((a) => a.id === item.actorId)?.color ?? colors.person;
    const editable = selected === item.id && (mode === 'scene' || mode === 'all') && tool === 'move' && !item.locked && !p.wallTool;
    return (
      <Group key={`${item.id}-blocking`} name="blocking">
        {marks.slice(1).map((m, k) => {
          const a = marks[k]!;
          const len = Math.hypot(m.x - a.x, m.y - a.y) || 1;
          const pad = 22;
          return (
            <Arrow
              key={k}
              listening={false}
              points={[a.x + ((m.x - a.x) / len) * pad, a.y + ((m.y - a.y) / len) * pad, m.x - ((m.x - a.x) / len) * pad, m.y - ((m.y - a.y) / len) * pad]}
              stroke={color}
              fill={color}
              strokeWidth={3}
              dash={[12, 8]}
              pointerLength={14}
              pointerWidth={14}
              opacity={0.85}
            />
          );
        })}
        {marks.map((m, k) =>
          k === item.blocking?.at ? null : (
            <Group
              key={`m${k}`}
              x={m.x}
              y={m.y}
              draggable={editable}
              listening={editable}
              onMouseDown={(e) => (e.cancelBubble = true)}
              onTouchStart={(e) => (e.cancelBubble = true)}
              onDragEnd={(e) => dispatch({ type: 'update', id: item.id, patch: moveMark(item, k, { x: e.target.x(), y: e.target.y() }) })}
            >
              <Circle radius={18} stroke={color} strokeWidth={3} dash={[6, 4]} fill={colors.canvas} opacity={0.9} />
              <Text text={String(k + 1)} x={-18} y={-9} width={36} align="center" fontSize={18} fontStyle="700" fill={color} />
            </Group>
          ),
        )}
        <Text text={String((item.blocking?.at ?? 0) + 1)} x={item.pos.x + 24} y={item.pos.y - 40} fontSize={16} fontStyle="700" fill={color} listening={false} />
      </Group>
    );
  };

  /** Daylight through a window: a sunlit patch on the floor, or a soft glow into the room. */
  const daylight = (wl: WindowLight) => {
    const rgb = sunRgb(scene.sun!);
    if (wl.patch) {
      return <Line key={`${wl.windowId}-sun`} points={wl.patch.flatMap((q) => [q.x, q.y])} closed fill={rgbCss(rgb, 0.3)} listening={false} />;
    }
    const rot = aimAt(wl.center, { x: wl.center.x + wl.inward.x, y: wl.center.y + wl.inward.y });
    return (
      <Wedge
        key={`${wl.windowId}-sky`}
        x={wl.center.x}
        y={wl.center.y}
        rotation={rot - 90 - 75}
        radius={500}
        angle={150}
        listening={false}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={500}
        fillRadialGradientColorStops={[0, rgbCss(rgb, 0.22), 1, 'rgba(0,0,0,0)']}
      />
    );
  };

  /**
   * How many items of the same layer each item sits on (its centre inside their footprint, and it
   * drawn after them): a product on a table, a box on a crate. Used to shade it apart.
   */
  const stackTone = useMemo(() => {
    const order = [...visible].sort((a, b) => drawLayer(a) - drawLayer(b));
    const out = new Map<string, number>();
    order.forEach((top, k) => {
      if (top.wall || top.inWall) return;
      let n = 0;
      for (const under of order.slice(0, k)) {
        if (under.wall || under.inWall || drawLayer(under) !== drawLayer(top)) continue;
        const look = itemLook(under);
        const local = rotate({ x: top.pos.x - under.pos.x, y: top.pos.y - under.pos.y }, -under.rotationDeg);
        if (Math.abs(local.x) <= look.w / 2 && Math.abs(local.y) <= look.d / 2) n += 1;
      }
      if (n) out.set(top.id, n);
    });
    return out;
  }, [visible]);

  /** Lights whose beams are drawn (by the light layer; hidden layers still light and cast shadows). */
  const beamIds = useMemo(() => new Set(visible.filter((i) => i.kind === 'light').map((i) => i.id)), [visible]);

  /** A beam as Konva shapes: only for the originals left in place during Alt + drag. */
  const beam = (item: Item) => {
    if (item.kind !== 'light') return null;
    const throwCm = beamReach(item, lit);
    const deg = Math.min(360, beamDegOf(item));
    // The beam is drawn in the light's colour (temperature, HSI and gels), falling off with
    // distance roughly as light does: bright near the lamp, fading quickly, then a long tail.
    const rgb = lightColor(item).rgb;
    const a = beamAlpha(item);
    const gradient = (k: number) => ({
      fillRadialGradientStartPoint: { x: 0, y: 0 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: 0, y: 0 },
      fillRadialGradientEndRadius: throwCm,
      fillRadialGradientColorStops: [0, rgbCss(rgb, a * k), 0.2, rgbCss(rgb, a * k * 0.75), 0.5, rgbCss(rgb, a * k * 0.4), 0.8, rgbCss(rgb, a * k * 0.15), 1, rgbCss(rgb, 0)],
    });
    // Through diffusion: the lamp's cone stops at the frame, and the fabric spreads the light wide.
    const src = lightSource(item, lit);
    // Walls stop the light: the beam is cut to where it gets to (in the beam's own frame).
    const reachPoly = lightReach(item.pos, lit, throwCm * 1.6)?.map((q) => rotate({ x: q.x - item.pos.x, y: q.y - item.pos.y }, -item.rotationDeg));
    const wallClip = reachPoly
      ? (ctx: Konva.Context) => {
          reachPoly.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.closePath();
        }
      : undefined;
    const frame = src?.frameId ? lit.find((f) => f.id === src.frameId) : undefined;
    if (frame && deg < 360) {
      const toFrame = Math.hypot(frame.pos.x - item.pos.x, frame.pos.y - item.pos.y);
      const local = rotate({ x: frame.pos.x - item.pos.x, y: frame.pos.y - item.pos.y }, -item.rotationDeg);
      const rest = Math.max(150, throwCm - toFrame);
      const spread = 70 + 90 * (src!.scatter ?? 0.7); // light grid keeps a narrower throw, 216 spreads ~160°
      const glow = {
        fillRadialGradientStartPoint: { x: 0, y: 0 },
        fillRadialGradientStartRadius: 0,
        fillRadialGradientEndPoint: { x: 0, y: 0 },
        fillRadialGradientEndRadius: rest,
        fillRadialGradientColorStops: [0, rgbCss(rgb, a * 0.7), 0.25, rgbCss(rgb, a * 0.45), 0.6, rgbCss(rgb, a * 0.15), 1, rgbCss(rgb, 0)],
      };
      const lamp = { ...gradient(0.8), fillRadialGradientEndRadius: toFrame * 1.6 };
      return (
        <Group key={`${item.id}-beam`} id={`${item.id}-beam`} x={item.pos.x} y={item.pos.y} rotation={item.rotationDeg} listening={false} clipFunc={wallClip}>
          <Wedge radius={toFrame} angle={deg} rotation={-90 - deg / 2} {...lamp} />
          <Wedge x={local.x} y={local.y} radius={rest} angle={spread} rotation={-90 - spread / 2} {...glow} />
        </Group>
      );
    }
    return (
      <Group key={`${item.id}-beam`} id={`${item.id}-beam`} x={item.pos.x} y={item.pos.y} rotation={item.rotationDeg} listening={false} clipFunc={wallClip}>
        {deg >= 360 ? (
          <Circle radius={throwCm} {...gradient(1)} />
        ) : (
          <>
            {/* Soft edges: the full beam faint, its brighter core inside. */}
            <Wedge radius={throwCm} angle={deg} rotation={-90 - deg / 2} {...gradient(0.55)} />
            <Wedge radius={throwCm} angle={deg * 0.6} rotation={-90 - (deg * 0.6) / 2} {...gradient(0.6)} />
          </>
        )}
      </Group>
    );
  };

  const readings = useMemo(() => (p.meter ? new Map(meterReadings(lit, p.meter, scene.sun).map((r) => [r.meterId, r])) : null), [lit, p.meter, scene.sun]);
  const windowLit = useMemo(() => windowLights(lit, scene.sun), [lit, scene.sun]);
  const windowSources = useMemo(() => windowLit.map((w) => w.source), [windowLit]);

  /** Under a person's name: their light meter reading. */
  const meterText = (item: Item) => {
    const r = readings?.get(item.id);
    if (!r) return null;
    return r.contributions.length ? `${r.tStopLabel} · ${r.lux} lx${r.ratio ? ` · ${r.ratio}` : ''}` : 'no light';
  };
  /** Meter screens shrink as the plan zooms out (down to about half), so they don't cover it. */
  const cardScale = Math.min(1, Math.max(0.5, view.scale * 1.2));
  const NAME_FONT = "600 {px}px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif";
  const METER_FONT = "{px}px 'IBM Plex Mono', monospace";

  /**
   * Name tags: each on a soft backing, sized to its text, and nudged down when it would sit on
   * another one (lights put side by side, people close together).
   */
  const labelLayout = useMemo(() => {
    const out = new Map<string, { name: string; meter: string | null; w: number; h: number; shift: number }>();
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const rows = visible
      .map((item) => {
        // A light meter shows its reading (and its name only when one was typed, or readings are off).
        const name = isMeter(item) ? (item.label ?? (readings ? '' : 'Light meter')) : displayLabel(item, actors, { unit: false });
        const meter = isMeter(item) ? meterText(item) : null;
        if (!name && !meter) return null;
        // A meter with a reading shows its little screen (a fixed size on screen).
        const card = isMeter(item) && !!readings?.get(item.id);
        const w = card ? (METER_CARD.w * cardScale) / view.scale : Math.max(textWidth(name, NAME_FONT, labelSize), meter ? textWidth(meter, METER_FONT, labelSize * 0.9) : 0) + labelSize * 0.7;
        const h = card ? (METER_CARD.h * cardScale) / view.scale : (name ? labelSize * 1.2 : 0) + (meter ? labelSize * 1.15 : 0);
        const at = labelTop(item, item.pos, w, h);
        return { item, name, meter, w, h, x: at.x, y: at.y };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const r of rows) {
      const l = r.x - r.w / 2;
      let t = r.y - labelSize * 0.1;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((q) => l < q.r && l + r.w > q.l && t < q.b && t + r.h > q.t);
        if (!hit) break;
        t = hit.b + labelSize * 0.1;
      }
      placed.push({ l, r: l + r.w, t, b: t + r.h });
      out.set(r.item.id, { name: r.name, meter: r.meter, w: r.w, h: r.h, shift: t - (r.y - labelSize * 0.1) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, actors, labelSize, readings, view.scale]);
  labelShift.current = labelLayout;
  if (p.labelBoxesRef) {
    const boxes: { id: string; x: number; y: number; w: number; h: number }[] = [];
    for (const item of visible) {
      const lay = labelLayout.get(item.id);
      if (!lay) continue;
      const at = labelTop(item, item.pos, lay.w, lay.h);
      boxes.push({ id: item.id, x: view.x + (at.x - lay.w / 2) * view.scale, y: view.y + (at.y + lay.shift) * view.scale, w: lay.w * view.scale, h: lay.h * view.scale });
    }
    p.labelBoxesRef.current = boxes;
  }

  // ---- Attaching: while the selection bar's Link button is dragged (or armed), show where it would go ----
  const linkPreview = () => {
    const lp = p.linkPreview;
    const from = lp ? all.find((i) => i.id === lp.from) : undefined;
    if (!lp || !from) return null;
    const k = 1 / view.scale;
    const target = lp.target ? all.find((i) => i.id === lp.target) : undefined;
    return (
      <>
        {lp.at && <Line name="ui-only" points={[from.pos.x, from.pos.y, lp.at.x, lp.at.y]} stroke={colors.select} strokeWidth={2 * k} dash={[6 * k, 5 * k]} listening={false} />}
        {target && (
          <Circle name="ui-only" x={target.pos.x} y={target.pos.y} radius={(target.wall ? 0 : attachRadiusCm(target)) + 8 * k} stroke={colors.select} strokeWidth={3 * k} listening={false} />
        )}
      </>
    );
  };
  /** Dotted ties between attached items, shown for the selection's groups. */
  const attachLinks = () => {
    const shown = new Set(selection.flatMap((id) => {
      const i = all.find((x) => x.id === id);
      return i ? assemblyOf(i, all).map((m) => m.id) : [];
    }));
    const k = 1 / view.scale;
    return visible
      .filter((c) => c.attachedTo && shown.has(c.id))
      .map((c) => {
        const parent = all.find((i) => i.id === c.attachedTo!.to);
        if (!parent) return null;
        return (
          <Group key={`${c.id}-tie`} name="ui-only" listening={false}>
            <Line points={[parent.pos.x, parent.pos.y, c.pos.x, c.pos.y]} stroke={colors.select} strokeWidth={1.5 * k} dash={[2 * k, 4 * k]} opacity={0.9} />
            <Circle x={parent.pos.x} y={parent.pos.y} radius={3 * k} fill={colors.select} />
          </Group>
        );
      });
  };

  /** Inside a room: its size (inside the walls) and floor area. */
  const roomTag = (item: Item) => {
    const pts = item.wall!.points;
    if (pts.length < 3) return null;
    const t = item.wall!.thicknessCm ?? DEFAULT_WALL_CM;
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const w = Math.max(...xs) - Math.min(...xs) - t;
    const d = Math.max(...ys) - Math.min(...ys) - t;
    let area = 0;
    let perim = 0;
    pts.forEach((a, k) => {
      const b = pts[(k + 1) % pts.length]!;
      area += a.x * b.y - b.x * a.y;
      perim += Math.hypot(b.x - a.x, b.y - a.y);
    });
    const m2 = Math.max(0, Math.abs(area) / 2 - (perim * t) / 2) / 1e4;
    // Just inside the top wall, clear of whatever stands in the middle of the room.
    const world = wallPoints(item);
    const c = { x: world.reduce((n, q) => n + q.x, 0) / world.length, y: Math.min(...world.map((q) => q.y)) + t / 2 + labelSize * 1.1 };
    return (
      <Text
        key={`${item.id}-room`}
        name="room-size"
        x={c.x - 300}
        y={c.y - labelSize * 0.5}
        width={600}
        align="center"
        text={`${(w / 100).toFixed(2)} × ${(d / 100).toFixed(2)} m  ·  ${m2.toFixed(1)} m²`}
        fontSize={labelSize * 0.95}
        fontFamily="'IBM Plex Mono', monospace"
        fill={colors.label}
        opacity={0.4}
        listening={false}
      />
    );
  };

  const label = (item: Item) => {
    const lay = labelLayout.get(item.id);
    const reading = isMeter(item) ? readings?.get(item.id) : undefined;
    if (reading && lay && item.id !== dragging) {
      const at = labelTop(item, item.pos, lay.w, lay.h);
      return (
        <Group key={`${item.id}-label`} id={`${item.id}-label`} x={at.x - 200} y={at.y + lay.shift} listening={false}>
          <Group x={200 - lay.w / 2} scaleX={cardScale / view.scale} scaleY={cardScale / view.scale}>
            <MeterCard r={reading} title={item.label} />
          </Group>
        </Group>
      );
    }
    const name = lay?.name ?? (isMeter(item) ? (item.label ?? '') : displayLabel(item, actors, { unit: false }));
    const meter = item.id === dragging ? null : (lay?.meter ?? null);
    if (!name && !meter) return null;
    const w = lay?.w ?? textWidth(name, NAME_FONT, labelSize) + labelSize * 0.7;
    const h = (name ? labelSize * 1.2 : 0) + (meter ? labelSize * 1.15 : 0);
    const picked = inMode(item, mode);
    return (
      <Group key={`${item.id}-label`} id={`${item.id}-label`} x={labelTop(item, item.pos, w).x - 200} y={labelTop(item, item.pos, w).y + (lay?.shift ?? 0)} listening={false}>
        <Rect x={200 - w / 2} y={-labelSize * 0.1} width={w} height={h} cornerRadius={labelSize * 0.35} fill={colors.labelBg} opacity={picked ? 1 : 0.7} />
        {name && (
          <Text
            width={400}
            align="center"
            text={name}
            fontSize={labelSize}
            fontFamily="'Barlow Semi Condensed', 'Arial Narrow', sans-serif"
            fontStyle="600"
            fill={colors.label}
            opacity={picked ? 1 : 0.6}
          />
        )}
        {meter && (
          <Text
            name="meter-label"
            y={name ? labelSize * 1.2 : 0}
            width={400}
            align="center"
            text={meter}
            fontSize={labelSize * 0.9}
            fontFamily="'IBM Plex Mono', monospace"
            fill={colors.meter}
          />
        )}
      </Group>
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
      onContextMenu={(e) => e.evt.preventDefault()} /* no browser menu on the plan (right-click, long-press) */
      onMouseMove={(e) => {
        if (rot.current) moveRotate(e.evt.shiftKey);
        const b = boxRef.current;
        const pt = stageRef.current?.getPointerPosition();
        if (b && pt) setBox({ ...b, x1: pt.x, y1: pt.y });
      }}
      onMouseUp={() => {
        endRotate();
        endBox();
      }}
      onTouchMove={(e) => {
        const b = boxRef.current;
        if (b && e.evt.touches.length === 1) {
          e.evt.preventDefault();
          const pt = stageRef.current?.getPointerPosition();
          if (pt) setBox({ ...b, x1: pt.x, y1: pt.y });
          return;
        }
        if (b) setBox(null); // a second finger: pinch or pan instead
        onTouchMove(e);
      }}
      onTouchEnd={() => {
        pinch.current = null;
        endRotate();
        endBox();
      }}
      onMouseLeave={() => {
        endRotate();
        endBox();
      }}
      onMouseDown={(e) => {
        if (e.target !== stageRef.current || e.evt.button !== 0) return;
        const pt = stageRef.current.getPointerPosition();
        if (pt) setBox({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add: e.evt.shiftKey || !!p.pickMode });
      }}
      onTouchStart={(e) => {
        // One finger on empty space: drag a box to select (a tap picks what's close by, or clears).
        if (e.target !== stageRef.current || e.evt.touches.length !== 1) return;
        const pt = stageRef.current.getPointerPosition();
        if (pt) setBox({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add: !!p.pickMode, touch: true });
      }}
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
        {windowLit.map((wl) => daylight(wl))}
        <LightLayer items={lit} beamIds={beamIds} showShadows={p.showShadows} showBeams={p.showBeams !== false} extra={windowSources} liveRef={shadowLive} />
        {ghosts.map((g) => beam(ghostOf(g)))}
      </Layer>
      <Layer>
        {ghosts.map((g) => (
          <Group key={`${g.id}~original`} x={g.pos.x} y={g.pos.y} rotation={g.rotationDeg} listening={false}>
            <ItemShape item={g} actors={actors} colors={colors} />
          </Group>
        ))}
        {ghosts.filter((g) => g.id === dragging).map((g) => label(ghostOf(g)))}
        {visible.map(blockingPath)}
        {[...visible].sort((a, b) => drawLayer(a) - drawLayer(b)).map(renderItem)}
        {visible.filter((i) => i.wall?.closed).map(roomTag)}
        {visible.map(label)}
        {tool === 'rotate' &&
          visible
            .filter((i) => selection.includes(i.id))
            .map((sel) => <RotateRing key={`${sel.id}-ring`} item={sel} scale={view.scale} color={colors.rotate} />)}
        {attachLinks()}
        {linkPreview()}
        {(() => {
          // Corner handles on a selected wall (Move tool): drag a corner to reshape the room.
          const sel = visible.find((i) => i.id === selected && i.wall);
          if (!sel || tool !== 'move' || p.wallTool || sel.locked || !inMode(sel, mode)) return null;
          const others = walls.filter((w) => w.id !== sel.id).flatMap(wallPoints);
          return wallPoints(sel).map((pt, idx) => (
            <Circle
              key={`${sel.id}-v${idx}`}
              name="ui-only"
              x={pt.x}
              y={pt.y}
              radius={7 / view.scale}
              fill={colors.canvas}
              stroke={colors.select}
              strokeWidth={2 / view.scale}
              draggable
              onMouseDown={(e) => (e.cancelBubble = true)}
              onTouchStart={(e) => (e.cancelBubble = true)}
              onDragMove={(e) => {
                const raw = { x: e.target.x(), y: e.target.y() };
                const at = snapOff(e.evt) ? raw : snapWallPoint(raw, { corners: others, radius: snapRadius, angle: 'free' }).point;
                e.target.position(at);
                const local = sel.wall!.points.slice();
                local[idx] = toLocal(sel, at);
                (node(sel.id) as Konva.Group | undefined)?.find<Konva.Line>('.wall-line').forEach((l) => l.points(local.flatMap((q) => [q.x, q.y])));
                liveOpenings({ ...sel, wall: { ...sel.wall!, points: local } });
              }}
              onDragEnd={(e) => {
                const local = sel.wall!.points.slice();
                local[idx] = toLocal(sel, { x: e.target.x(), y: e.target.y() });
                dispatch({ type: 'update', id: sel.id, patch: { wall: { ...sel.wall!, points: local } } });
              }}
            />
          ));
        })()}
        {p.wallTool && (
          <>
            <Rect
              x={-view.x / view.scale}
              y={-view.y / view.scale}
              width={width / view.scale}
              height={height / view.scale}
              fill="rgba(0,0,0,0)"
              onMouseDown={wallClick}
              onTap={wallClick}
              onMouseMove={(e) => {
                const ptr = worldPointer();
                const act = ptr ? wallAction(ptr, e.evt) : null;
                setHover(!ptr ? null : act?.kind === 'continue' ? act.end.point : act ? act.hit.point : snapDraft(ptr, e.evt));
                setHoverHint(act?.kind === 'continue' ? 'Continue this wall' : act ? 'Add a corner' : null);
                setHoverSplit(act?.kind === 'insert' ? act.seg : null);
              }}
              onMouseEnter={() => setCursor('crosshair')}
              onMouseLeave={() => setHover(null)}
            />
            {/* Existing corners, so added ones are visible and can be clicked to start from. */}
            {walls.flatMap(wallPoints).map((q, i) => (
              <Circle key={`wc${i}`} name="ui-only" listening={false} x={q.x} y={q.y} radius={4 / view.scale} fill={colors.select} opacity={0.8} />
            ))}
            <WallDraft
              draft={p.wallDraft}
              hover={hover}
              hint={hoverHint}
              split={hoverSplit}
              closeAt={hover && closesRoom(hover) ? closeTarget() : null}
              scale={view.scale}
              colors={colors}
            />
          </>
        )}
        {openingGuide && <OpeningDims {...openingGuide} scale={view.scale} colors={colors} />}
        <PlanCorner view={view} height={height} colors={colors} sun={scene.sun?.on ? scene.sun : undefined} />
        {box && (
          <Rect
            name="ui-only"
            listening={false}
            x={(Math.min(box.x0, box.x1) - view.x) / view.scale}
            y={(Math.min(box.y0, box.y1) - view.y) / view.scale}
            width={Math.abs(box.x1 - box.x0) / view.scale}
            height={Math.abs(box.y1 - box.y0) / view.scale}
            stroke={colors.select}
            strokeWidth={1.5 / view.scale}
            dash={[6 / view.scale, 4 / view.scale]}
            fill="rgba(128, 160, 255, 0.08)"
          />
        )}
        <Transformer
          ref={trRef}
          resizeEnabled={false}
          rotateEnabled={false}
          keepRatio={false}
          ignoreStroke
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 ? oldBox : newBox)}
          borderEnabled={false}
          padding={6}
        />
      </Layer>
    </Stage>
  );
}

const OUTLINE_DIRS = Array.from({ length: 12 }, (_, i) => [Math.cos((i * Math.PI) / 6), Math.sin((i * Math.PI) / 6)] as const);

/**
 * Selection outline that hugs the item's actual shape: the shape drawn a few times, shifted
 * outward in every direction and flattened to one colour, behind the item itself. A thin dark
 * ring inside the coloured one keeps it readable on items of the same colour.
 */
function SelectOutline(p: { item: Item; actors: readonly Actor[]; colors: CanvasColors; scale: number; color: string }) {
  return (
    <>
      <OutlineRing {...p} widthPx={6} />
      <OutlineRing {...p} color="#141518" widthPx={1.6} />
    </>
  );
}

function OutlineRing({
  item,
  actors,
  colors,
  scale,
  color,
  widthPx,
}: {
  item: Item;
  actors: readonly Actor[];
  colors: CanvasColors;
  scale: number;
  color: string;
  widthPx: number;
}) {
  const ref = useRef<Konva.Group>(null);
  // widthPx on screen, but never more than a fifth of the item's size (zoomed out, a fixed
  // width would swamp small items); at least 1.5 px so it stays visible.
  const look = itemLook(item);
  const size = item.wall ? (item.wall.thicknessCm ?? DEFAULT_WALL_CM) * 2 : Math.max(look.w, look.d);
  const k = widthPx / 6;
  const d = Math.min(widthPx / scale, Math.max(size * 0.2 * k, (1.5 * k) / scale));
  const rgb = /^#?([0-9a-f]{6})$/i.exec(color);
  const n = rgb ? parseInt(rgb[1]!, 16) : 0xf0a23b;
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.clearCache();
    // Cache sharp at the current zoom (capped so huge walls don't make huge bitmaps).
    const box = g.getClientRect({ skipTransform: true });
    const ratio = Math.min(scale * (window.devicePixelRatio || 1), 4096 / Math.max(1, box.width, box.height));
    g.cache({ pixelRatio: Math.max(0.5, ratio) });
    g.getLayer()?.batchDraw();
  }, [item, scale, color, actors]);
  return (
    <Group ref={ref} name="ui-only" listening={false} filters={[Konva.Filters.RGBA]} red={n >> 16} green={(n >> 8) & 255} blue={n & 255} alpha={1}>
      {OUTLINE_DIRS.map(([dx, dy], i) => (
        <Group key={i} x={dx * d} y={dy * d}>
          <ItemShape item={item} actors={actors} colors={colors} bodyOnly />
        </Group>
      ))}
      {/* Cut the shape itself out, so see-through parts (diffusion, glass) don't pick up the colour. */}
      {[0, 1, 2, 3].map((i) => (
        <Group key={`cut${i}`} globalCompositeOperation="destination-out">
          <ItemShape item={item} actors={actors} colors={colors} bodyOnly />
        </Group>
      ))}
    </Group>
  );
}

const NOTE_FONT = "'Barlow Semi Condensed', 'Arial Narrow', sans-serif";

/** Notes: text, an arrow pointing the way the item faces, or a marked area with its text. */
function NoteShape({ item, shape, w, d, c }: { item: Item; shape: string; w: number; d: number; c: CanvasColors }) {
  const color = item.note?.color ?? c.select;
  const text = item.note?.text ?? '';
  const size = item.note?.fontSize ?? 24;
  if (shape === 'note-arrow') {
    return (
      <>
        <Arrow points={[0, d / 2, 0, -d / 2]} stroke={color} fill={color} strokeWidth={5} pointerLength={22} pointerWidth={22} hitStrokeWidth={30} />
        {text && <Text text={text} x={-150} y={d / 2 + 6} width={300} align="center" fontSize={size * 0.8} fontFamily={NOTE_FONT} fontStyle="600" fill={color} />}
      </>
    );
  }
  if (shape === 'note-area') {
    return (
      <>
        <Rect x={-w / 2} y={-d / 2} width={w} height={d} stroke={color} strokeWidth={3} dash={[14, 8]} fill={color} opacity={1} fillEnabled={false} />
        <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={color} opacity={0.1} />
        {text && <Text text={text} x={-w / 2 + 10} y={-d / 2 + 8} width={w - 20} fontSize={size} fontFamily={NOTE_FONT} fontStyle="600" fill={color} />}
      </>
    );
  }
  return (
    <>
      <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={c.canvas} opacity={0.6} cornerRadius={6} />
      <Text text={text || 'Note'} x={-w / 2} y={-size / 2} width={w} align="center" fontSize={size} fontFamily={NOTE_FONT} fontStyle="600" fill={color} />
    </>
  );
}

/** A darker version of a #rrggbb colour (hair on the people icons). */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = (v: number) => Math.round(v * (1 - amount));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/** Mouse cursor for the rotate tool: a circular arrow (hotspot in the middle). */
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g fill="none" stroke-linecap="round"><path d="M22 14a8 8 0 1 1-2.3-5.6" stroke="#000" stroke-width="5"/><path d="M22 14a8 8 0 1 1-2.3-5.6" stroke="#fff" stroke-width="2.5"/></g><path d="M23.5 4.5l-.5 6.5-6.5-.5z" fill="#fff" stroke="#000" stroke-width="1"/></svg>',
)}") 14 14, crosshair`;

/** Rotate tool selection: a dashed ring with two curved arrows around the item. */
function RotateRing({ item, scale, color }: { item: Item; scale: number; color: string }) {
  const { w, d, shape } = itemLook(item);
  const px = 1 / scale;
  const r = (shape === 'person' ? 26 * ACTOR_SCALE : Math.max(w, d) / 2) + 14 * px;
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

/** The wall being drawn: placed corners, the next segment to the pointer and its length. */
function WallDraft({
  draft,
  hover,
  hint,
  split,
  closeAt,
  scale,
  colors: c,
}: {
  draft: Vec2[];
  hover: Vec2 | null;
  hint: string | null;
  split: [Vec2, Vec2] | null;
  closeAt: Vec2 | null;
  scale: number;
  colors: CanvasColors;
}) {
  const px = 1 / scale;
  const pts = hover && draft.length ? [...draft, hover] : draft;
  const last = draft[draft.length - 1];
  const len = hover && last ? Math.hypot(hover.x - last.x, hover.y - last.y) : 0;
  return (
    <Group name="ui-only" listening={false}>
      {pts.length > 1 && (
        <Line points={pts.flatMap((q) => [q.x, q.y])} stroke={c.select} strokeWidth={DEFAULT_WALL_CM} opacity={0.55} lineCap="square" lineJoin="miter" />
      )}
      {draft.map((q, i) => (
        <Circle key={i} x={q.x} y={q.y} radius={5 * px} fill={c.select} />
      ))}
      {closeAt && <Circle x={closeAt.x} y={closeAt.y} radius={13 * px} stroke={c.select} strokeWidth={3 * px} />}
      {hover && split && <Dims seg={split} parts={split.map((end) => [hover, end] as [Vec2, Vec2])} scale={scale} colors={c} />}
      {hover && hint && (
        <>
          <Circle x={hover.x} y={hover.y} radius={9 * px} stroke={c.select} strokeWidth={2 * px} />
          <Text x={hover.x + 14 * px} y={hover.y - 22 * px} text={hint} fontSize={13 * px} fontStyle="bold" fill={c.select} />
        </>
      )}
      {hover && <Circle x={hover.x} y={hover.y} radius={4 * px} stroke={c.select} strokeWidth={2 * px} />}
      {hover && last && len > 1 && (
        <Text
          x={(hover.x + last.x) / 2 + 10 * px}
          y={(hover.y + last.y) / 2 + 10 * px}
          text={`${(len / 100).toFixed(2)} m`}
          fontSize={13 * px}
          fontFamily="'IBM Plex Mono', monospace"
          fill={c.label}
        />
      )}
    </Group>
  );
}

/**
 * Measured parts along a wall segment `seg`: a line per part with its length beside it, pushed
 * off the wall to one side. Used when adding a corner and when moving or resizing doors and windows.
 */
function Dims({
  seg,
  parts,
  flip = [],
  scale,
  colors: c,
}: {
  seg: [Vec2, Vec2];
  parts: [Vec2, Vec2][];
  /** Parts whose label goes on the other side of the wall (so short neighbours don't overlap). */
  flip?: number[];
  scale: number;
  colors: CanvasColors;
}) {
  const px = 1 / scale;
  const segLen = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y) || 1;
  const nx = -(seg[1].y - seg[0].y) / segLen;
  const ny = (seg[1].x - seg[0].x) / segLen;
  const off = 22 * px;
  return (
    <Group name="ui-only" listening={false}>
      {parts.map(([from, to], i) => {
        const len = Math.hypot(to.x - from.x, to.y - from.y);
        if (len < 1) return null;
        const side = flip.includes(i) ? -1 : 1;
        return (
          <Group key={i}>
            <Line points={[from.x, from.y, to.x, to.y]} stroke={c.select} strokeWidth={2 * px} />
            <Circle x={from.x} y={from.y} radius={3.5 * px} fill={c.select} />
            <Circle x={to.x} y={to.y} radius={3.5 * px} fill={c.select} />
            <Text
              x={(from.x + to.x) / 2 + nx * off * side - 30 * px}
              y={(from.y + to.y) / 2 + ny * off * side - 7 * px}
              width={60 * px}
              align="center"
              text={`${(len / 100).toFixed(2)} m`}
              fontSize={13 * px}
              fontFamily="'IBM Plex Mono', monospace"
              fill={c.label}
            />
          </Group>
        );
      })}
    </Group>
  );
}

/** Measurements for a door or window at `center`, `w` wide, in wall segment `seg`: corner → edge, its width, edge → corner. */
function OpeningDims({ seg, center, w, scale, colors }: { seg: [Vec2, Vec2]; center: Vec2; w: number; scale: number; colors: CanvasColors }) {
  const [a, b] = seg;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const e1 = { x: center.x - (u.x * w) / 2, y: center.y - (u.y * w) / 2 };
  const e2 = { x: center.x + (u.x * w) / 2, y: center.y + (u.y * w) / 2 };
  return <Dims seg={seg} parts={[[a, e1], [e1, e2], [e2, b]]} flip={[1]} scale={scale} colors={colors} />;
}

/** Doors, top down, centred, along x; the swing side is -y. */
function DoorShape({ style, w, d, c }: { style: string; w: number; d: number; c: CanvasColors }) {
  const hw = w / 2;
  const hd = Math.max(d, 6) / 2;
  const gap = <Rect x={-hw} y={-hd} width={w} height={hd * 2} fill={c.canvas} />;
  const jambs = (
    <>
      <Line points={[-hw, -hd, -hw, hd]} stroke={c.set} strokeWidth={3} />
      <Line points={[hw, -hd, hw, hd]} stroke={c.set} strokeWidth={3} />
    </>
  );
  const leaf = { stroke: c.label, strokeWidth: 3 };
  const swing = { stroke: c.label, strokeWidth: 1.2, dash: [6, 5], opacity: 0.7 };
  switch (style) {
    case 'double':
      return (
        <>
          {gap}
          {jambs}
          <Line points={[-hw, -hd, -hw, -hd - hw]} {...leaf} />
          <Line points={[hw, -hd, hw, -hd - hw]} {...leaf} />
          <Arc x={-hw} y={-hd} innerRadius={hw} outerRadius={hw} angle={90} rotation={-90} {...swing} />
          <Arc x={hw} y={-hd} innerRadius={hw} outerRadius={hw} angle={90} rotation={180} {...swing} />
        </>
      );
    case 'sliding':
      return (
        <>
          {gap}
          {jambs}
          <Rect x={-hw} y={-4} width={w * 0.55} height={4} fill={c.label} />
          <Rect x={hw - w * 0.55} y={0} width={w * 0.55} height={4} fill={c.label} />
        </>
      );
    case 'pocket':
      return (
        <>
          {gap}
          {jambs}
          <Rect x={hw} y={-hd + 2} width={w * 0.9} height={hd * 2 - 4} stroke={c.label} strokeWidth={1} dash={[5, 4]} opacity={0.7} />
          <Rect x={-hw * 0.3} y={-2} width={hw * 1.3 + w * 0.4} height={4} fill={c.label} />
        </>
      );
    case 'bifold':
      return (
        <>
          {gap}
          {jambs}
          <Line points={[-hw, -hd, -hw + w * 0.15, -hd - w * 0.22, -hw + w * 0.3, -hd]} {...leaf} lineJoin="round" />
          <Line points={[hw, -hd, hw - w * 0.15, -hd - w * 0.22, hw - w * 0.3, -hd]} {...leaf} lineJoin="round" />
        </>
      );
    case 'barn':
      return (
        <>
          {gap}
          {jambs}
          <Line points={[-hw - 10, -hd - 7, hw + w, -hd - 7]} stroke={c.set} strokeWidth={1.5} />
          <Rect x={-hw + w * 0.45} y={-hd - 12} width={w * 1.05} height={6} fill={c.label} />
        </>
      );
    case 'garage':
      return (
        <>
          {gap}
          {jambs}
          <Rect x={-hw} y={-2} width={w} height={4} fill={c.label} opacity={0.8} />
          <Rect x={-hw} y={hd} width={w} height={w * 0.75} stroke={c.label} strokeWidth={1.2} dash={[8, 6]} opacity={0.6} />
        </>
      );
    default: // single
      return (
        <>
          {gap}
          {jambs}
          <Line points={[-hw, -hd, -hw, -hd - w]} {...leaf} />
          <Arc x={-hw} y={-hd} innerRadius={w} outerRadius={w} angle={90} rotation={-90} {...swing} />
        </>
      );
  }
}

/** Windows, top down, centred, along x; the outside is -y. */
function WindowShape({ style, w, d, c }: { style: string; w: number; d: number; c: CanvasColors }) {
  const hw = w / 2;
  const hd = Math.max(d, 6) / 2;
  const frame = <Rect x={-hw} y={-hd} width={w} height={hd * 2} fill={c.canvas} stroke={c.set} strokeWidth={2} />;
  const glass = { stroke: c.label, strokeWidth: 2 };
  const swing = { stroke: c.label, strokeWidth: 1.2, dash: [5, 4], opacity: 0.7 };
  switch (style) {
    case 'casement':
      return (
        <>
          {frame}
          <Line points={[-hw, 0, hw, 0]} {...glass} />
          <Arc x={-hw} y={-hd} innerRadius={w} outerRadius={w} angle={90} rotation={-90} {...swing} />
        </>
      );
    case 'double-casement':
      return (
        <>
          {frame}
          <Line points={[-hw, 0, hw, 0]} {...glass} />
          <Arc x={-hw} y={-hd} innerRadius={hw} outerRadius={hw} angle={90} rotation={-90} {...swing} />
          <Arc x={hw} y={-hd} innerRadius={hw} outerRadius={hw} angle={90} rotation={180} {...swing} />
        </>
      );
    case 'sliding':
      return (
        <>
          {frame}
          <Line points={[-hw, -2, -hw + w * 0.55, -2]} {...glass} />
          <Line points={[hw - w * 0.55, 2, hw, 2]} {...glass} />
        </>
      );
    case 'picture':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={hd * 2} fill={c.canvas} stroke={c.set} strokeWidth={3.5} />
          <Line points={[-hw, 0, hw, 0]} stroke={c.label} strokeWidth={3} />
        </>
      );
    case 'bay': {
      const out = [-hw, -hd, -hw + w * 0.2, -hd - w * 0.25, hw - w * 0.2, -hd - w * 0.25, hw, -hd];
      return (
        <>
          {frame}
          <Line points={out} stroke={c.set} strokeWidth={hd * 2} lineJoin="miter" />
          <Line points={out} {...glass} lineJoin="miter" />
        </>
      );
    }
    case 'floor-to-ceiling':
      return (
        <>
          {frame}
          <Line points={[-hw, 0, hw, 0]} {...glass} />
          {[-0.25, 0, 0.25].map((f) => (
            <Line key={f} points={[f * w, -hd, f * w, hd]} stroke={c.set} strokeWidth={3} />
          ))}
        </>
      );
    default: // standard
      return (
        <>
          {frame}
          <Line points={[-hw, 0, hw, 0]} {...glass} />
        </>
      );
  }
}

/** Furniture and props, top down, front (-y) up. */
function PropShape({ style, w, d, c }: { style: string; w: number; d: number; c: CanvasColors }) {
  const hw = w / 2;
  const hd = d / 2;
  const base = { fill: c.prop };
  const detail = { stroke: c.canvas, strokeWidth: 2, opacity: 0.8 };
  const green = c.chroma;
  switch (style) {
    case 'table':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={3} {...base} />
          <Rect x={-hw + 6} y={-hd + 6} width={w - 12} height={d - 12} cornerRadius={2} {...detail} />
        </>
      );
    case 'round-table':
      return (
        <>
          <Circle radius={hw} {...base} />
          <Circle radius={hw - 7} {...detail} />
        </>
      );
    case 'desk':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={2} {...base} />
          <Rect x={-w * 0.2} y={hd - 14} width={w * 0.4} height={5} fill={c.grip} />
        </>
      );
    case 'chair':
      return (
        <>
          <Rect x={-hw * 0.85} y={-hd * 0.85} width={w * 0.85} height={d * 0.75} cornerRadius={4} {...base} />
          <Rect x={-hw} y={hd - d * 0.22} width={w} height={d * 0.22} cornerRadius={3} {...base} />
        </>
      );
    case 'office-chair':
      return (
        <>
          {[0, 72, 144, 216, 288].map((a) => {
            const r = (a * Math.PI) / 180;
            return <Line key={a} points={[0, 0, Math.sin(r) * hw, -Math.cos(r) * hw]} stroke={c.prop} strokeWidth={4} lineCap="round" />;
          })}
          <Circle radius={hw * 0.6} {...base} />
          <Arc innerRadius={hw * 0.55} outerRadius={hw * 0.8} angle={140} rotation={20} {...base} />
        </>
      );
    case 'armchair':
    case 'sofa': {
      const arm = Math.min(w * 0.14, 22);
      const back = d * 0.25;
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={8} {...base} />
          <Rect x={-hw} y={hd - back} width={w} height={back} cornerRadius={6} fill={c.grip} opacity={0.35} />
          <Rect x={-hw} y={-hd} width={arm} height={d} cornerRadius={6} fill={c.grip} opacity={0.35} />
          <Rect x={hw - arm} y={-hd} width={arm} height={d} cornerRadius={6} fill={c.grip} opacity={0.35} />
          {style === 'sofa' && <Line points={[0, -hd + 4, 0, hd - back]} {...detail} />}
        </>
      );
    }
    case 'stool':
      return <Circle radius={hw} {...base} />;
    case 'bench':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={3} {...base} />
          <Line points={[-hw + 6, 0, hw - 6, 0]} {...detail} />
        </>
      );
    case 'bed': {
      const pillows = w > 120 ? 2 : 1;
      const pw = (w - 16 - (pillows - 1) * 8) / pillows;
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={4} {...base} />
          {Array.from({ length: pillows }, (_, i) => (
            <Rect key={i} x={-hw + 8 + i * (pw + 8)} y={-hd + 8} width={pw} height={d * 0.16} cornerRadius={6} fill={c.label} opacity={0.75} />
          ))}
          <Rect x={-hw} y={-hd + d * 0.3} width={w} height={d * 0.7} cornerRadius={4} fill={c.grip} opacity={0.3} />
        </>
      );
    }
    case 'cabinet':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={2} {...base} />
          <Line points={[0, -hd, 0, hd]} {...detail} />
          <Line points={[-hw, -hd + 3, hw, -hd + 3]} stroke={c.grip} strokeWidth={3} />
        </>
      );
    case 'shelf':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} {...base} />
          {[-1 / 6, 1 / 6].map((f) => (
            <Line key={f} points={[f * w * 1.5, -hd, f * w * 1.5, hd]} {...detail} />
          ))}
        </>
      );
    case 'tv':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={2} {...base} />
          <Rect x={-hw * 0.9} y={-hd - 2} width={w * 0.9} height={5} fill={c.grip} />
        </>
      );
    case 'counter':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} {...base} />
          <Rect x={-hw + w * 0.15} y={-hd + 10} width={w * 0.22} height={d - 20} cornerRadius={6} {...detail} />
          {[0, 1, 2, 3].map((i) => (
            <Circle key={i} x={hw - w * 0.32 + (i % 2) * w * 0.12} y={-hd + d * 0.32 + Math.floor(i / 2) * d * 0.36} radius={Math.min(d * 0.13, 9)} {...detail} />
          ))}
        </>
      );
    case 'fridge':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={3} fill={c.label} opacity={0.8} />
          <Line points={[-hw, -hd + 6, hw, -hd + 6]} stroke={c.prop} strokeWidth={3} />
        </>
      );
    case 'rug':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} fill={c.prop} opacity={0.3} />
          <Rect x={-hw + 8} y={-hd + 8} width={w - 16} height={d - 16} stroke={c.prop} strokeWidth={2} dash={[10, 6]} />
        </>
      );
    case 'plant':
      return (
        <>
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const r = (a * Math.PI) / 180;
            return <Ellipse key={a} x={Math.sin(r) * hw * 0.5} y={-Math.cos(r) * hw * 0.5} radiusX={hw * 0.3} radiusY={hw * 0.5} rotation={a} fill={green} opacity={0.8} />;
          })}
          <Circle radius={hw * 0.3} fill={c.prop} />
        </>
      );
    case 'tree':
      return (
        <>
          {[0, 72, 144, 216, 288].map((a) => {
            const r = (a * Math.PI) / 180;
            return <Circle key={a} x={Math.sin(r) * hw * 0.4} y={-Math.cos(r) * hw * 0.4} radius={hw * 0.55} fill={green} opacity={0.45} />;
          })}
          <Circle radius={hw * 0.12} fill={c.grip} opacity={0.7} />
        </>
      );
    case 'car':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={w * 0.22} {...base} />
          <Rect x={-hw + w * 0.12} y={-hd + d * 0.22} width={w * 0.76} height={d * 0.14} cornerRadius={8} fill={c.grip} opacity={0.6} />
          <Rect x={-hw + w * 0.14} y={hd - d * 0.24} width={w * 0.72} height={d * 0.1} cornerRadius={8} fill={c.grip} opacity={0.6} />
          <Rect x={-hw - 8} y={-hd + d * 0.3} width={10} height={14} cornerRadius={3} {...base} />
          <Rect x={hw - 2} y={-hd + d * 0.3} width={10} height={14} cornerRadius={3} {...base} />
        </>
      );
    case 'piano':
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={3} fill={c.grip} opacity={0.85} />
          <Rect x={-hw + 6} y={-hd} width={w - 12} height={d * 0.3} fill={c.label} />
          {Array.from({ length: 12 }, (_, i) => (
            <Line key={i} points={[-hw + 6 + ((i + 1) * (w - 12)) / 13, -hd, -hw + 6 + ((i + 1) * (w - 12)) / 13, -hd + d * 0.3]} stroke={c.grip} strokeWidth={1} />
          ))}
        </>
      );
    default:
      return <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={4} {...base} />;
  }
}

/** A light meter's screen on the plan, in screen pixels (Sekonic-style: settings, big T-stop, light level, stop scale). */
const METER_CARD = { w: 156, h: 86 };
const SCALE_STOPS = ['1', '1.4', '2', '2.8', '4', '5.6', '8', '11', '16', '22', '32'];
/** Colour of each stop on the meter's scale: red past what lenses do, amber at the ends, green in between. */
const scaleColor = (k: number) => (k < 1 || k >= 9 ? '#c8382e' : k < 2 || k >= 8 ? '#c99a2e' : '#5d9a3c');

function MeterCard({ r, title }: { r: Reading; title?: string }) {
  const { w, h } = METER_CARD;
  const c = r.config;
  const parts = stopParts(r.tStop, c.step);
  const none = r.contributions.length === 0;
  const big = none ? '—' : parts.under ? '<1' : parts.over ? '>32' : parts.base;
  const bigW = textWidth(big, "600 {px}px 'Barlow Semi Condensed', sans-serif", 28);
  const level = c.unit === 'off' || none ? '' : c.unit === 'fc' ? `≈ ${r.footCandles.toLocaleString()} fc` : `≈ ${r.lux.toLocaleString()} lx`;
  const bar = { x: 8, y: h - 26, w: w - 16, h: 9 };
  const seg = bar.w / (SCALE_STOPS.length - 1);
  const at = Math.min(10, Math.max(0, Math.log2(Math.max(0.5, r.tStop) ** 2)));
  return (
    <Group>
      <Rect width={w} height={h} cornerRadius={9} fill="#121316" stroke="#34373d" strokeWidth={1} shadowColor="#000" shadowBlur={10} shadowOpacity={0.35} />
      <Text x={8} y={6} width={w - 16} text={title ?? `${c.fps} fps · ISO ${c.iso} · ${c.shutterDeg}°`} fontSize={9.5} fontFamily="'IBM Plex Mono', monospace" fill="#a3a8ae" wrap="none" ellipsis />
      <Text x={8} y={24} text="T" fontSize={12} fontStyle="600" fontFamily="'Barlow Semi Condensed', sans-serif" fill="#e8e6e2" />
      <Text x={20} y={16} text={big} fontSize={28} fontStyle="600" fontFamily="'Barlow Semi Condensed', sans-serif" fill="#ffffff" />
      {!none && parts.frac && <Text x={22 + bigW} y={28} text={parts.frac} fontSize={15} fontStyle="600" fontFamily="'Barlow Semi Condensed', sans-serif" fill="#ffffff" />}
      <Text x={w - 8 - 80} y={21} width={80} align="right" text={none ? 'no light' : level} fontSize={11} fontFamily="'IBM Plex Mono', monospace" fill="#e8e6e2" />
      <Text x={w - 8 - 80} y={36} width={80} align="right" text="approx." fontSize={8.5} fontStyle="italic" fontFamily="'IBM Plex Mono', monospace" fill="#8d9298" />
      {SCALE_STOPS.slice(0, -1).map((_, k) => (
        <Rect key={k} x={bar.x + k * seg} y={bar.y} width={seg - 0.5} height={bar.h} fill={scaleColor(k)} />
      ))}
      {SCALE_STOPS.map((s, k) =>
        k % 2 === 0 ? <Text key={s} x={bar.x + k * seg - 10} y={bar.y + bar.h + 2} width={20} align="center" text={s} fontSize={7.5} fontFamily="'IBM Plex Mono', monospace" fill="#a3a8ae" /> : null,
      )}
      {!none && <Rect x={bar.x + at * seg - 1.5} y={bar.y - 3} width={3} height={bar.h + 6} cornerRadius={1} fill="#ffffff" stroke="#121316" strokeWidth={1} />}
    </Group>
  );
}

/** Bottom-left of the plan (and of exports): a north arrow (with the sun when it's on) and a scale bar. */
function PlanCorner({ view, height, colors: c, sun }: { view: View; height: number; colors: CanvasColors; sun?: { azimuthDeg: number } }) {
  let cm = 10000;
  for (const v of [10, 25, 50, 100, 200, 500, 1000, 2000, 5000]) {
    if (v * view.scale >= 60) {
      cm = v;
      break;
    }
  }
  const px = cm * view.scale;
  const label = cm >= 100 ? `${cm / 100} m` : `${cm} cm`;
  const r = 20;
  const sunAt = sun ? { x: Math.sin((sun.azimuthDeg * Math.PI) / 180) * r, y: -Math.cos((sun.azimuthDeg * Math.PI) / 180) * r } : null;
  return (
    <Group name="plan-corner" x={(16 - view.x) / view.scale} y={(height - 16 - view.y) / view.scale} scaleX={1 / view.scale} scaleY={1 / view.scale} listening={false}>
      {/* North: the top of the plan. */}
      <Group x={r + 2} y={-r - 40}>
        <Circle radius={r} fill={c.labelBg} stroke={c.label} strokeWidth={1} opacity={0.9} />
        <Line points={[0, -r + 4, 6, 6, 0, 2, -6, 6]} closed fill={c.label} />
        <Text x={-10} y={-r - 16} width={20} align="center" text="N" fontSize={12} fontStyle="700" fontFamily="'Barlow Semi Condensed', sans-serif" fill={c.label} />
        {sunAt && <Circle x={sunAt.x} y={sunAt.y} radius={5} fill="#f5c04a" stroke={c.labelBg} strokeWidth={1.5} />}
      </Group>
      {/* Scale: two halves, light and dark. */}
      <Group y={-8}>
        <Rect width={px} height={6} fill={c.labelBg} stroke={c.label} strokeWidth={1} />
        <Rect width={px / 2} height={6} fill={c.label} />
        <Text y={-15} text="0" fontSize={11} fontFamily="'IBM Plex Mono', monospace" fill={c.label} />
        <Text x={px - 60} y={-15} width={60} align="right" text={label} fontSize={11} fontFamily="'IBM Plex Mono', monospace" fill={c.label} />
      </Group>
    </Group>
  );
}

const attachRadiusCm = (i: Item) => Math.max(20, Math.max(itemLook(i).w, itemLook(i).d) / 2);

/** The item at `at` (plan cm) that `child` could hang on: any category, walls by their line; `tolCm` of slack. */
export function findAttachTarget(child: Item, at: Vec2, all: readonly Item[], tolCm: number): Item | null {
  let best: { item: Item; d: number } | null = null;
  for (const o of all) {
    if (o.hidden || !canAttach(child, o, all)) continue;
    let d: number;
    if (o.wall) {
      const t = (o.wall.thicknessCm ?? DEFAULT_WALL_CM) / 2;
      d = Math.min(...wallSegments(o).map(([a, b]) => distToSegment(at, a, b))) - t;
    } else d = Math.hypot(at.x - o.pos.x, at.y - o.pos.y) - attachRadiusCm(o) * 0.8;
    if (d <= tolCm && (!best || d < best.d)) best = { item: o, d };
  }
  return best?.item ?? null;
}

/**
 * Someone watching a monitor: a person in the camera colour, turned to face `look` (in the
 * item's frame; straight up when not given), optionally wearing headphones.
 */
function viewerShape(x: number, y: number, c: CanvasColors, scale = PERSON_SCALE, look?: Vec2, headphones = false) {
  const turn = look ? aimAt({ x, y }, look) : 0;
  return (
    <Group key={x} x={x} y={y} scaleX={scale} scaleY={scale} rotation={turn}>
      <Rect x={-22} y={-10} width={44} height={20} cornerRadius={10} fill={c.camera} opacity={0.85} />
      <Circle radius={9} fill={c.camera} stroke={c.canvas} strokeWidth={2} />
      <Line points={[-4, -11, 0, -18, 4, -11]} closed fill={c.camera} />
      {headphones && (
        <>
          {/* Band over the crown, ear cups on both sides. */}
          <Arc angle={180} rotation={0} innerRadius={8.5} outerRadius={11} fill={c.grip} />
          <Rect x={-13} y={-4.5} width={5} height={9} cornerRadius={2} fill={c.grip} stroke={c.canvas} strokeWidth={0.8} />
          <Rect x={8} y={-4.5} width={5} height={9} cornerRadius={2} fill={c.grip} stroke={c.canvas} strokeWidth={0.8} />
        </>
      )}
    </Group>
  );
}

/**
 * Drawing order on the plan, bottom to top: marked areas, walls, doors and windows, set pieces
 * and furniture, people, then lights, grip and camera gear (always on top of the actors), then notes.
 */
export function drawLayer(i: Item): number {
  const shape = itemLook(i).shape;
  if (shape === 'note-area') return 0;
  if (i.wall) return 1;
  if (i.inWall) return 2;
  if (i.kind === 'note') return 9;
  if (i.kind === 'person') return 4;
  if (isMeter(i)) return 8;
  // Cameras sit on top of everything they ride on (dolly, crane) and of grip.
  if (i.kind === 'camera') return 7;
  if (i.kind === 'light' || i.kind === 'modifier') return 6;
  if (i.kind === 'grip' || modeOf(i) === 'camera') return 5; // grip, dollies, cranes, monitors
  return 3; // set pieces, furniture, props
}

/** Distance from `p` to the segment a–b. */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of a line of text in plan units (`font` has {px} for the size). */
function textWidth(text: string, font: string, size: number): number {
  if (!text) return 0;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * size * 0.5;
  measureCtx.font = font.replace('{px}', '100');
  return (measureCtx.measureText(text).width / 100) * size;
}

function labelOffset(item: Item): number {
  const { d, shape } = itemLook(item);
  if (shape === 'person') return 18 * ACTOR_SCALE;
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
export function ItemShape({
  item,
  actors,
  colors,
  bodyOnly,
  muted,
  tone,
}: {
  item: Item;
  actors: readonly Actor[];
  colors: CanvasColors;
  /** Leave out the camera's angle-of-view cone (for the selection outline). */
  bodyOnly?: boolean;
  /** Greyed out: not in the category being edited. */
  muted?: boolean;
  /** Sitting on this many items of its own kind: drawn in a shifted shade so it doesn't vanish into them. */
  tone?: number;
}) {
  const c = muted ? mutedColors(tonedColors(colors, tone ?? 0)) : tonedColors(colors, tone ?? 0);
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
          {!bodyOnly && (() => {
            // Angle of view from the lens; drawn 6.6 m long.
            const fov = horizontalFovDeg(item.camera?.focalMm ?? DEFAULT_LENS_MM);
            // A faint fill with dashed edges, so it doesn't cover the plan like a light's beam.
            const edge = (deg: number) => {
              const r = ((deg - 90) * Math.PI) / 180;
              return [0, 0, Math.cos(r) * CAMERA_CONE_CM, Math.sin(r) * CAMERA_CONE_CM];
            };
            return (
              <Group listening={false}>
                <Wedge radius={CAMERA_CONE_CM} angle={fov} rotation={-90 - fov / 2} fill={c.cameraFov} opacity={0.35} />
                {[-fov / 2, fov / 2].map((d) => (
                  <Line key={d} points={edge(d)} stroke={c.camera} strokeWidth={1.5} strokeScaleEnabled={false} dash={[7, 6]} opacity={0.8} />
                ))}
              </Group>
            );
          })()}
          <Rect x={-13} y={-14} width={26} height={34} cornerRadius={3} fill={c.camera} />
          <Rect x={-8} y={-26} width={16} height={13} cornerRadius={2} fill={c.camera} />
          <Rect x={-9} y={-6} width={18} height={14} cornerRadius={2} fill={c.canvas} opacity={0.35} />
        </>
      );
    case 'meter':
      // Incident meter: a small body with the white dome facing the front (up).
      return (
        <>
          <Rect x={-7} y={-4} width={14} height={14} cornerRadius={3} fill={c.camera} />
          <Circle y={-5} radius={6} fill="#f4f2ee" stroke={c.camera} strokeWidth={1.5} />
        </>
      );
    case 'monitor': {
      // A monitor on a stand with one person in front of it, watching (the light edge is the screen).
      const top = -Math.max(hd, 30);
      return (
        <>
          <Rect x={-hw * 0.3} y={top} width={hw * 0.6} height={5} cornerRadius={2.5} fill={c.camera} opacity={0.7} />
          <Rect x={-hw} y={top + 5} width={w} height={8} cornerRadius={2} fill={c.camera} />
          <Line points={[-hw + 3, top + 13, hw - 3, top + 13]} stroke={c.label} strokeWidth={2} />
          {viewerShape(0, top + 48, c, PERSON_SCALE, undefined, true)}
        </>
      );
    }
    case 'video-village': {
      // Large monitor at the front, three people in front of it watching (facing it), one colour.
      const mw = Math.min(w * 0.7, 130);
      // Three side by side, each turned to the middle of the screen.
      const screen = { x: 0, y: -hd + 10 };
      const viewer = (x: number) => viewerShape(x, hd - 36, c, Math.min(PERSON_SCALE, (w * 0.32) / 46), screen);
      return (
        <>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={8} stroke={c.camera} strokeWidth={1.5} dash={[6, 5]} opacity={0.6} />
          <Rect x={-mw / 2} y={-hd + 6} width={mw} height={9} cornerRadius={2} fill={c.camera} />
          <Line points={[-mw / 2 + 3, -hd + 15, mw / 2 - 3, -hd + 15]} stroke={c.label} strokeWidth={2} />
          <Rect x={-7} y={-hd + 15} width={14} height={14} fill={c.camera} opacity={0.7} />
          {viewer(-w * 0.34)}
          {viewer(0)}
          {viewer(w * 0.34)}
        </>
      );
    }
    case 'crane':
      // Base at the back, arm reaching forward to the head (the camera goes there), counterweight behind.
      return (
        <>
          <Circle x={0} y={hd - 45} radius={40} stroke={c.camera} strokeWidth={3} />
          <Rect x={-6} y={-hd + 20} width={12} height={d - 40} cornerRadius={4} fill={c.camera} opacity={0.75} />
          <Rect x={-16} y={hd - 26} width={32} height={22} cornerRadius={3} fill={c.camera} />
          <Circle x={0} y={-hd + 20} radius={10} stroke={c.camera} strokeWidth={3} />
        </>
      );
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
      const fill = (actor?.color && (muted ? greyOf(actor.color, c.canvas) : actor.color)) ?? (item.catalogId === 'generic.person.crew' ? c.prop : c.person);
      // Seen from above, facing up (-y). Female: narrower rounded shoulders and long hair
      // falling down the back; male: broad shoulders, short hair.
      const hair = shade(fill, 0.45);
      return actor?.gender === 'female' ? (
        <Group scaleX={ACTOR_SCALE} scaleY={ACTOR_SCALE}>
          <Ellipse radiusX={21} radiusY={10.5} fill={fill} opacity={0.9} />
          <Line points={[-10, -1, -8.5, 9, -3.5, 17, 0, 19, 3.5, 17, 8.5, 9, 10, -1]} closed tension={0.4} fill={hair} />
          <Circle radius={9} fill={fill} stroke={c.canvas} strokeWidth={1.5} />
          <Arc radius={9} innerRadius={0} outerRadius={9.6} angle={200} rotation={-10} fill={hair} />
          <Line points={[-4, -9.5, 0, -16.5, 4, -9.5]} closed fill={fill} />
        </Group>
      ) : (
        <Group scaleX={ACTOR_SCALE} scaleY={ACTOR_SCALE}>
          <Rect x={-25} y={-11} width={50} height={22} cornerRadius={11} fill={fill} opacity={0.9} />
          <Circle radius={10} fill={fill} stroke={c.canvas} strokeWidth={2} />
          <Arc radius={10} innerRadius={0} outerRadius={8} angle={180} fill={hair} />
          <Line points={[-5, -12, 0, -20, 5, -12]} closed fill={fill} />
        </Group>
      );
    }
    case 'wall': {
      const chroma = item.catalogId?.includes('green-screen');
      return <Rect x={-hw} y={-hd} width={w} height={d} fill={chroma ? c.chroma : c.set} cornerRadius={1} />;
    }
    case 'walls': {
      const t = item.wall?.thicknessCm ?? DEFAULT_WALL_CM;
      const pts = (item.wall?.points ?? []).flatMap((q) => [q.x, q.y]);
      // Drawn like an architect's plan: a dark edge on both faces, a solid core.
      return (
        <>
          <Line name="wall-line" points={pts} closed={!!item.wall?.closed} fillEnabled={false} stroke={c.wallEdge} strokeWidth={t} lineJoin="miter" lineCap="square" hitStrokeWidth={Math.max(t, 24)} />
          <Line name="wall-line" points={pts} closed={!!item.wall?.closed} fillEnabled={false} stroke={c.set} strokeWidth={Math.max(t * 0.5, t - 5)} lineJoin="miter" lineCap="square" listening={false} />
        </>
      );
    }
    case 'door':
      return <DoorShape style={libraryItem(item.catalogId)?.style ?? 'single'} w={w} d={d} c={c} />;
    case 'window':
      return <WindowShape style={libraryItem(item.catalogId)?.style ?? 'standard'} w={w} d={d} c={c} />;
    case 'note-text':
    case 'note-arrow':
    case 'note-area':
      return <NoteShape item={item} shape={shape} w={w} d={d} c={c} />;
    case 'prop':
      return <PropShape style={libraryItem(item.catalogId)?.style ?? 'box'} w={w} d={d} c={c} />;
    case 'round':
      return <Circle radius={hw} fill={c.prop} />;
    default:
      return <Rect x={-hw} y={-hd} width={w} height={d} fill={item.kind === 'set' ? c.set : c.prop} cornerRadius={4} />;
  }
}
