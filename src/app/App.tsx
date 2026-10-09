import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { nextUnitId, powerTotals } from '../model/gear';
import { gearUsage, type GearList } from '../model/gearList';
import {
  EDIT_MODES,
  modeOf,
  newActor,
  newProject,
  sceneItems,
  type EditMode,
  type Project,
  type SceneDoc,
} from '../model/project';
import type { Actor, Item } from '../model/types';
import { applyTemplate, getTemplate, type TemplateDefinition, type TemplateValues } from '../templates';
import { ActorsPanel } from './ActorsPanel';
import { reducer, type SceneAction } from './doc';
import { GearListPanel } from './GearListPanel';
import type { GearScope } from './gearScope';
import { Inspector } from './Inspector';
import { LibraryPanel, type PlaceRequest } from './LibraryPanel';
import { clampScale, displayLabel, PlanCanvas, snap, zoomAt, type ExportPng, type Tool, type View } from './PlanCanvas';
import { ProjectMenu } from './ProjectMenu';
import { SceneBar } from './SceneBar';
import { deleteProject, listProjects, loadGearLists, loadProject, loadStartProject, saveGearLists, saveProject } from './storage';
import { TemplatePanel } from './TemplatePanel';
import { useCanvasColors } from './theme';

const uid = () => crypto.randomUUID();

/**
 * Template people become project actors: an actor with the same name is reused when they
 * aren't already in the scene, otherwise a new actor is created.
 */
function castTemplateItems(items: Item[], actors: Actor[], scene: Item[]): { items: Item[]; added: Actor[] } {
  const added: Actor[] = [];
  const taken = new Set(scene.map((i) => i.actorId).filter(Boolean));
  const out = items.map((i) => {
    if (i.kind !== 'person' || !i.label) return i;
    const roster = [...actors, ...added];
    let actor = roster.find((a) => a.name === i.label && !taken.has(a.id));
    if (!actor) {
      actor = newActor(roster, 'male', i.label);
      added.push(actor);
    }
    taken.add(actor.id);
    const { label: _label, ...rest } = i;
    return { ...rest, actorId: actor.id };
  });
  return { items: out, added };
}

function sampleProject(): Project {
  const p = newProject('Sample interview');
  const t = getTemplate('interview');
  if (!t) return p;
  const r = applyTemplate(t, { interviewees: 1, cameras: 2 }, { origin: { x: 0, y: 0 } });
  const cast = castTemplateItems(r.shots.flatMap((s) => s.items), [], []);
  p.actors = cast.added;
  p.scenes[0] = { ...p.scenes[0]!, setItems: r.setItems, items: cast.items };
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

type PanelTab = 'add' | 'actors' | 'gear' | 'templates';
const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: 'add', label: 'Add' },
  { id: 'actors', label: 'Actors' },
  { id: 'gear', label: 'Gear list' },
  { id: 'templates', label: 'Templates' },
];
const SNAP_CM = 25;

