import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { nextUnitId } from '../model/gear';
import { assemblyOf, attachmentFor, canAttach, isMeter, withMeters } from '../model/attach';
import { gearUsage, type GearList } from '../model/gearList';
import {
  EDIT_MODES,
  focusScene,
  KIND_ROLES,
  linkInterview,
  modeOf,
  newActor,
  newProject,
  sceneItems,
  type EditMode,
  type Category,
  inMode,
  type Project,
  type ProjectKind,
  type SceneDoc,
} from '../model/project';
import type { Actor, CastRole, Item, Vec2 } from '../model/types';
import { DEFAULT_CAMERA, type CameraSettings } from '../model/exposure';
import { circuitLoads, defaultBreakerA } from '../model/power';
import { PowerPanel } from './PowerPanel';
import { SchedulePanel } from './SchedulePanel';
import { ArrangeTools } from './ArrangeTools';
import { makeSetup, placeSetup } from '../model/setups';
import { LayersMenu } from './LayersMenu';
import { MenuButton } from './MenuButton';
import { clampInto, placeBar } from './barPlacement';
import { turnedCorners } from './fixtureShapes';
import { drawingFromStrokes, drawingNote, scaleDrawing, drawingStrokes, NOTE_DEFAULT_COLOR, noteColor, PEN_WIDTHS, strokesTouch } from '../model/notes';
import { parseProjectFile, projectFileName, toProjectFile } from '../model/projectFile';
import { extendWall, insertWallCorner, nearestWall, seatOpening, wallFromChain, wallPoints } from '../model/walls';
import { HelpPanel } from './HelpPanel';
import { isOpening, libraryItem } from '../library/items';
import { fixtureById, standById } from '../model/gear';
import { applyTemplate, getTemplate, type TemplateDefinition, type TemplateValues } from '../templates';
import { CategoryPanel, DRAG_TYPE, type PlaceRequest } from './CategoryPanel';
import { useConfirm } from './confirm';
import { Dialog } from './Dialog';
import { EquipmentPanel } from './EquipmentPanel';
import { liveScene, reducer, type SceneAction } from './doc';
import { GearListPanel } from './GearListPanel';
import type { GearScope } from './gearScope';
import {
  IconBack,
  IconChevron,
  IconEquipment,
  IconExport,
  IconFit,
  IconGearList,
  IconHelp,
  IconMinus,
  IconMove,
  IconPlus,
  IconRedo,
  IconReset,
  IconSelect,
  IconLink,
  IconGrip,
  IconMoon,
  IconSun,
  IconAutoTheme,
  IconCopy,
  IconTrash,
  IconClose,
  IconRotate,
  IconScale,
  IconGrid,
  IconShadow,
  IconSliders,
  IconSchedule,
  IconMeter,
  IconTemplates,
  IconUndo,
} from './icons';
import { Inspector } from './Inspector';
import { clampScale, displayLabel, findAttachTarget, meterName, itemName, PlanCanvas, zoomAt, type ExportPng, type LayerState, type Tool, type View, type WallExtend } from './PlanCanvas';
import { ProjectMenu } from './ProjectMenu';
import { deleteProject, listProjects, loadGearLists, loadProject, loadStartProject, saveGearLists, saveProject, loadSetups, saveSetups } from './storage';
import { TemplatePanel } from './TemplatePanel';
import { useCanvasColors } from './theme';

const uid = () => crypto.randomUUID();

/**
 * Template people join the project's cast. Their role comes from the template (interviewer,
 * interviewee) or the production type; a cast member with the same name is reused when not
 * already in the scene, otherwise a new one is created.
 */
function castTemplateItems(
  items: Item[],
  actors: Actor[],
  scene: Item[],
  kind: ProjectKind,
  /** The template's set pieces (lights can point at them by label: "#Green screen"). */
  setItems: Item[] = [],
): { items: Item[]; added: Actor[] } {
  const added: Actor[] = [];
  const taken = new Set(scene.map((i) => i.actorId).filter(Boolean));
  const out = items.map((i) => {
    if (i.kind !== 'person') return i;
    const { label, castRole, ...rest } = i;
    const role: CastRole = castRole ?? KIND_ROLES[kind][0]!;
    const roster = [...actors, ...added];
    let actor = label ? roster.find((a) => a.name === label && !taken.has(a.id)) : undefined;
    if (!actor) {
      actor = newActor(roster, { role, name: label });
      added.push(actor);
    }
    taken.add(actor.id);
    return { ...rest, actorId: actor.id };
  });
  // Templates point cameras and looks at their people as "@0", "@1"… (in the order they're listed).
  const cast = out.filter((i) => i.kind === 'person').map((i) => i.actorId!);
  const who = (ref?: string) => (ref?.startsWith('@') ? cast[Number(ref.slice(1))] : ref);
  const linked = out.map((item) => {
    let i = item;
    // Attached by label in the template ("#Dolly A"): hang it where it stands on that item.
    const onRef = i.attachedTo?.to.startsWith('#') ? [...setItems, ...out].find((x) => x.label === i.attachedTo!.to.slice(1)) : undefined;
    if (i.attachedTo?.to.startsWith('#')) i = { ...i, attachedTo: onRef ? attachmentFor(i, onRef) : undefined };
    const camRef = i.camera?.focusItemId?.startsWith('#') ? i.camera.focusItemId.slice(1) : undefined;
    if (camRef) i = { ...i, camera: { ...i.camera, focusItemId: [...setItems, ...out].find((x) => x.label === camRef)?.id } };
    const aimRef = i.light?.aimItemId?.startsWith('#') ? i.light.aimItemId.slice(1) : undefined;
    if (aimRef) i = { ...i, light: { ...i.light, aimItemId: [...setItems, ...out].find((x) => x.label === aimRef)?.id } };
    const look = who(i.lookAtActorId);
    const cam = i.camera && { ...i.camera, focusActorId: who(i.camera.focusActorId), twoShot: i.camera.twoShot && (i.camera.twoShot.map(who) as [string, string]) };
    return { ...i, ...(look !== i.lookAtActorId ? { lookAtActorId: look } : {}), ...(cam ? { camera: cam } : {}) };
  });
  return { items: linkInterview(linked, [...actors, ...added]), added };
}

function sampleProject(): Project {
  const p: Project = { ...newProject('Sample interview'), kind: 'doc' };
  const t = getTemplate('interview');
  if (!t) return p;
  const r = applyTemplate(t, { interviewees: 1, interviewers: 1, cameras: 2 }, { origin: { x: 0, y: 0 } });
  const cast = castTemplateItems(r.shots.flatMap((s) => s.items), [], [], 'doc', r.setItems);
  p.actors = cast.added;
  const scene = focusScene({ ...p.scenes[0]!, setItems: r.setItems, items: cast.items });
  p.scenes[0] = { ...scene, baseline: structuredClone({ setItems: scene.setItems, items: scene.items }) };
  return p;
}

/** Half the on-screen width and height of an item's footprint, turned as it is (at least 8 px). */
/**
 * An item's box on screen around its position (px): left, top, right, bottom offsets. A light's
 * box reaches forward over its modifiers (a softbox, a lantern), turned with the light.
 */
function screenExtents(i: Item, scale: number): { l: number; t: number; r: number; b: number } {
  const xs = turnedCorners(i).map((q) => q.x * scale);
  const ys = turnedCorners(i).map((q) => q.y * scale);
  // At least 8 px each way, so tiny things still get room.
  return { l: Math.min(-8, ...xs), t: Math.min(-8, ...ys), r: Math.max(8, ...xs), b: Math.max(8, ...ys) };
}

