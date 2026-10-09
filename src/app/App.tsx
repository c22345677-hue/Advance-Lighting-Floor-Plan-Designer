import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { nextUnitId, powerTotals } from '../model/gear';
import { gearUsage, type GearList } from '../model/gearList';
import {
  EDIT_MODES,
  KIND_ROLES,
  modeOf,
  newActor,
  newProject,
  sceneItems,
  type EditMode,
  type Project,
  type ProjectKind,
  type SceneDoc,
} from '../model/project';
import type { Actor, CastRole, Item } from '../model/types';
import { applyTemplate, getTemplate, type TemplateDefinition, type TemplateValues } from '../templates';
import { CategoryPanel, type PlaceRequest } from './CategoryPanel';
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
  IconMinus,
  IconMove,
  IconPlus,
  IconRedo,
  IconReset,
  IconRotate,
  IconGrid,
  IconTemplates,
  IconUndo,
} from './icons';
import { Inspector } from './Inspector';
import { clampScale, displayLabel, PlanCanvas, zoomAt, type ExportPng, type Tool, type View } from './PlanCanvas';
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
  return { items: out, added };
}

function sampleProject(): Project {
  const p: Project = { ...newProject('Sample interview'), kind: 'doc' };
  const t = getTemplate('interview');
  if (!t) return p;
  const r = applyTemplate(t, { interviewees: 1, interviewers: 1, cameras: 2 }, { origin: { x: 0, y: 0 } });
  const cast = castTemplateItems(r.shots.flatMap((s) => s.items), [], [], 'doc');
  p.actors = cast.added;
  p.scenes[0] = {
    ...p.scenes[0]!,
    setItems: r.setItems,
    items: cast.items,
    baseline: structuredClone({ setItems: r.setItems, items: cast.items }),
  };
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
}
const PREFS_KEY = 'lfpd.prefs.v1';
function loadPrefs(): Prefs {
  try {
    return { grid: true, volts: 230, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { grid: true, volts: 230 };
  }
}

const MODE_LABEL: Record<EditMode, string> = { lights: 'Lights', grip: 'Grip', camera: 'Camera', scene: 'Scene' };
const MODE_HINT: Record<EditMode, string> = {
  lights: 'Only lights can be picked and moved',
  grip: 'Only grip can be picked and moved',
  camera: 'Only camera gear can be picked and moved',
  scene: 'Only people, set and props can be picked and moved',
};

type DialogKind = 'templates' | 'gear' | 'equipment' | null;

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
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // phones: side panel as a bottom sheet
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [gearLists, setGearLists] = useState<GearList[]>(loadGearLists);
  const exportRef = useRef<ExportPng | null>(null);
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
  useEffect(() => {
    // Selection only lives inside the active category and scene.
    if (selected && (!selectedItem || modeOf(selectedItem) !== mode)) setSelected(null);
  }, [selected, selectedItem, mode]);

  const activeList = gearLists.find((l) => l.id === project.gearListId) ?? null;
  const usage = useMemo(() => gearUsage(items), [items]);
  const gear: GearScope = { list: activeList, limit: !!project.gearLimit && !!activeList, usage };

  const switchMode = (m: EditMode) => {
    setMode(m);
    setSelected(null);
  };

  const deleteSelected = () => {
    if (selected) sd({ type: 'delete', ids: [selected] });
    setSelected(null);
  };

  const viewCenter = () => {
    const v = view ?? { x: 0, y: 0, scale: 1 };
    return { x: (size.width / 2 - v.x) / v.scale, y: (size.height / 2 - v.y) / v.scale };
  };

  const addItem = (item: Item) => {
    const isSet = item.kind === 'set';
    sd({ type: 'add', setItems: isSet ? [item] : [], items: isSet ? [] : [item] });
    setMode(modeOf(item));
    setSelected(item.id);
  };

  const place = (req: PlaceRequest) => {
    const pos = viewCenter();
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

  const duplicate = (src: Item) => {
    if (src.actorId) return; // a person appears once per scene
    const copy: Item = structuredClone({ ...src, id: uid(), pos: { x: src.pos.x + 50, y: src.pos.y + 50 }, locked: undefined });
    if (copy.light) copy.light.unitId = nextUnitId(items);
    const isSet = scene.setItems.some((i) => i.id === src.id);
    sd({ type: 'add', setItems: isSet ? [copy] : [], items: isSet ? [] : [copy] });
    setSelected(copy.id);
  };

  const duplicateScene = (id: string) => {
    const src = project.scenes.find((s) => s.id === id);
    if (!src) return;
    const copy: SceneDoc = structuredClone({
      ...src,
      id: uid(),
      name: `${src.name} copy`,
      setItems: src.setItems.map((i) => ({ ...i, id: uid() })),
      items: src.items.map((i) => ({ ...i, id: uid() })),
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

  const exportPng = () => {
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
      } else if (mod) {
        return;
      } else if (k === 'w') {
        setTool('move');
      } else if (k === 'r') {
        setTool('rotate');
      } else if (k >= '1' && k <= '4') {
        switchMode(EDIT_MODES[Number(k) - 1]!.id);
      } else if (k === 'escape') {
        setSelected(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const zoomBy = (f: number) => view && setView(zoomAt(view, f, { x: size.width / 2, y: size.height / 2 }));
  const bar = view ? scaleBar(view.scale) : null;
  const power = powerTotals(items, prefs.volts);
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
            onClick={() => setTool('move')}
            title="Move: drag items (W)"
          >
            <IconMove /> <span className="lbl">Move</span> <kbd>W</kbd>
          </button>
          <button
            id="tool-rotate"
            role="radio"
            aria-checked={tool === 'rotate'}
            className={`tool-btn rotate ${tool === 'rotate' ? 'on' : ''}`}
            onClick={() => setTool('rotate')}
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
          <button id="export-png" className="top-action" onClick={exportPng} disabled={items.length === 0} title="Download this scene as PNG">
            <IconExport /> <span className="lbl">PNG</span>
          </button>
        </div>
      </header>


      <main className="workspace">
        <div className={`stage tool-${tool}`} ref={stageBox}>
          {view && size.width > 0 && (
            <PlanCanvas
              width={size.width}
              height={size.height}
              view={view}
              onView={setView}
              scene={scene}
              actors={project.actors}
              dispatch={sd}
              selected={selected}
              onSelect={setSelected}
              colors={colors}
              showGrid={prefs.grid}
              mode={mode}
              tool={tool}
              exportRef={exportRef}
            />
          )}

          <div className={`tool-badge ${tool}`} role="status" aria-live="polite">
            {tool === 'move' ? <IconMove /> : <IconRotate />}
            {tool === 'move' ? 'Move' : 'Rotate'} <kbd>{tool === 'move' ? 'W' : 'R'}</kbd>
          </div>

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
            {selectedItem ? (
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
              />
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
          className="stat-btn"
          onClick={() => setPrefs((p) => ({ ...p, volts: p.volts === 230 ? 120 : 230 }))}
          title="Total light power in this scene. Tap to switch 230 V / 120 V."
        >
          {power.watts} W · {power.amps.toFixed(1)} A @ {prefs.volts} V{power.unknown ? ` · ${power.unknown} unknown` : ''}
        </button>
        {gear.limit && <span className="stat accent">Gear list: {activeList?.name}</span>}
        {selectedItem ? (
          <span className="stat accent">
            {displayLabel(selectedItem, project.actors) || selectedItem.kind} · x {fmtM(selectedItem.pos.x)} · y {fmtM(selectedItem.pos.y)} · {Math.round(selectedItem.rotationDeg)}°
          </span>
        ) : (
          <span className="stat hint">
            {MODE_HINT[mode]} · pan: middle mouse or Space + drag · W move · R rotate · 1–4 category
          </span>
        )}
      </footer>

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
