import Konva from 'konva';
import { lightColor, rgbCss } from '../model/color';
import { ShadowLayer, type LivePatch, type ShadowLive } from './ShadowLayer';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Arc, Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer, Wedge } from 'react-konva';
import type { Modifier } from '../catalog/schema';
import { FABRIC_FILL, fabricById } from '../library/fabrics';
import { isOpening, libraryItem } from '../library/items';
import { itemFixture, itemLook, itemModifiers } from '../model/gear';
import { aimAt, normDeg } from '../model/geometry';
import { DEFAULT_LENS_MM, horizontalFovDeg } from '../model/lens';
import { followsActorId, modeOf, sceneItems, twoShotTargets, type EditMode, type SceneDoc } from '../model/project';
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
/** Actors and crew on the plan: 15% bigger again than the people in a video village. */
const ACTOR_SCALE = PERSON_SCALE * 1.15;
const DEFAULT_THROW_CM = 300;
const CAMERA_CONE_CM = 660;
/** Hold a finger this long on an item to add it to the selection. */
const LONG_PRESS_MS = 500;

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
export function displayLabel(item: Item, actors: readonly Actor[] = [], opts: { unit?: boolean } = {}): string {
  const actor = item.actorId ? actors.find((a) => a.id === item.actorId) : undefined;
  const fabric = fabricById(item.grip?.fabric);
  const lib = libraryItem(item.catalogId);
  // Walls, doors and windows are self-explanatory: no label unless one was typed.
  if (!item.label && (item.wall || isOpening(item.catalogId))) return '';
  const base = itemFixture(item)?.model ?? lib?.name ?? '';
  const name = actor?.name ?? item.label ?? (fabric ? `${base} · ${fabric.name}` : base);
  // Light numbers (L1, L2…) are for lists; the plan shows just the name.
  const unit = opts.unit === false ? undefined : item.light?.unitId;
  return unit ? (name ? `${unit} · ${name}` : unit) : name;
}

/** What an item is called when it has no label: "Room"/"Walls" for wall chains, else its library name. */
export function itemName(item: Item): string {
  if (item.wall) return item.wall.closed ? 'Room' : 'Walls';
  return itemFixture(item)?.model ?? libraryItem(item.catalogId)?.name ?? item.kind;
}

/** A camera whose rotation is driven by its focus actor (when that actor is in the scene). */
export const isFocusLocked = (item: Item, all: readonly Item[]): boolean =>
  !!twoShotTargets(item, all) || (!!followsActorId(item) && all.some((a) => a.actorId === followsActorId(item)));

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
  /** Alt + drag of several selected items: copies moved by `delta`. */
  onDuplicateMany: (ids: string[], delta: Vec2) => void;
  colors: CanvasColors;
  /** Show the 50 cm grid (hidden it gives a clean plan; it is also left out of exports then). */
  showGrid: boolean;
  /** Draw shadows cast by the lights. */
  showShadows: boolean;
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

export type WallExtend = { wallId: string; atStart: boolean };

interface RotateSession {
  id: string;
  center: Vec2;
  startAngle: number;
  startRot: number;
  current: number;
  /** Other selected items turning by the same amount, with their starting rotation. */
  others: { id: string; start: number }[];
}