/** Small per-device settings, kept in localStorage. */
interface Prefs {
  snap: boolean;
  volts: 230 | 120;
}
const PREFS_KEY = 'lfpd.prefs.v1';
function loadPrefs(): Prefs {
  try {
    return { snap: true, volts: 230, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { snap: true, volts: 230 };
  }
}

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
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('add');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [gearLists, setGearLists] = useState<GearList[]>(loadGearLists);
  const [confirmClear, setConfirmClear] = useState(false);
  const exportRef = useRef<ExportPng | null>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const colors = useCanvasColors();

  const sd = (action: SceneAction) => dispatch({ type: 'scene', sceneId: scene.id, action });

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

  const deleteSelected = () => {
    if (selected) sd({ type: 'delete', ids: [selected] });
    setSelected(null);
  };

  const viewCenter = () => {
    const v = view ?? { x: 0, y: 0, scale: 1 };
    return { x: (size.width / 2 - v.x) / v.scale, y: (size.height / 2 - v.y) / v.scale };
  };
  const snapCm = prefs.snap ? SNAP_CM : null;

  const addItem = (item: Item) => {
    const isSet = item.kind === 'set';
    sd({ type: 'add', setItems: isSet ? [item] : [], items: isSet ? [] : [item] });
    setMode(modeOf(item));
    setSelected(item.id);
    setPanelOpen(false);
  };

  const place = (req: PlaceRequest) => {
    const pos = snap(viewCenter(), snapCm);
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

  const placeActor = (actorId: string) => {
    const existing = items.find((i) => i.actorId === actorId);
    if (existing) {
      setMode('scene');
      setSelected(existing.id);
      setPanelOpen(false);
      return;
    }
    addItem({ id: uid(), kind: 'person', catalogId: 'generic.person', actorId, pos: snap(viewCenter(), snapCm), rotationDeg: 180 });
  };

  const addActor = () => dispatch({ type: 'addActor', actor: newActor(project.actors) });

  const duplicate = (src: Item) => {
    if (src.actorId) return; // an actor appears once per scene
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
    const cast = castTemplateItems(r.shots.flatMap((s) => s.items), project.actors, items);
    for (const actor of cast.added) dispatch({ type: 'addActor', actor });
    sd({ type: 'add', setItems: r.setItems, items: cast.items });
    setPanelOpen(false);
  };

  const saveList = (list: GearList) => setGearLists((ls) => ls.map((l) => (l.id === list.id ? list : l)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
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
      } else if (k === '1' || k === '2' || k === '3') {
        setMode(EDIT_MODES[Number(k) - 1]!.id);
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
  const count = items.length;
  const power = powerTotals(items, prefs.volts);
  const placedActors = new Set(items.map((i) => i.actorId).filter((x): x is string => !!x));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <ProjectMenu
            project={project}
            onRename={(name) => dispatch({ type: 'setProject', patch: { name } })}
            onOpen={(id) => {
              const p = loadProject(id);
              if (p) openProject(p);
            }}
            onNew={() => openProject(newProject(`Project ${listProjects().length + 1}`))}
            onDelete={() => {
              deleteProject(project.id);
              const next = listProjects()[0];
              openProject((next && loadProject(next.id)) || newProject());
            }}
          />
        </div>
        <div className="modes" role="tablist" aria-label="Edit category">
          {EDIT_MODES.map((m, i) => (
            <button
              key={m.id}
              id={`mode-${m.id}`}
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              title={`${m.label}: only ${m.label.toLowerCase()} items can be moved (${i + 1})`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="tools" role="toolbar" aria-label="Edit">
          <button id="tool-move" className={tool === 'move' ? 'on' : ''} aria-pressed={tool === 'move'} onClick={() => setTool('move')} title="Select and move (W)">
            Move <kbd>W</kbd>
          </button>
          <button id="tool-rotate" className={tool === 'rotate' ? 'on' : ''} aria-pressed={tool === 'rotate'} onClick={() => setTool('rotate')} title="Select and drag to rotate (R)">
            Rotate <kbd>R</kbd>
          </button>
          <span className="sep" aria-hidden="true" />
          <button id="undo" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button id="redo" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <span className="sep" aria-hidden="true" />
          <button id="duplicate" onClick={() => selectedItem && duplicate(selectedItem)} disabled={!selectedItem || !!selectedItem.actorId} title="Duplicate (Ctrl+D)">
            Duplicate
          </button>
          <button id="delete" onClick={deleteSelected} disabled={!selected} title="Delete (Del)">
            Delete
          </button>
          <span className="sep" aria-hidden="true" />
          <button id="zoom-out" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
            −
          </button>
          <button id="fit" onClick={() => setView(fitView(items, size.width, size.height))} title="Fit plan to screen">
            Fit
          </button>
          <button id="zoom-in" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            +
          </button>
          <span className="sep" aria-hidden="true" />
          <button id="snap" aria-pressed={prefs.snap} className={prefs.snap ? 'on' : ''} onClick={() => setPrefs((p) => ({ ...p, snap: !p.snap }))} title="Snap to 25 cm">
            Snap
          </button>
          <button id="export-png" onClick={exportPng} disabled={count === 0} title="Download this scene as PNG">
            PNG
          </button>
          <span className="sep" aria-hidden="true" />
          <button
            id="clear"
            className={confirmClear ? 'danger' : ''}
            onClick={() => {
              if (confirmClear) {
                sd({ type: 'clear' });
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3000);
              }
            }}
            disabled={count === 0}
          >
            {confirmClear ? 'Tap again to clear scene' : 'Clear'}
          </button>
        </div>
        <button id="open-panel" className="primary templates-btn" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
          {selectedItem ? 'Edit' : 'Add'}
        </button>
      </header>

      <SceneBar
        scenes={project.scenes}
        activeId={scene.id}
        onSelect={(id) => {
          setSceneId(id);
          setSelected(null);
        }}
        onAdd={() => {
          const s = { id: uid(), name: `Scene ${project.scenes.length + 1}`, setItems: [], items: [] };
          dispatch({ type: 'addScene', scene: s });
          setSceneId(s.id);
        }}
        onRename={(id, name) => dispatch({ type: 'renameScene', id, name })}
        onDuplicate={duplicateScene}
        onDelete={(id) => dispatch({ type: 'deleteScene', id })}
      />

      <main className="workspace">
        <div className="stage" ref={stageBox}>
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
              snapCm={snapCm}
              mode={mode}
              tool={tool}
              exportRef={exportRef}
            />
          )}
          {count === 0 && (
            <div className="empty">
              <p>{scene.name} is empty.</p>
              <button
                className="primary"
                onClick={() => {
                  setTab('templates');
                  setPanelOpen(true);
                }}
              >
                Start from a template
              </button>
            </div>
          )}
        </div>

        <aside className={`panel ${panelOpen ? 'open' : ''}`} aria-label={selectedItem ? 'Inspector' : 'Add to plan'}>
          <div className="panel-head">
            {selectedItem ? (
              <>
                <h2>Selected</h2>
                <button className="link" onClick={() => setSelected(null)}>
                  Done
                </button>
              </>
            ) : (
              <div className="panel-tabs" role="tablist">
                {PANEL_TABS.map((t) => (
                  <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <button id="close-panel" className="close" onClick={() => setPanelOpen(false)} aria-label="Close panel">
              ×
            </button>
          </div>
          {selectedItem ? (
            <Inspector
              key={selectedItem.id}
              item={selectedItem}
              sceneItems={items}
              actors={project.actors}
              gear={gear}
              onUpdate={(patch) => sd({ type: 'update', id: selectedItem.id, patch })}
              onUpdateActor={(id, patch) => dispatch({ type: 'updateActor', id, patch })}
              onDuplicate={() => duplicate(selectedItem)}
              onDelete={deleteSelected}
            />
          ) : tab === 'add' ? (
            <LibraryPanel mode={mode} gear={gear} onPlace={place} />
          ) : tab === 'actors' ? (
            <ActorsPanel
              actors={project.actors}
              placed={placedActors}
              onAdd={addActor}
              onUpdate={(id, patch) => dispatch({ type: 'updateActor', id, patch })}
              onDelete={(id) => dispatch({ type: 'deleteActor', id })}
              onPlace={placeActor}
            />
          ) : tab === 'gear' ? (
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
          ) : (
            <TemplatePanel onAdd={addTemplate} />
          )}
        </aside>
      </main>

      <footer className="statusbar">
        {bar && (
          <div className="scalebar" aria-label={`Scale bar: ${bar.label}`}>
            <span className="scalebar-line" style={{ width: `${bar.px}px` }} />
            <span>{bar.label}</span>
          </div>
        )}
        <span className="stat">Grid 50 cm</span>
        <button
          className="stat power"
          onClick={() => setPrefs((p) => ({ ...p, volts: p.volts === 230 ? 120 : 230 }))}
          title="Total light power in this scene. Tap to switch 230 V / 120 V."
        >
          {power.watts} W | {power.amps.toFixed(2)} A @ {prefs.volts} V{power.unknown ? ` · ${power.unknown} unknown` : ''}
        </button>
        {gear.limit && <span className="stat chip">Gear list: {activeList?.name}</span>}
        {selectedItem ? (
          <span className="stat selected-info">
            {displayLabel(selectedItem, project.actors) || selectedItem.kind} · x {fmtM(selectedItem.pos.x)} · y {fmtM(selectedItem.pos.y)} ·{' '}
            {Math.round(selectedItem.rotationDeg)}°
          </span>
        ) : (
          <span className="hint">
            {tool === 'rotate' ? 'Rotate: drag an item to turn it (Shift = 45° steps)' : 'Move: drag items'} · only{' '}
            {mode} items can be picked · W move · R rotate · 1–3 category
          </span>
        )}
      </footer>
    </div>
  );
}