function fitView(items: Item[], width: number, height: number): View {
  if (items.length === 0 || width === 0) return { x: width / 2, y: height / 2, scale: 0.8 };
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const i of items) {
    const r = Math.max(60, (i.sizeCm?.w ?? 0) / 2);
    minX = Math.min(minX, i.pos.x - r);
    maxX = Math.max(maxX, i.pos.x + r);
    minY = Math.min(minY, i.pos.y - r);
    maxY = Math.max(maxY, i.pos.y + r);
  }
  const scale = clampScale(Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.7);
  return {
    scale,
    x: width / 2 - ((minX + maxX) / 2) * scale,
    y: height / 2 - ((minY + maxY) / 2) * scale,
  };
}

/** Pick a round scale-bar length that draws between ~40 and ~160 px. */
const fmtM = (cm: number) => `${(cm / 100).toFixed(2)} m`;


/** Small per-device settings, kept in localStorage. */
interface Prefs {
  grid: boolean;
  volts: 230 | 120;
  /** Draw walls: snap corners and angles. */
  wallSnap: boolean;
  /** Shadows cast by the lights. */
  shadows: boolean;
  /** Light meter readings under each person on the plan. */
  meter: boolean;
  /** Camera settings the meter's T-stops are for. */
  camera: CameraSettings;
  /** Breaker size per circuit, A (default by voltage). */
  breakerA?: number;
  /** Hidden / locked categories on the plan. */
  layers?: Partial<Record<Category, LayerState>>;
  beams?: boolean;
  /** Light or dark, or follow the device. */
  theme?: 'auto' | 'light' | 'dark';
}
const PREFS_KEY = 'lfpd.prefs.v1';
function loadPrefs(): Prefs {
  try {
    return { grid: true, volts: 230, wallSnap: true, shadows: true, meter: true, camera: DEFAULT_CAMERA, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { grid: true, volts: 230, wallSnap: true, shadows: true, meter: true, camera: DEFAULT_CAMERA };
  }
}

const MODE_LABEL: Record<EditMode, string> = { all: 'All', lights: 'Lights', grip: 'Grip', camera: 'Camera', scene: 'Scene', notes: 'Notes' };
const MODE_HINT: Record<EditMode, string> = {
  all: 'Everything can be picked and moved',
  lights: 'Only lights can be picked and moved',
  grip: 'Only grip can be picked and moved',
  camera: 'Only camera gear can be picked and moved',
  scene: 'Only people, set and props can be picked and moved',
  notes: 'Only notes, arrows and drawings can be picked and moved',
};

type DialogKind = 'templates' | 'gear' | 'equipment' | 'help' | 'power' | 'schedule' | null;

export function App() {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: loadStartProject() ?? sampleProject(),
    future: [],
  }));
  const project = history.present;
  const [sceneId, setSceneId] = useState(project.scenes[0]!.id);
  const savedScene: SceneDoc = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  /** Mid-gesture changes from the plan (drag, turn, scale): everything shows them as they happen. */
  const [live, setLive] = useState<ReadonlyMap<string, Partial<Item>> | null>(null);
  const scene = useMemo(() => (live ? liveScene(savedScene, live) : savedScene), [savedScene, live]);
  const items = sceneItems(scene);

  // Everything can be picked to start with; a category narrows it down once the plan is busy.
  const [mode, setMode] = useState<EditMode>('all');
  const [tool, setTool] = useState<Tool>('move');
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);
  /** Select mode (for touch): taps add to the selection or take out, a drag boxes more in. */
  const [pickMode, setPickMode] = useState(false);
  /** Selected items (box-select and Shift+click select several). */
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.length === 1 ? selection[0]! : null;
  /** The side panel shows the selection's settings only when asked (right-click, Configure, a list row); otherwise it stays on adding. */
  const [configuring, setConfiguring] = useState(false);
  useEffect(() => {
    if (!selection.length) setConfiguring(false);
  }, [selection.length]);
  const configure = (id?: string) => {
    if (id && !selection.includes(id)) setSelection([id]);
    setConfiguring(true);
    setSheetOpen(true);
  };
  const setSelected = (id: string | null) => setSelection(id ? [id] : []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // phones: side panel as a bottom sheet
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [gearLists, setGearLists] = useState<GearList[]>(loadGearLists);
  const exportRef = useRef<ExportPng | null>(null);
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [setups, setSetups] = useState(loadSetups);
  useEffect(() => saveSetups(setups), [setups]);
  const [setupName, setSetupName] = useState('');
  const stageBox = useRef<HTMLDivElement>(null);
  const colors = useCanvasColors();
  const confirm = useConfirm();

  const sd = (action: SceneAction) => dispatch({ type: 'scene', sceneId: scene.id, action });
  const kind: ProjectKind = project.kind ?? 'narrative';

  useEffect(() => saveProject(project), [project]);
  useEffect(() => saveGearLists(gearLists), [gearLists]);
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'light' || prefs.theme === 'dark') root.dataset.theme = prefs.theme;
    else delete root.dataset.theme;
  }, [prefs.theme]);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Not kept between visits.
    }
  }, [prefs]);
  useEffect(() => {
    if (scene.id !== sceneId) setSceneId(scene.id);
  }, [scene.id, sceneId]);

  useLayoutEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!view && size.width > 0) setView(fitView(items, size.width, size.height));
  }, [size, view, items]);

  const selectedItem: Item | undefined = items.find((i) => i.id === selected);
  const selectedItems = items.filter((i) => selection.includes(i.id));
  // ---- Selection bar: opens close to the selection where it covers least; drag its ends to move it ----
  const barRef = useRef<HTMLDivElement>(null);
  /** Name tags and meter screens on screen, reported by the plan. */
  const labelBoxes = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const [barSize, setBarSize] = useState({ w: 380, h: 46 });
  useLayoutEffect(() => {
    const el = barRef.current;
    if (el && (Math.abs(el.offsetWidth - barSize.w) > 1 || Math.abs(el.offsetHeight - barSize.h) > 1)) setBarSize({ w: el.offsetWidth, h: el.offsetHeight });
  });
  /** Moved by hand: offset of its corner from the selection's centre (until the selection changes). */
  const [barNudge, setBarNudge] = useState<{ key: string; dx: number; dy: number } | null>(null);
  const selKey = selection.join(',');
  const toScreen = (q: Vec2) => (view ? { x: view.x + q.x * view.scale, y: view.y + q.y * view.scale } : q);
  const selBox = (() => {
    if (!view || !selectedItems.length) return null;
    let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const i of selectedItems) {
      const e = i.wall ? { l: 0, t: 0, r: 0, b: 0 } : screenExtents(i, view.scale);
      for (const q of (i.wall ? wallPoints(i) : [i.pos]).map(toScreen)) [l, t, r, b] = [Math.min(l, q.x + e.l), Math.min(t, q.y + e.t), Math.max(r, q.x + e.r), Math.max(b, q.y + e.b)];
    }
    return { x: l, y: t, w: r - l, h: b - t };
  })();
  const barBounds = { x: 8, y: 56, w: size.width - 16, h: size.height - 56 - 64 };
  const selectionBarAt = (() => {
    if (!view || !selBox || !size.width) return null;
    const cx = selBox.x + selBox.w / 2;
    const cy = selBox.y + selBox.h / 2;
    if (barNudge?.key === selKey) {
      const p = clampInto({ x: cx + barNudge.dx, y: cy + barNudge.dy }, barSize, barBounds);
      return { left: p.x, top: p.y };
    }
    // What it shouldn't cover: other items and the name tags under them (and the selection's own tags).
    const obstacles = items
      .filter((i) => !i.hidden && !i.wall && !selection.includes(i.id))
      .map((i) => {
        const q = toScreen(i.pos);
        const e = screenExtents(i, view.scale);
        return { x: q.x + e.l, y: q.y + e.t, w: e.r - e.l, h: e.b - e.t };
      });
    // Name tags and light meter screens (the selection's own too), as last drawn.
    obstacles.push(...labelBoxes.current.map((b) => ({ ...b, weight: 3 })));
    const p = placeBar(selBox, barSize, obstacles, barBounds);
    return { left: p.x, top: p.y };
  })();
  /** Dragging the bar by one of its ends. */
  const barDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [barDragging, setBarDragging] = useState(false);
  const gripProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!selectionBarAt) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      barDrag.current = { x: e.clientX, y: e.clientY, ...selectionBarAt };
      setBarDragging(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = barDrag.current;
      if (!d || !selBox) return;
      const p = clampInto({ x: d.left + e.clientX - d.x, y: d.top + e.clientY - d.y }, barSize, barBounds);
      setBarNudge({ key: selKey, dx: p.x - (selBox.x + selBox.w / 2), dy: p.y - (selBox.y + selBox.h / 2) });
    },
    onPointerUp: () => {
      barDrag.current = null;
      setBarDragging(false);
    },
    onPointerCancel: () => {
      barDrag.current = null;
      setBarDragging(false);
    },
  };

  // ---- Link: drag from the bar's Link button onto something, or tap it and then tap the target ----
  const [linkPreview, setLinkPreview] = useState<{ from: string; at: Vec2 | null; target: string | null } | null>(null);
  const [linkArmed, setLinkArmed] = useState(false);
  const linkGesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const coarse = typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches;
  const toWorld = (clientX: number, clientY: number): Vec2 | null => {
    const rect = stageBox.current?.getBoundingClientRect();
    if (!rect || !view) return null;
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  };
  const linkTargetAt = (clientX: number, clientY: number) => {
    const at = toWorld(clientX, clientY);
    if (!at || !selectedItem || !view) return { at, target: null };
    return { at, target: findAttachTarget(selectedItem, at, items, (coarse ? 30 : 16) / view.scale) };
  };
  const canLink = !!selectedItem && !selectedItem.wall && !selectedItem.inWall;
  useEffect(() => {
    if (!linkArmed || !canLink) {
      if (linkArmed) setLinkArmed(false);
      return;
    }
    const el = stageBox.current;
    if (!el) return;
    // Armed: the next press on the plan picks what to attach to (and does nothing else).
    const move = (e: PointerEvent) => {
      const { at, target } = linkTargetAt(e.clientX, e.clientY);
      setLinkPreview({ from: selectedItem!.id, at, target: target?.id ?? null });
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { target } = linkTargetAt(e.clientX, e.clientY);
      if (target) attach(selectedItem!.id, target.id);
      setLinkArmed(false);
      setLinkPreview(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setLinkArmed(false);
      setLinkPreview(null);
    };
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  });
  useEffect(() => {
    setLinkArmed(false);
    setLinkPreview(null);
  }, [selKey]);
  const linkProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      linkGesture.current = { x: e.clientX, y: e.clientY, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const g = linkGesture.current;
      if (!g || !selectedItem) return;
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) g.moved = true;
      if (!g.moved) return;
      const { at, target } = linkTargetAt(e.clientX, e.clientY);
      setLinkPreview({ from: selectedItem.id, at, target: target?.id ?? null });
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const g = linkGesture.current;
      linkGesture.current = null;
      if (!g || !selectedItem) return;
      if (g.moved) {
        const { target } = linkTargetAt(e.clientX, e.clientY);
        if (target) attach(selectedItem.id, target.id);
        setLinkPreview(null);
      } else {
        // A tap: pick the target with the next tap on the plan.
        setLinkArmed((on) => !on);
        setLinkPreview(linkArmed ? null : { from: selectedItem.id, at: null, target: null });
      }
    },
    onPointerCancel: () => {
      linkGesture.current = null;
      setLinkPreview(null);
    },
  };

  useEffect(() => {
    // Selection only lives inside the active category and scene.
    const keep = selection.filter((id) => items.some((i) => i.id === id && inMode(i, mode)));
    if (keep.length !== selection.length) setSelection(keep);
  }, [selection, items, mode]);

  const activeList = gearLists.find((l) => l.id === project.gearListId) ?? null;
  const usage = useMemo(() => gearUsage(items), [items]);
  const gear: GearScope = { list: activeList, limit: !!project.gearLimit && !!activeList, usage };

  const switchMode = (m: EditMode) => {
    setMode(m);
    setSelected(null);
    setWallTool(false);
    setWallDraft([]);
  };

  // ---- Draw walls tool (SCENE) ----
  const [wallTool, setWallToolState] = useState(false);
  /** Drawing on the plan (Notes): on or off, and the pen. */
  const [drawing, setDrawingState] = useState(false);
  const [pen, setPen] = useState<{ color: string; width: (typeof PEN_WIDTHS)[number]['id'] }>({ color: NOTE_DEFAULT_COLOR, width: 'medium' });
  /** Drawings made since Draw was pressed: a stroke touching one of them joins it into one shape. */
  const drawSession = useRef<string[]>([]);
  const setDrawing = (on: boolean) => {
    setDrawingState(on);
    if (on) {
      setWallToolState(false);
      setSelected(null);
      setPickMode(false);
    } else {
      // Finished: the shapes just drawn are picked, ready to move (W), turn (R) or scale.
      const made = drawSession.current.filter((id) => items.some((i) => i.id === id));
      if (made.length) setSelection(made);
    }
    drawSession.current = [];
  };
  const drawStroke = (points: Vec2[], strokeCm: number) => {
    const tol = Math.max(strokeCm, 6 / (view?.scale ?? 1));
    const touching = items.filter((i) => drawSession.current.includes(i.id) && drawingStrokes(i).some((st) => strokesTouch(st, points, tol + (i.note?.strokeCm ?? 0) / 2)));
    if (!touching.length) {
      const id = uid();
      drawSession.current.push(id);
      sd({ type: 'add', setItems: [], items: [{ id, kind: 'note', catalogId: 'generic.note.draw', ...drawingNote(points, pen.color, strokeCm) }] });
      return;
    }
    // Joined into one shape with everything it touches (in the first one's colour and width).
    const [keep, ...rest] = touching;
    const strokes = [...touching.flatMap(drawingStrokes), points];
    sd({ type: 'merge', id: keep!.id, patch: drawingFromStrokes(strokes, noteColor(keep!), keep!.note?.strokeCm ?? strokeCm), remove: rest.map((i) => i.id) });
    drawSession.current = drawSession.current.filter((id) => !rest.some((r) => r.id === id));
  };
  const [wallDraft, setWallDraft] = useState<Vec2[]>([]);
  const [wallExtend, setWallExtend] = useState<WallExtend | null>(null);
  const setDraft = (points: Vec2[], extend?: WallExtend) => {
    setWallDraft(points);
    if (extend) setWallExtend(extend);
    else if (!points.length) setWallExtend(null);
  };
  const setWallTool = (on: boolean) => {
    setWallToolState(on);
    setDraft([]);
    if (on) {
      setMode('scene');
      setSelected(null);
      setTool('move');
    }
  };
  const finishWalls = (closed: boolean) => {
    const extending = wallExtend && items.find((i) => i.id === wallExtend.wallId);
    if (extending) {
      const patches = extendWall(extending, wallExtend.atStart, wallDraft, closed, items);
      if (patches.length) sd({ type: 'updateMany', patches });
    } else {
      const wall = wallFromChain(uid(), wallDraft, closed);
      if (wall) sd({ type: 'add', setItems: [wall], items: [] });
    }
    setDraft([]); // keep the tool on to draw the next room
  };
  const insertCorner = (wallId: string, seg: number, offsetCm: number) => {
    const wall = items.find((i) => i.id === wallId);
    if (wall) sd({ type: 'updateMany', patches: insertWallCorner(wall, seg, offsetCm, items) });
  };
  /** The Finish button: keep what was drawn and leave the tool. */
  const doneWalls = () => {
    finishWalls(false);
    setWallTool(false);
  };
  /** Any other action (selecting, adding, another tool, a dialog) ends wall drawing, keeping what was drawn. */
  const leaveWalls = () => wallTool && doneWalls();
  const chooseTool = (t: Tool) => {
    leaveWalls();
    setTool(t);
    setScaling(false);
  };
  /** Scale (drawings): a corner handle on the selected drawing resizes it. */
  const [scaling, setScaling] = useState(false);
  useEffect(() => {
    if (selection.length || dialog) leaveWalls();
  }, [selection, dialog]);
  // Scale is for the drawing it was turned on for.
  useEffect(() => setScaling(false), [selection.join(',')]);

  const deleteSelected = () => {
    if (selection.length) sd({ type: 'delete', ids: selection });
    setSelection([]);
  };

  const viewCenter = () => {
    const v = view ?? { x: 0, y: 0, scale: 1 };
    return { x: (size.width / 2 - v.x) / v.scale, y: (size.height / 2 - v.y) / v.scale };
  };

  const addItem = (item: Item) => {
    leaveWalls();
    const isSet = item.kind === 'set';
    sd({ type: 'add', setItems: isSet ? [item] : [], items: isSet ? [] : [item] });
    // Adding from a category's panel stays there; in All it stays in All.
    if (mode !== 'all') setMode(modeOf(item));
    setSelected(item.id);
  };

  const place = (req: PlaceRequest, at?: Vec2) => {
    const pos = at ?? viewCenter();
    if ('library' in req && isOpening(req.library.id)) {
      // A door or window dropped on (or placed near) a wall goes into it.
      // Doors and windows only live in walls: they go into the nearest one.
      const hit = nearestWall(pos, items, Infinity);
      if (!hit) return;
      const base: Item = { id: uid(), kind: 'set', catalogId: req.library.id, pos, rotationDeg: 0, sizeCm: { ...req.library.sizeCm } };
      addItem({ ...base, ...seatOpening(base, hit, req.library.sizeCm.w) });
      return;
    }
    if ('stand' in req) {
      // A stand from the catalogue: drawn as a stand, its spread by type, named by its model.
      const spread = { 'c-stand': 70, light: 90, combo: 110, roller: 130, boom: 90 }[req.stand.type] ?? 80;
      addItem({ id: uid(), kind: 'grip', catalogId: 'generic.grip.c-stand', pos, rotationDeg: 0, sizeCm: { w: spread, d: spread }, grip: { standId: req.stand.id } });
      return;
    }
    addItem(
      'fixture' in req
        ? { id: uid(), kind: 'light', catalogId: req.fixture.id, pos, rotationDeg: 0, light: { unitId: nextUnitId(items) } }
        : {
            id: uid(),
            kind: req.library.kind,
            catalogId: req.library.id,
            pos,
            rotationDeg: 0,
            ...(req.library.kind === 'light' ? { light: { unitId: nextUnitId(items) } } : {}),
            ...(req.library.kind === 'note' ? { note: { text: req.library.shape === 'note-arrow' ? '' : req.library.shape === 'note-area' ? 'Area' : 'Note', color: NOTE_DEFAULT_COLOR } } : {}),
          },
    );
  };

  const placeActor = (actorId: string) =>
    addItem({ id: uid(), kind: 'person', catalogId: 'generic.person', actorId, pos: viewCenter(), rotationDeg: 180 });

  /** Create a new cast member and put them in the scene. */
  const newPerson = (role: CastRole) => {
    const actor = newActor(project.actors, { role });
    dispatch({ type: 'addActor', actor });
    placeActor(actor.id);
  };

  /** Ctrl+D (next to the original) or Alt + drag (`patch` = where it was dropped). */
  const duplicate = (src: Item, patch?: Partial<Item>) => {
    // Something with attachments is copied with everything attached to it.
    const group = assemblyOf(src, items);
    if (group.length > 1 && !patch) return duplicateMany(group.map((i) => i.id));
    if (src.actorId) return; // a person appears once per scene
    const copy: Item = structuredClone({
      ...src,
      id: uid(),
      locked: undefined,
      attachedTo: undefined,
      ...(patch ?? { pos: { x: src.pos.x + 50, y: src.pos.y + 50 } }),
    });
    if (copy.light) copy.light.unitId = nextUnitId(items);
    // A door or window copy goes next to the original in the same wall.
    if (!patch && copy.inWall) copy.inWall.offsetCm += (copy.sizeCm?.w ?? 90) + 20;
    // A wall copy brings its doors and windows.
    const openings = src.wall
      ? scene.setItems
          .filter((i) => i.inWall?.wallId === src.id)
          .map((i) => structuredClone({ ...i, id: uid(), inWall: { ...i.inWall!, wallId: copy.id } }))
      : [];
    const isSet = scene.setItems.some((i) => i.id === src.id);
    sd({ type: 'add', setItems: isSet ? [copy, ...openings] : [], items: isSet ? [] : [copy] });
    setSelected(copy.id);
  };

  /** Several items at once (Ctrl+D, or Alt + drag of a selection), moved by `delta`. */
  const duplicateMany = (ids: string[], delta: Vec2 = { x: 50, y: 50 }) => {
    const srcs = items.filter((i) => ids.includes(i.id) && !i.actorId);
    // New ids up front, so copies attached to each other stay attached (to the copies).
    const newIds = new Map(srcs.map((s) => [s.id, uid()]));
    const wallIds = new Map<string, string>();
    for (const s of srcs) if (s.wall) wallIds.set(s.id, newIds.get(s.id)!);
    const added: Item[] = [];
    const toSet = new Set<string>();
    const picked: string[] = [];
    const copyOf = (src: Item, id: string, inWall?: Item['inWall']): Item => {
      if (scene.setItems.some((x) => x.id === src.id)) toSet.add(id);
      const c: Item = structuredClone({ ...src, id, locked: undefined, pos: { x: src.pos.x + delta.x, y: src.pos.y + delta.y } });
      const to = src.attachedTo && newIds.get(src.attachedTo.to);
      c.attachedTo = to ? { ...src.attachedTo!, to } : undefined;
      if (inWall) c.inWall = inWall;
      if (c.light) c.light.unitId = nextUnitId([...items, ...added]);
      added.push(c);
      return c;
    };
    for (const src of srcs) {
      if (src.inWall && wallIds.has(src.inWall.wallId)) continue; // comes with its wall
      if (src.wall) {
        const id = wallIds.get(src.id)!;
        picked.push(copyOf(src, id).id);
        for (const o of scene.setItems) if (o.inWall?.wallId === src.id) copyOf(o, uid(), { ...o.inWall, wallId: id });
      } else if (src.inWall) {
        picked.push(copyOf(src, uid(), { ...src.inWall, offsetCm: src.inWall.offsetCm + (src.sizeCm?.w ?? 90) + 20 }).id);
      } else picked.push(copyOf(src, newIds.get(src.id)!).id);
    }
    sd({ type: 'add', setItems: added.filter((i) => toSet.has(i.id)), items: added.filter((i) => !toSet.has(i.id)) });
    setSelection(picked);
  };

  const duplicateScene = (id: string) => {
    const src = project.scenes.find((s) => s.id === id);
    if (!src) return;
    const ids = new Map([...src.setItems, ...src.items].map((i) => [i.id, uid()]));
    const renew = (i: Item): Item => ({
      ...i,
      id: ids.get(i.id)!,
      ...(i.inWall ? { inWall: { ...i.inWall, wallId: ids.get(i.inWall.wallId) ?? i.inWall.wallId } } : {}),
    });
    const copy: SceneDoc = structuredClone({
      ...src,
      id: uid(),
      name: `${src.name} copy`,
      setItems: src.setItems.map(renew),
      items: src.items.map(renew),
    });
    dispatch({ type: 'addScene', scene: copy, afterId: id });
    setSceneId(copy.id);
  };

  const openProject = (p: Project) => {
    dispatch({ type: 'load', project: p });
    setSceneId(p.scenes[0]!.id);
    setSelected(null);
    setView(null);
  };

  /** Turn every selected item that can turn (not locked, not following a person). */
  /** Hang `childId` on `parentId` where it is now (a light meter far from a person goes in front of their face). */
  const attach = (childId: string, parentId: string) => {
    const child = items.find((i) => i.id === childId);
    const parent = items.find((i) => i.id === parentId);
    if (!child || !parent || !canAttach(child, parent, items)) return;
    const far = Math.hypot(child.pos.x - parent.pos.x, child.pos.y - parent.pos.y) > 150;
    const attachedTo = isMeter(child) && parent.kind === 'person' && far ? { to: parent.id, offset: { x: 0, y: -35 }, rotDeg: 0 } : attachmentFor(child, parent);
    sd({ type: 'update', id: childId, patch: { attachedTo } });
  };
  const detach = (ids: string[]) => {
    const patches = items.filter((i) => ids.includes(i.id) && i.attachedTo).map((i) => ({ id: i.id, patch: { attachedTo: undefined } }));
    if (patches.length) sd({ type: 'updateMany', patches });
  };


  /** Download the project (with its gear list) as a file. */
  const saveFile = () => {
    const blob = new Blob([toProjectFile(project, gearLists)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectFileName(project);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Open a project file as a new project on this device (its gear list comes along). */
  const openFile = async (file: File) => {
    const r = parseProjectFile(await file.text(), uid());
    if (!r.ok) {
      await confirm({ title: "Couldn't open the file", message: r.error, confirm: 'OK' });
      return;
    }
    const list = r.gearList;
    if (list && !gearLists.some((l) => l.id === list.id)) setGearLists((ls) => [...ls, list]);
    openProject(r.project);
  };

  const exportPng = () => {
    leaveWalls();
    const url = exportRef.current?.();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'floor-plan'} - ${scene.name}.png`;
    a.click();
  };

  const addTemplate = (t: TemplateDefinition, values: TemplateValues) => {
    // The template replaces the scene, so it starts from the middle, with the whole cast free
    // to be placed again and lights numbered from L1.
    const r = applyTemplate(t, values, { origin: { x: 0, y: 0 } });
    const cast = castTemplateItems(r.shots.flatMap((s) => s.items), project.actors, [], kind, r.setItems);
    const numbered: Item[] = [];
    for (const i of cast.items) {
      if (i.kind === 'light' && !i.light?.unitId) i.light = { ...i.light, unitId: nextUnitId(numbered) };
      numbered.push(i);
    }
    leaveWalls();
    setSelection([]);
    for (const actor of cast.added) dispatch({ type: 'addActor', actor });
    sd({ type: 'applyTemplate', setItems: r.setItems, items: cast.items });
    setDialog(null);
    setView(null); // fit the new layout
  };

  const saveList = (list: GearList) => setGearLists((ls) => ls.map((l) => (l.id === list.id ? list : l)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || document.querySelector('.dialog') || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && k === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && k === 'd') {
        e.preventDefault();
        if (selectedItem) duplicate(selectedItem);
        else if (selection.length > 1) duplicateMany(selection);
      } else if (mod && k === 'a') {
        e.preventDefault();
        setSelection(items.filter((i) => !i.hidden && inMode(i, mode) && !prefs.layers?.[modeOf(i)]?.hidden && !prefs.layers?.[modeOf(i)]?.locked).map((i) => i.id));
      } else if (mod) {
        return;
      } else if (e.key === '?' || k === 'f1') {
        e.preventDefault();
        setDialog('help');
      } else if (k === 'w') {
        chooseTool('move');
      } else if (k === 'r') {
        chooseTool('rotate');
      } else if (k === 's') {
        setPickMode((on) => !on);
      } else if (k >= '0' && k <= '5') {
        switchMode(EDIT_MODES[Number(k)]!.id);
      } else if (k === 'escape') {
        if (drawing) setDrawing(false);
        else if (wallTool && wallDraft.length) setDraft([]);
        else if (wallTool) setWallTool(false);
        else if (pickMode) setPickMode(false);
        else setSelected(null);
      } else if (k === 'enter' && wallTool) {
        finishWalls(false);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Glide to a view (zoom buttons, fit) instead of jumping. */
  const glide = useRef(0);
  const animateView = (to: View) => {
    const from = view;
    cancelAnimationFrame(glide.current);
    if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return setView(to);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 220);
      const e = 1 - (1 - k) ** 3; // ease out
      // Scale moves in log space so zooming feels even; the point under the centre stays put.
      const scale = from.scale * (to.scale / from.scale) ** e;
      setView({ scale, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (k < 1) glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
  };
  const zoomBy = (f: number) => view && animateView(zoomAt(view, f, { x: size.width / 2, y: size.height / 2 }));
  const power = circuitLoads(items, prefs.volts, prefs.breakerA ?? defaultBreakerA(prefs.volts));
  const powerWarn = power.circuits.some((c) => c.status === 'over');
  const sheetTitle = configuring && selectedItem ? displayLabel(selectedItem, project.actors) || MODE_LABEL[mode] : MODE_LABEL[mode];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-mark" aria-hidden="true" />
          <ProjectMenu
            project={project}
            scene={scene}
            onSelectScene={(id) => {
              setSceneId(id);
              setSelected(null);
            }}
            onAddScene={() => {
              const s = { id: uid(), name: `Scene ${project.scenes.length + 1}`, setItems: [], items: [] };
              dispatch({ type: 'addScene', scene: s });
              setSceneId(s.id);
              setSelected(null);
            }}
            onRenameScene={(id, name) => dispatch({ type: 'renameScene', id, name })}
            onDuplicateScene={duplicateScene}
            onClearScene={(id) => dispatch({ type: 'scene', sceneId: id, action: { type: 'clear' } })}
            onDeleteScene={(id) => dispatch({ type: 'deleteScene', id })}
            onRename={(name) => dispatch({ type: 'setProject', patch: { name } })}
            onKind={(k) => dispatch({ type: 'setProject', patch: { kind: k } })}
            onSaveFile={saveFile}
            onOpenFile={openFile}
            onOpen={(id) => {
              const p = loadProject(id);
              if (p) openProject(p);
            }}
            onNew={() => {
              openProject(newProject(`Project ${listProjects().length + 1}`));
              setDialog('templates'); // start a new project by choosing narrative/doc and a layout
            }}
            onDelete={() => {
              deleteProject(project.id);
              const next = listProjects()[0];
              openProject((next && loadProject(next.id)) || newProject());
            }}
          />
        </div>

        <div className="modes" role="tablist" aria-label="Category">
          {EDIT_MODES.map((m, i) => (
            <button
              key={m.id}
              id={`mode-${m.id}`}
              role="tab"
              aria-selected={mode === m.id}
              style={{ '--cat': `var(--cat-${m.id})` } as CSSProperties}
              onClick={() => switchMode(m.id)}
              title={`${MODE_HINT[m.id]} (${i})`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="tool-group" role="radiogroup" aria-label="Tool">
          <button
            id="tool-move"
            role="radio"
            aria-checked={tool === 'move'}
            className={`tool-btn ${tool === 'move' ? 'on' : ''}`}
            onClick={() => chooseTool('move')}
            title="Move: drag items (W)"
          >
            <IconMove /> <span className="lbl">Move</span> <kbd>W</kbd>
          </button>
          <button
            id="tool-rotate"
            role="radio"
            aria-checked={tool === 'rotate'}
            className={`tool-btn rotate ${tool === 'rotate' ? 'on' : ''}`}
            onClick={() => chooseTool('rotate')}
            title="Rotate: drag an item to turn it (R)"
          >
            <IconRotate /> <span className="lbl">Rotate</span> <kbd>R</kbd>
          </button>
        </div>

        <div className="btn-pair">
          <button id="undo" className="icon-btn" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} aria-label="Undo" title="Undo (Ctrl+Z)">
            <IconUndo />
          </button>
          <button id="redo" className="icon-btn" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <IconRedo />
          </button>
        </div>

        <div className="topbar-right">
          <button id="open-help" className="top-action" onClick={() => setDialog('help')} title="Keyboard shortcuts and mouse controls (?)">
            <IconHelp /> <span className="lbl">Help</span>
          </button>
          <button id="open-templates" className="top-action" onClick={() => setDialog('templates')} title="Start the scene from a layout">
            <IconTemplates /> <span className="lbl">Templates</span>
          </button>
          <button
            id="reset-scene"
            className="top-action"
            disabled={items.length === 0 && !scene.baseline}
            onClick={async () => {
              const ok = await confirm({
                title: `Reset ${scene.name}?`,
                message: scene.baseline
                  ? 'The scene goes back to its template layout. Undo can bring your changes back.'
                  : 'The scene goes back to an empty plan. Undo can bring your changes back.',
                confirm: 'Reset',
              });
              if (ok) {
                leaveWalls();
                sd({ type: 'reset' });
                setSelected(null);
                if (scene.baseline) setView(null);
              }
            }}
            title={scene.baseline ? 'Back to the template layout' : 'Back to an empty plan'}
          >
            <IconReset /> <span className="lbl">Reset</span>
          </button>
          <MenuButton
            id="open-reports"
            icon={<IconSchedule />}
            label="Reports"
            title="Gear list, equipment list, lighting schedule and PNG export"
            entries={[
              { id: 'open-gear', icon: <IconGearList />, label: 'Gear list', hint: 'The gear on this job', on: !!gear.limit, onClick: () => setDialog('gear') },
              { id: 'open-equipment', icon: <IconEquipment />, label: 'Equipment', hint: 'Everything to pack, with weights', onClick: () => setDialog('equipment') },
              {
                id: 'open-schedule',
                icon: <IconSchedule />,
                label: 'Lighting schedule',
                hint: 'Plan, lights, cameras, readings and power, printable',
                onClick: () => {
                  leaveWalls();
                  setPlanImage(exportRef.current?.() ?? null);
                  setDialog('schedule');
                },
              },
              { id: 'export-png', icon: <IconExport />, label: 'Download PNG', hint: 'This scene as an image', disabled: items.length === 0, onClick: exportPng },
            ]}
          />
          <button
            id="theme-toggle"
            className="top-action icon-only"
            onClick={() => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : p.theme === 'light' ? 'auto' : 'dark' }))}
            aria-label={`Theme: ${prefs.theme ?? 'auto'}`}
            title={`Theme: ${prefs.theme === 'dark' ? 'dark' : prefs.theme === 'light' ? 'light' : 'follows the device'} (click to change)`}
          >
            {prefs.theme === 'dark' ? <IconMoon /> : prefs.theme === 'light' ? <IconSun /> : <IconAutoTheme />}
          </button>
        </div>
      </header>


      <main className="workspace">
        <div
          className={`stage tool-${wallTool ? 'walls' : tool}`}
          ref={stageBox}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            // A tile dragged from the side panel lands where it is dropped.
            const ref = e.dataTransfer.getData(DRAG_TYPE);
            if (!ref || !view) return;
            e.preventDefault();
            const box = e.currentTarget.getBoundingClientRect();
            const at = { x: (e.clientX - box.left - view.x) / view.scale, y: (e.clientY - box.top - view.y) / view.scale };
            const [kindOf, id] = ref.split(':', 2) as [string, string];
            const fixture = kindOf === 'fixture' ? fixtureById(id) : undefined;
            const library = kindOf === 'lib' ? libraryItem(id) : undefined;
            const stand = kindOf === 'stand' ? standById(id) : undefined;
            if (stand) place({ stand }, at);
            else if (fixture) place({ fixture }, at);
            else if (library) place({ library }, at);
          }}
        >
          {view && size.width > 0 && (
            <PlanCanvas
              width={size.width}
              height={size.height}
              view={view}
              onView={setView}
              scene={scene}
              savedScene={savedScene}
              actors={project.actors}
              dispatch={sd}
              selection={selection}
              onSelect={setSelected}
              onSelectMany={setSelection}
              onConfigure={configure}
              linkPreview={linkPreview}
              labelBoxesRef={labelBoxes}
              pickMode={pickMode && !wallTool}
              onDuplicateMany={duplicateMany}
              colors={colors}
              showGrid={prefs.grid}
              showShadows={prefs.shadows}
              meter={prefs.meter ? prefs.camera : null}
              layers={prefs.layers}
              showBeams={prefs.beams !== false}
              mode={mode}
              tool={tool}
              exportRef={exportRef}
              wallTool={wallTool}
              wallDraft={wallDraft}
              onWallDraft={setDraft}
              onWallFinish={finishWalls}
              onWallExit={() => setWallTool(false)}
              wallExtend={wallExtend}
              onWallInsert={insertCorner}
              wallSnap={prefs.wallSnap}
              onDuplicate={duplicate}
              drawPen={drawing ? { color: pen.color, px: PEN_WIDTHS.find((w) => w.id === pen.width)!.px } : null}
              onDrawStroke={drawStroke}
              onLive={setLive}
              scaleId={scaling && selectedItems.length === 1 && selectedItems[0]!.catalogId === 'generic.note.draw' ? selectedItems[0]!.id : null}
              onScale={(id, k) => {
                // Scale what's saved, not the live preview (which already shows the scale).
                const it = sceneItems(savedScene).find((i) => i.id === id);
                if (it && Math.abs(k - 1) > 0.01) sd({ type: 'update', id, patch: scaleDrawing(it, k) });
              }}
            />
          )}

          {drawing ? (
            <div className="canvas-topleft">
              <div className="tool-badge walls" role="status" aria-live="polite">
                Drawing · pen, finger or mouse
              </div>
              <div className="pick-bar on" role="toolbar" aria-label="Drawing">
                <button className="pick-btn done" onClick={() => setDrawing(false)}>
                  Finish drawing
                </button>
              </div>
            </div>
          ) : wallTool ? (
            <div className="tool-badge walls" role="status" aria-live="polite">
              Draw walls · {wallDraft.length ? `${wallDraft.length} corner${wallDraft.length > 1 ? 's' : ''}` : 'click to start'}
            </div>
          ) : (
            <div className="canvas-topleft">
              <div className={`tool-badge ${tool}`} role="status" aria-live="polite">
                {tool === 'move' ? <IconMove /> : <IconRotate />}
                {tool === 'move' ? 'Move' : 'Rotate'} <kbd>{tool === 'move' ? 'W' : 'R'}</kbd>
              </div>
              <div className={`pick-bar ${pickMode ? 'on' : ''}`} role="toolbar" aria-label="Select mode">
                <button
                  id="pick-toggle"
                  className="pick-toggle"
                  aria-pressed={pickMode}
                  onClick={() => setPickMode((on) => !on)}
                  title="Select mode (S): tap items to add or remove them, drag on empty space to box-select"
                >
                  <IconSelect /> {pickMode ? 'Selecting' : 'Select'} <kbd>S</kbd>
                </button>
                {pickMode && (
                  <>
                    <button className="pick-btn" onClick={() => setSelection(items.filter((i) => !i.hidden && inMode(i, mode) && !prefs.layers?.[modeOf(i)]?.hidden && !prefs.layers?.[modeOf(i)]?.locked).map((i) => i.id))}>
                      {mode === 'all' ? 'Everything' : `All ${MODE_LABEL[mode].toLowerCase()}`}
                    </button>
                    {selection.length > 0 && (
                      <button className="pick-btn" onClick={() => setSelected(null)}>
                        Clear
                      </button>
                    )}
                    <button className="pick-btn done" onClick={() => setPickMode(false)}>
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {selection.length > 0 && !wallTool && (
            // Touch screens: the keyboard and Alt/Shift shortcuts as buttons, for the selection.
            <div ref={barRef} className={`selection-bar ${barDragging ? 'dragging' : ''}`} role="toolbar" aria-label="Selection" style={selectionBarAt ?? undefined}>
              <span className="bar-grip" title="Drag to move this bar" aria-hidden="true" {...gripProps}>
                <IconGrip />
              </span>
              <span className="selection-count">{selection.length > 1 ? `${selection.length} selected` : (isMeter(selectedItems[0]) ? meterName(selectedItems[0]!, items, project.actors) : displayLabel(selectedItems[0]!, project.actors, { unit: true }) || itemName(selectedItems[0]!))}</span>
              <button id="configure" className={`btn small ${configuring ? 'on' : ''}`} onClick={() => (configuring ? setConfiguring(false) : configure())} title="Settings for the selection (or right-click it)">
                <IconSliders /> Configure
              </button>
              {/* The Move / Rotate tools, right by the selection. */}
              <span className="bar-tools" role="radiogroup" aria-label="Tool">
                <button id="bar-move" role="radio" aria-checked={tool === 'move' && !scaling} className={`icon-btn ${tool === 'move' && !scaling ? 'on' : ''}`} onClick={() => chooseTool('move')} title="Move: drag items (W)" aria-label="Move">
                  <IconMove />
                </button>
                <button id="bar-rotate" role="radio" aria-checked={tool === 'rotate' && !scaling} className={`icon-btn rotate ${tool === 'rotate' && !scaling ? 'on' : ''}`} onClick={() => chooseTool('rotate')} title="Rotate: drag an item to turn it (R)" aria-label="Rotate">
                  <IconRotate />
                </button>
                {selectedItems.length === 1 && selectedItems[0]!.catalogId === 'generic.note.draw' && (
                  <button
                    id="bar-scale"
                    role="radio"
                    aria-checked={scaling}
                    className={`icon-btn ${scaling ? 'on' : ''}`}
                    onClick={() => {
                      setTool('move');
                      setScaling((on) => !on);
                    }}
                    title="Scale: drag the corner handle to make the drawing bigger or smaller"
                    aria-label="Scale"
                  >
                    <IconScale />
                  </button>
                )}
              </span>
              <button
                className="icon-btn"
                onClick={() => (selectedItem ? duplicate(selectedItem) : duplicateMany(selection))}
                aria-label="Duplicate"
                title="Duplicate"
              >
                <IconCopy />
              </button>
              {canLink && (
                <button
                  id="link"
                  className={`btn small link-btn ${linkArmed ? 'on' : ''}`}
                  title="Drag onto something to attach to it, or tap and then tap what to attach to"
                  style={{ touchAction: 'none' }}
                  {...linkProps}
                >
                  <IconLink /> {linkArmed ? 'Tap target…' : 'Link'}
                </button>
              )}
              {selectedItems.some((i) => i.attachedTo) && (
                <button id="detach" className="btn small" onClick={() => detach(selection)} title="Take it off what it's attached to (it stays where it is)">
                  Detach
                </button>
              )}
              <button className="icon-btn danger" onClick={deleteSelected} aria-label="Delete" title="Delete">
                <IconTrash />
              </button>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Deselect" title="Deselect">
                <IconClose />
              </button>
              <span className="bar-grip" title="Drag to move this bar" aria-hidden="true" {...gripProps}>
                <IconGrip />
              </span>
            </div>
          )}

          <div className="view-controls" role="toolbar" aria-label="View">
            <button className="icon-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
              <IconMinus />
            </button>
            <button className="icon-btn" onClick={() => animateView(fitView(items, size.width, size.height))} aria-label="Fit plan" title="Fit plan to screen">
              <IconFit />
            </button>
            <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">
              <IconPlus />
            </button>
            <span className="vsep" aria-hidden="true" />
            <LayersMenu
              layers={prefs.layers ?? {}}
              beams={prefs.beams !== false}
              onLayers={(layers) => setPrefs((p) => ({ ...p, layers }))}
              onBeams={(beams) => setPrefs((p) => ({ ...p, beams }))}
            />
            <button
              id="meter-toggle"
              className={`icon-btn ${prefs.meter ? 'on' : ''}`}
              aria-pressed={prefs.meter}
              onClick={() => setPrefs((p) => ({ ...p, meter: !p.meter }))}
              aria-label={prefs.meter ? 'Hide light meter' : 'Show light meter'}
              title={prefs.meter ? 'Hide light meter readings' : 'Show readings on the light meters'}
            >
              <IconMeter />
            </button>
            <button
              id="shadow-toggle"
              className={`icon-btn ${prefs.shadows ? 'on' : ''}`}
              aria-pressed={prefs.shadows}
              onClick={() => setPrefs((p) => ({ ...p, shadows: !p.shadows }))}
              aria-label={prefs.shadows ? 'Hide shadows' : 'Show shadows'}
              title={prefs.shadows ? 'Hide shadows' : 'Show shadows'}
            >
              <IconShadow />
            </button>
            <button
              id="grid-toggle"
              className={`icon-btn ${prefs.grid ? 'on' : ''}`}
              aria-pressed={prefs.grid}
              onClick={() => setPrefs((p) => ({ ...p, grid: !p.grid }))}
              aria-label={prefs.grid ? 'Hide grid' : 'Show grid'}
              title={prefs.grid ? 'Hide grid' : 'Show grid'}
            >
              <IconGrid />
            </button>
          </div>

          {items.length === 0 && (
            <div className="empty">
              <p>{scene.name} is empty.</p>
              <button className="btn primary" onClick={() => setDialog('templates')}>
                Start from a template
              </button>
              <p className="hint-text">or add items from the {MODE_LABEL[mode].toLowerCase()} panel.</p>
            </div>
          )}
        </div>

        <aside className={`panel ${sheetOpen ? 'open' : ''}`} aria-label={`${MODE_LABEL[mode]} panel`}>
          <div className="panel-head">
            {configuring && selection.length ? (
              <button id="panel-back" className="back-btn" onClick={() => setConfiguring(false)}>
                <IconBack /> {MODE_LABEL[mode]}
              </button>
            ) : (
              <h2 className="panel-title">{MODE_LABEL[mode]}</h2>
            )}
            <button className="sheet-toggle" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
              <span className="sheet-label">{sheetTitle}</span>
              <IconChevron up={!sheetOpen} />
            </button>
          </div>
          <div className="panel-body" key={`${mode}-${configuring ? 'settings' : 'add'}`}>
            {configuring && selectedItem ? (
              <Inspector
                key={selectedItem.id}
                item={selectedItem}
                sceneItems={items}
                actors={project.actors}
                kind={kind}
                gear={gear}
                onUpdate={(patch) => sd({ type: 'update', id: selectedItem.id, patch })}
                onUpdateActor={(id, patch) => dispatch({ type: 'updateActor', id, patch })}
                onDeleteActor={(id) => dispatch({ type: 'deleteActor', id })}
                onDuplicate={() => duplicate(selectedItem)}
                onDelete={deleteSelected}
                camera={prefs.camera}
                sun={scene.sun}
              />
            ) : configuring && selection.length > 1 ? (
              <section className="section">
                <h3 className="section-title">
                  Selected <span className="count">{selection.length}</span>
                </h3>
                <ul className="row-list">
                  {selectedItems.map((i) => (
                    <li key={i.id}>
                      <button className="row" onClick={() => setSelected(i.id)}>
                        <span className="row-main">
                          <span className="row-title">{displayLabel(i, project.actors) || itemName(i)}</span>
                        </span>
                        {i.locked && <span className="row-meta muted">Locked</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="hint-text">
                  Drag any of them to move them together.
                  <span className="mouse-only"> Alt + drag copies them. Shift + click adds or removes one.</span>
                  <span className="touch-only"> Hold a finger on an item to add or remove it.</span>
                </p>
                <div className="btn-row">
                  <button
                    className="btn"
                    onClick={() => {
                      const lock = !selectedItems.every((i) => i.locked);
                      sd({ type: 'updateMany', patches: selection.map((id) => ({ id, patch: { locked: lock || undefined } })) });
                    }}
                  >
                    {selectedItems.every((i) => i.locked) ? 'Unlock all' : 'Lock all'}
                  </button>
                  <button className="btn" onClick={() => duplicateMany(selection)}>
                    Duplicate
                  </button>
                  <button className="btn danger" onClick={deleteSelected}>
                    Delete
                  </button>
                </div>
                <form
                  className="save-setup"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = setupName.trim() || `Setup ${setups.length + 1}`;
                    setSetups((ss) => [...ss, makeSetup(uid(), name, selectedItems, scene)]);
                    setSetupName('');
                  }}
                >
                  <input className="text-input" aria-label="Setup name" placeholder="Name, e.g. Soft key + rim" value={setupName} onChange={(e) => setSetupName(e.target.value)} />
                  <button className="btn" type="submit">
                    Save as a setup
                  </button>
                </form>
                <ArrangeTools items={selectedItems} scene={items} actors={project.actors} onPatches={(patches) => patches.length && sd({ type: 'updateMany', patches })} />
              </section>
            ) : (
              <CategoryPanel
                mode={mode}
                items={items}
                actors={project.actors}
                kind={kind}
                gear={gear}
                onSelect={(id) => configure(id)}
                onPlace={place}
                onPlaceActor={placeActor}
                onNewPerson={newPerson}
                wallTool={wallTool}
                wallDraftCount={wallDraft.length}
                onWallTool={setWallTool}
                onWallFinish={doneWalls}
                wallSnap={prefs.wallSnap}
                onWallSnap={(on) => setPrefs((p) => ({ ...p, wallSnap: on }))}
                hasWalls={items.some((i) => i.wall)}
                sun={scene.sun}
                onSun={(sun) => sd({ type: 'sun', sun })}
                onMode={switchMode}
                drawing={drawing}
                onDrawing={setDrawing}
                pen={pen}
                onPen={(patch) => setPen((p) => ({ ...p, ...patch }))}
                onMetersForAll={() => {
                  const added = withMeters(scene.items, uid).filter((i) => !scene.items.includes(i));
                  if (added.length) sd({ type: 'add', setItems: [], items: added });
                }}
              />
            )}
          </div>
        </aside>
      </main>

      <footer className="statusbar">
        <button
          className={`stat-btn ${powerWarn ? "warn" : ""}`}
          onClick={() => setDialog('power')}
          title="Total light power in this scene. Tap for circuits and breakers."
        >
          {power.totalWatts} W · {power.totalAmps.toFixed(1)} A @ {prefs.volts} V{powerWarn ? ' · circuit over!' : ''}
        </button>
        {gear.limit && <span className="stat accent">Gear list: {activeList?.name}</span>}
        {selection.length > 1 ? (
          <span className="stat accent">{selection.length} selected</span>
        ) : selectedItem ? (
          <span className="stat accent">
            {displayLabel(selectedItem, project.actors) || itemName(selectedItem)} · x {fmtM(selectedItem.pos.x)} · y {fmtM(selectedItem.pos.y)} · {Math.round(selectedItem.rotationDeg)}°
          </span>
        ) : (
          <span className="stat hint">
            {MODE_HINT[mode]}
            <span className="mouse-only"> · pan: middle mouse or Space + drag · W move · R rotate · drag on empty space to select · Alt + drag copy · 1–5 category</span>
            <span className="touch-only"> · two fingers to pan and zoom · tap to select</span>
          </span>
        )}
      </footer>

      {dialog === 'schedule' && (
        <Dialog
          title="Lighting schedule"
          onClose={() => setDialog(null)}
          wide
          footer={
            <button className="btn primary" onClick={() => window.print()}>
              Print / save as PDF
            </button>
          }
        >
          <SchedulePanel
            projectName={project.name}
            sceneName={scene.name}
            items={items}
            actors={project.actors}
            planImage={planImage}
            camera={prefs.camera}
            volts={prefs.volts}
            breakerA={prefs.breakerA ?? defaultBreakerA(prefs.volts)}
            sun={scene.sun}
          />
        </Dialog>
      )}
      {dialog === 'power' && (
        <Dialog title="Power & circuits" onClose={() => setDialog(null)}>
          <PowerPanel
            items={items}
            volts={prefs.volts}
            breakerA={prefs.breakerA ?? defaultBreakerA(prefs.volts)}
            onVolts={(volts) => setPrefs((p) => ({ ...p, volts, breakerA: p.breakerA ?? undefined }))}
            onBreaker={(breakerA) => setPrefs((p) => ({ ...p, breakerA }))}
            onCircuits={(patches) =>
              sd({
                type: 'updateMany',
                patches: patches.map(({ id, circuit }) => ({ id, patch: { light: { ...items.find((i) => i.id === id)?.light, circuit } } })),
              })
            }
          />
        </Dialog>
      )}
      {dialog === 'help' && (
        <Dialog title="Shortcuts" onClose={() => setDialog(null)}>
          <HelpPanel />
        </Dialog>
      )}
      {dialog === 'templates' && (
        <Dialog title="Templates" onClose={() => setDialog(null)}>
          <TemplatePanel
            kind={kind}
            onKind={(k) => dispatch({ type: 'setProject', patch: { kind: k } })}
            onAdd={addTemplate}
            sceneName={scene.name}
            replaces={items.length > 0}
            setups={setups}
            onAddSetup={(id) => {
              const s = setups.find((x) => x.id === id);
              if (!s) return;
              const placed = placeSetup(s, viewCenter(), items, project.actors, uid);
              sd({ type: 'add', ...placed });
              setDialog(null);
            }}
            onDeleteSetup={(id) => setSetups((ss) => ss.filter((s) => s.id !== id))}
          />
        </Dialog>
      )}
      {dialog === 'equipment' && (
        <Dialog title="Equipment" onClose={() => setDialog(null)} wide>
          <EquipmentPanel
            project={project}
            scene={scene}
            volts={prefs.volts}
            gearList={activeList}
            onChange={(equipment) => dispatch({ type: 'setProject', patch: { equipment } })}
          />
        </Dialog>
      )}
      {dialog === 'gear' && (
        <Dialog title="Gear list" onClose={() => setDialog(null)}>
          <GearListPanel
            lists={gearLists}
            active={activeList}
            limit={!!project.gearLimit}
            usage={usage}
            onSelect={(id) => dispatch({ type: 'setProject', patch: { gearListId: id } })}
            onLimit={(on) => dispatch({ type: 'setProject', patch: { gearLimit: on } })}
            onSave={saveList}
            onCreate={() => {
              const list: GearList = { id: uid(), name: `Gear list ${gearLists.length + 1}`, entries: [] };
              setGearLists((ls) => [...ls, list]);
              dispatch({ type: 'setProject', patch: { gearListId: list.id } });
            }}
            onDelete={(id) => {
              setGearLists((ls) => ls.filter((l) => l.id !== id));
              dispatch({ type: 'setProject', patch: { gearListId: undefined, gearLimit: false } });
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