export function PlanCanvas(p: Props) {
  const { width, height, view, onView, scene, actors, dispatch, selection, onSelect, colors, showGrid, mode, tool } = p;
  const selected = selection.length === 1 ? selection[0]! : null;
  const multi = selection.length > 1;
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const pinch = useRef<{ dist: number; center: Vec2 } | null>(null);
  const rot = useRef<RotateSession | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Alt + drag: the originals, drawn in place while their copy is being dragged. */
  const [ghosts, setGhosts] = useState<Item[]>([]);
  const ghostOf = (i: Item): Item => ({ ...i, id: `${i.id}~original` });
  const all = sceneItems(scene);
  const visible = all.filter((i) => !i.hidden);
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
  const liveShadow = (id: string | null, patch?: LivePatch) => p.showShadows && shadowLive.current?.(id, patch);

  /** While an item is dragged, keep its beam and any cameras watching it in step. */
  const follow = (moved: Item, pos: Vec2) => {
    node(`${moved.id}-beam`)?.position(pos);
    liveShadow(moved.id, { pos });
    // The name stays under the item while it moves.
    node(`${moved.id}-label`)?.position({ x: pos.x - 200, y: pos.y + labelOffset(moved) });
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
  const groupOf = (item: Item) =>
    multi && selection.includes(item.id) && !isOpening(item.catalogId)
      ? all.filter((o) => o.id !== item.id && selection.includes(o.id) && !o.locked && !isOpening(o.catalogId))
      : [];
  const moveGroup = (delta: Vec2) => {
    for (const { item: o } of groupDrag.current) {
      const at = { x: o.pos.x + delta.x, y: o.pos.y + delta.y };
      node(o.id)?.position(at);
      if (o.wall) liveOpenings({ ...o, pos: at });
      follow(o, at);
    }
  };

  // ---- Box select: drag on empty space (mouse) selects the active category's items ----
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  const boxRef = useRef(box);
  boxRef.current = box;
  const endBox = () => {
    const b = boxRef.current;
    if (!b) return;
    setBox(null);
    const [l, r, t, btm] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1), Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
    if (r - l < 4 && btm - t < 4) {
      if (!b.add) onSelect(null);
      return;
    }
    const stage = stageRef.current!;
    const toScreen = (q: Vec2) => stage.getAbsoluteTransform().point(q);
    const inBox = (q: Vec2) => q.x >= l && q.x <= r && q.y >= t && q.y <= btm;
    const hits = visible
      .filter((i) => modeOf(i) === mode)
      .filter((i) => {
        // Walls: one of their corners in the box (their bounding box would catch too much).
        if (i.wall) return wallPoints(i).some((q) => inBox(toScreen(q)));
        const c = node(i.id)?.getClientRect({ skipShadow: true });
        return !!c && c.x < r && c.x + c.width > l && c.y < btm && c.y + c.height > t;
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

  const startRotate = (item: Item, group: Item[] = []) => {
    const ptr = worldPointer();
    if (!ptr) return;
    rot.current = {
      id: item.id,
      center: item.pos,
      startAngle: aimAt(item.pos, ptr),
      startRot: item.rotationDeg,
      current: item.rotationDeg,
      others: group.map((o) => ({ id: o.id, start: o.rotationDeg })),
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
    liveShadow(r.id, { rot: r.current });
    for (const o of r.others) {
      node(o.id)?.rotation(o.start + r.current - r.startRot);
      node(`${o.id}-beam`)?.rotation(o.start + r.current - r.startRot);
      liveShadow(o.id, { rot: o.start + r.current - r.startRot });
    }
  };

  const endRotate = () => {
    const r = rot.current;
    if (!r) return;
    rot.current = null;
    setTimeout(() => liveShadow(null), 60);
    if (r.current === r.startRot) return;
    if (r.others.length) dispatch({ type: 'rotateBy', ids: [r.id, ...r.others.map((o) => o.id)], deg: r.current - r.startRot });
    else dispatch({ type: 'rotate', id: r.id, rotationDeg: r.current });
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
    const active = modeOf(item) === mode;
    const canRotate = tool === 'rotate' && active && !item.locked && !isFocusLocked(item, all);
    const press = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!active) return;
      e.cancelBubble = true;
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
        opacity={active ? 1 : 0.5}
        draggable={active && tool === 'move' && !item.locked}
        onMouseDown={press}
        onTouchStart={press}
        onMouseEnter={() => active && !item.locked && setCursor(tool === 'move' ? 'move' : ROTATE_CURSOR)}
        onMouseLeave={() => setCursor('')}
        onDragStart={() => {
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
        <ItemShape item={item} actors={actors} colors={colors} />
      </Group>
    );
  };

  const beamColor = (item: Item) => {
    const c = lightColor(item);
    const strength = Math.min(1, Math.max(0.15, (item.light?.intensityPct ?? 100) / 100));
    return rgbCss(c.rgb, Math.max(0.05, 0.24 * strength * Math.max(0.3, c.transmission)));
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
      // The beam is drawn in the light's colour (temperature, HSI and gels), dimmer through dense gels.
      fillRadialGradientColorStops: [0, beamColor(item), 1, 'rgba(0,0,0,0)'],
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
    const text = displayLabel(item, actors, { unit: false });
    if (!text) return null;
    return (
      <Text
        key={`${item.id}-label`}
        id={`${item.id}-label`}
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
      onTouchMove={onTouchMove}
      onTouchEnd={() => {
        pinch.current = null;
        endRotate();
      }}
      onMouseLeave={() => {
        endRotate();
        endBox();
      }}
      onMouseDown={(e) => {
        if (e.target !== stageRef.current || e.evt.button !== 0) return;
        const pt = stageRef.current.getPointerPosition();
        if (pt) setBox({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add: e.evt.shiftKey });
      }}
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
        {p.showShadows && <ShadowLayer items={visible} liveRef={shadowLive} />}
        {ghosts.map((g) => beam(ghostOf(g)))}
      </Layer>
      <Layer>
        {ghosts.map((g) => (
          <Group key={`${g.id}~original`} x={g.pos.x} y={g.pos.y} rotation={g.rotationDeg} listening={false}>
            <ItemShape item={g} actors={actors} colors={colors} />
          </Group>
        ))}
        {ghosts.filter((g) => g.id === dragging).map((g) => label(ghostOf(g)))}
        {visible
          .filter((i) => scene.setItems.includes(i))
          .sort((a, b) => Number(!!b.wall) - Number(!!a.wall)) /* walls under doors and windows */
          .map(renderItem)}
        {visible.filter((i) => scene.items.includes(i)).map(renderItem)}
        {visible.map(label)}
        {tool === 'rotate' &&
          visible
            .filter((i) => selection.includes(i.id))
            .map((sel) => <RotateRing key={`${sel.id}-ring`} item={sel} scale={view.scale} color={colors.rotate} />)}
        {(() => {
          // Corner handles on a selected wall (Move tool): drag a corner to reshape the room.
          const sel = visible.find((i) => i.id === selected && i.wall);
          if (!sel || tool !== 'move' || p.wallTool || sel.locked || modeOf(sel) !== mode) return null;
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
                (node(sel.id) as Konva.Group | undefined)?.findOne<Konva.Line>('.wall-line')?.points(local.flatMap((q) => [q.x, q.y]));
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
  const d = widthPx / scale;
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
function ItemShape({
  item,
  actors,
  colors: c,
  bodyOnly,
}: {
  item: Item;
  actors: readonly Actor[];
  colors: CanvasColors;
  /** Leave out the camera's angle-of-view cone (for the selection outline). */
  bodyOnly?: boolean;
}) {
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
      return (
        <Line
          name="wall-line"
          points={(item.wall?.points ?? []).flatMap((q) => [q.x, q.y])}
          closed={!!item.wall?.closed}
          fillEnabled={false}
          stroke={c.set}
          strokeWidth={t}
          lineJoin="miter"
          lineCap="square"
          hitStrokeWidth={Math.max(t, 24)}
        />
      );
    }
    case 'door':
      return <DoorShape style={libraryItem(item.catalogId)?.style ?? 'single'} w={w} d={d} c={c} />;
    case 'window':
      return <WindowShape style={libraryItem(item.catalogId)?.style ?? 'standard'} w={w} d={d} c={c} />;
    case 'prop':
      return <PropShape style={libraryItem(item.catalogId)?.style ?? 'box'} w={w} d={d} c={c} />;
    case 'round':
      return <Circle radius={hw} fill={c.prop} />;
    default:
      return <Rect x={-hw} y={-hd} width={w} height={d} fill={item.kind === 'set' ? c.set : c.prop} cornerRadius={4} />;
  }
}
