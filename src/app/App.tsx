import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { nextUnitId } from '../model/gear';
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
import { parseProjectFile, projectFileName, toProjectFile } from '../model/projectFile';
import { extendWall, insertWallCorner, nearestWall, seatOpening, wallFromChain } from '../model/walls';
import { HelpPanel } from './HelpPanel';
import { isOpening, libraryItem } from '../library/items';
import { fixtureById } from '../model/gear';
import { applyTemplate, getTemplate, type TemplateDefinition, type TemplateValues } from '../templates';
import { CategoryPanel, DRAG_TYPE, type PlaceRequest } from './CategoryPanel';
import { useConfirm } from './confirm';
import { Dialog } from './Dialog';
import { EquipmentPanel } from './EquipmentPanel';
import { reducer, type SceneAction } from './doc';
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
  IconRotateLeft,
  IconCopy,
  IconTrash,
  IconClose,
  IconRotate,
  IconGrid,
  IconShadow,
  IconSchedule,
  IconMeter,
  IconTemplates,
  IconUndo,
} from './icons';
import { Inspector } from './Inspector';
import { clampScale, displayLabel, isFocusLocked, itemName, PlanCanvas, zoomAt, type ExportPng, type Tool, type View, type WallExtend } from './PlanCanvas';
import { ProjectMenu } from './ProjectMenu';
import { deleteProject, listProjects, loadGearLists, loadProject, loadStartProject, saveGearLists, saveProject } from './storage';
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
  return { items: linkInterview(out, [...actors, ...added]), added };
}

function sampleProject(): Project {
  const p: Project = { ...newProject('Sample interview'), kind: 'doc' };
  const t = getTemplate('interview');
  if (!t) return p;
  const r = applyTemplate(t, { interviewees: 1, interviewers: 1, cameras: 2 }, { origin: { x: 0, y: 0 } });
  const cast = castTemplateItems(r.shots.flatMap((s) => s.items), [], [], 'doc');
  p.actors = cast.added;
  const scene = focusScene({ ...p.scenes[0]!, setItems: r.setItems, items: cast.items });
  p.scenes[0] = { ...scene, baseline: structuredClone({ setItems: scene.setItems, items: scene.items }) };
  return p;
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
function scaleBar(scale: number): { cm: number; px: number; label: string } {
  for (const cm of [10, 25, 50, 100, 200, 500, 1000, 2000, 5000]) {
    if (cm * scale >= 40) return { cm, px: cm * scale, label: cm >= 100 ? `${cm / 100} m` : `${cm} cm` };
  }
  return { cm: 10000, px: 10000 * scale, label: '100 m' };
}

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
}
const PREFS_KEY = 'lfpd.prefs.v1';
function loadPrefs(): Prefs {
  try {
    return { grid: true, volts: 230, wallSnap: true, shadows: true, meter: true, camera: DEFAULT_CAMERA, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { grid: true, volts: 230, wallSnap: true, shadows: true, meter: true, camera: DEFAULT_CAMERA };
  }
}

const MODE_LABEL: Record<EditMode, string> = { lights: 'Lights', grip: 'Grip', camera: 'Camera', scene: 'Scene' };
const MODE_HINT: Record<EditMode, string> = {
  lights: 'Only lights can be picked and moved',
  grip: 'Only grip can be picked and moved',
  camera: 'Only camera gear can be picked and moved',
  scene: 'Only people, set and props can be picked and moved',
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
  const scene: SceneDoc = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  const items = sceneItems(scene);

  const [mode, setMode] = useState<EditMode>('lights');
  const [tool, setTool] = useState<Tool>('move');
  /** Selected items (box-select and Shift+click select several). */
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.length === 1 ? selection[0]! : null;
  const setSelected = (id: string | null) => setSelection(id ? [id] : []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // phones: side panel as a bottom sheet
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [gearLists, setGearLists] = useState<GearList[]>(loadGearLists);
  const exportRef = useRef<ExportPng | null>(null);
  const [planImage, setPlanImage] = useState<string | null>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const colors = useCanvasColors();
  const confirm = useConfirm();

  const sd = (action: SceneAction) => dispatch({ type: 'scene', sceneId: scene.id, action });
  const kind: ProjectKind = project.kind ?? 'narrative';

  useEffect(() => saveProject(project), [project]);
  useEffect(() => saveGearLists(gearLists), [gearLists]);
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
  useEffect(() => {
    // Selection only lives inside the active category and scene.
    const keep = selection.filter((id) => items.some((i) => i.id === id && modeOf(i) === mode));
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
  };
  useEffect(() => {
    if (selection.length || dialog) leaveWalls();
  }, [selection, dialog]);

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
    setMode(modeOf(item));
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
    if (src.actorId) return; // a person appears once per scene
    const copy: Item = structuredClone({
      ...src,
      id: uid(),
      locked: undefined,
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
    const wallIds = new Map<string, string>();
    for (const s of srcs) if (s.wall) wallIds.set(s.id, uid());
    const added: Item[] = [];
    const toSet = new Set<string>();
    const picked: string[] = [];
    const copyOf = (src: Item, id: string, inWall?: Item['inWall']): Item => {
      if (scene.setItems.some((x) => x.id === src.id)) toSet.add(id);
      const c: Item = structuredClone({ ...src, id, locked: undefined, pos: { x: src.pos.x + delta.x, y: src.pos.y + delta.y } });
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
      } else picked.push(copyOf(src, uid()).id);
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
  const turnSelection = (deg: number) => {
    const ids = selectedItems.filter((i) => !i.locked && !isFocusLocked(i, items)).map((i) => i.id);
    if (ids.length) sd({ type: 'rotateBy', ids, deg });
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
    const r = applyTemplate(t, values, { origin: viewCenter() });
    const cast = castTemplateItems(r.shots.flatMap((s) => s.items), project.actors, items, kind);
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
        setSelection(items.filter((i) => !i.hidden && modeOf(i) === mode).map((i) => i.id));
      } else if (mod) {
        return;
      } else if (e.key === '?' || k === 'f1') {
        e.preventDefault();
        setDialog('help');
      } else if (k === 'w') {
        chooseTool('move');
      } else if (k === 'r') {
        chooseTool('rotate');
      } else if (k >= '1' && k <= '4') {
        switchMode(EDIT_MODES[Number(k) - 1]!.id);
      } else if (k === 'escape') {
        if (wallTool && wallDraft.length) setDraft([]);
        else if (wallTool) setWallTool(false);
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

  const zoomBy = (f: number) => view && setView(zoomAt(view, f, { x: size.width / 2, y: size.height / 2 }));
  const bar = view ? scaleBar(view.scale) : null;
  const power = circuitLoads(items, prefs.volts, prefs.breakerA ?? defaultBreakerA(prefs.volts));
  const powerWarn = power.circuits.some((c) => c.status === 'over');
  const sheetTitle = selectedItem ? displayLabel(selectedItem, project.actors) || MODE_LABEL[mode] : MODE_LABEL[mode];

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
              onClick={() => switchMode(m.id)}
              title={`${MODE_HINT[m.id]} (${i + 1})`}
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
          <button id="open-gear" className={`top-action ${gear.limit ? 'on' : ''}`} onClick={() => setDialog('gear')} title="The gear on this job">
            <IconGearList /> <span className="lbl">Gear list</span>
          </button>
          <button id="open-equipment" className="top-action" onClick={() => setDialog('equipment')} title="Equipment list for the job">
            <IconEquipment /> <span className="lbl">Equipment</span>
          </button>
          <button
            id="open-schedule"
            className="top-action"
            onClick={() => {
              leaveWalls();
              setPlanImage(exportRef.current?.() ?? null);
              setDialog('schedule');
            }}
            title="Lighting schedule: plan, lights, cameras, readings and power on one printable sheet"
          >
            <IconSchedule /> <span className="lbl">Schedule</span>
          </button>
          <button id="export-png" className="top-action" onClick={exportPng} disabled={items.length === 0} title="Download this scene as PNG">
            <IconExport /> <span className="lbl">PNG</span>
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
            if (fixture) place({ fixture }, at);
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
              actors={project.actors}
              dispatch={sd}
              selection={selection}
              onSelect={setSelected}
              onSelectMany={setSelection}
              onDuplicateMany={duplicateMany}
              colors={colors}
              showGrid={prefs.grid}
              showShadows={prefs.shadows}
              meter={prefs.meter ? prefs.camera : null}
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
            />
          )}

          {wallTool ? (
            <div className="tool-badge walls" role="status" aria-live="polite">
              Draw walls · {wallDraft.length ? `${wallDraft.length} corner${wallDraft.length > 1 ? 's' : ''}` : 'click to start'}
            </div>
          ) : (
            <div className={`tool-badge ${tool}`} role="status" aria-live="polite">
              {tool === 'move' ? <IconMove /> : <IconRotate />}
              {tool === 'move' ? 'Move' : 'Rotate'} <kbd>{tool === 'move' ? 'W' : 'R'}</kbd>
            </div>
          )}

          {selection.length > 0 && !wallTool && (
            // Touch screens: the keyboard and Alt/Shift shortcuts as buttons, for the selection.
            <div className="selection-bar" role="toolbar" aria-label="Selection">
              <span className="selection-count">{selection.length > 1 ? `${selection.length} selected` : itemName(selectedItems[0]!)}</span>
              <button className="icon-btn" onClick={() => turnSelection(-15)} aria-label="Turn left 15°" title="Turn left 15°">
                <IconRotateLeft />
              </button>
              <button className="icon-btn" onClick={() => turnSelection(15)} aria-label="Turn right 15°" title="Turn right 15°">
                <IconRotate />
              </button>
              <button
                className="icon-btn"
                onClick={() => (selectedItem ? duplicate(selectedItem) : duplicateMany(selection))}
                aria-label="Duplicate"
                title="Duplicate"
              >
                <IconCopy />
              </button>
              <button className="icon-btn danger" onClick={deleteSelected} aria-label="Delete" title="Delete">
                <IconTrash />
              </button>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Deselect" title="Deselect">
                <IconClose />
              </button>
            </div>
          )}

          <div className="view-controls" role="toolbar" aria-label="View">
            <button className="icon-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
              <IconMinus />
            </button>
            <button className="icon-btn" onClick={() => setView(fitView(items, size.width, size.height))} aria-label="Fit plan" title="Fit plan to screen">
              <IconFit />
            </button>
            <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">
              <IconPlus />
            </button>
            <span className="vsep" aria-hidden="true" />
            <button
              id="meter-toggle"
              className={`icon-btn ${prefs.meter ? 'on' : ''}`}
              aria-pressed={prefs.meter}
              onClick={() => setPrefs((p) => ({ ...p, meter: !p.meter }))}
              aria-label={prefs.meter ? 'Hide light meter' : 'Show light meter'}
              title={prefs.meter ? 'Hide light meter readings' : 'Show light meter readings on people'}
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
            {selection.length ? (
              <button id="panel-back" className="back-btn" onClick={() => setSelected(null)}>
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
          <div className="panel-body">
            {selectedItem ? (
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
                onCamera={(camera) => setPrefs((p) => ({ ...p, camera }))}
              />
            ) : selection.length > 1 ? (
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
                <ArrangeTools items={selectedItems} scene={items} actors={project.actors} onPatches={(patches) => patches.length && sd({ type: 'updateMany', patches })} />
              </section>
            ) : (
              <CategoryPanel
                mode={mode}
                items={items}
                actors={project.actors}
                kind={kind}
                gear={gear}
                onSelect={setSelected}
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
              />
            )}
          </div>
        </aside>
      </main>

      <footer className="statusbar">
        {bar && (
          <div className="scalebar" aria-label={`Scale bar: ${bar.label}`}>
            <span className="scalebar-line" style={{ width: `${bar.px}px` }} />
            <span>{bar.label}</span>
          </div>
        )}
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
            <span className="mouse-only"> · pan: middle mouse or Space + drag · W move · R rotate · drag on empty space to select · Alt + drag copy · 1–4 category</span>
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
