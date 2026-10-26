// The side panel when nothing is selected. It always matches the top category:
// what of that category is in the scene, then how to add more.
import type { Fixture, Stand } from '../catalog/schema';
import { FABRIC_KIND_LABEL, fabricById } from '../library/fabrics';
import { NOTE_COLORS, PEN_WIDTHS } from '../model/notes';
import { LIBRARY, libraryItem, type LibraryCategory, type LibraryItem } from '../library/items';
import { itemFixture, itemRigWeightKg, standCheck } from '../model/gear';
import { CATEGORIES, KIND_ROLES, modeOf, ROLE_LABEL, roleOf, type Category, type EditMode, type ProjectKind } from '../model/project';
import type { Actor, CastRole, Item } from '../model/types';
import { wallLength } from '../model/walls';
import { SUN_PRESETS, sunKelvin, type Sun } from '../model/sun';
import { FixtureSearch } from './FixtureSearch';
import { GripSearch } from './GripSearch';
import { isMeter } from '../model/attach';
import { ItemThumb } from './ItemThumb';
import { useCanvasColors } from './theme';
import { limitingList, type GearScope } from './gearScope';
import { displayLabel, itemName, meterName } from './PlanCanvas';

export type PlaceRequest = { library: LibraryItem } | { fixture: Fixture } | { stand: Stand };

/** Drag-and-drop payload type for panel tiles: "lib:<id>", "fixture:<id>" or "stand:<id>". */
export const DRAG_TYPE = 'application/x-lfpd-item';

interface Props {
  mode: EditMode;
  items: Item[];
  actors: Actor[];
  kind: ProjectKind;
  gear: GearScope;
  onSelect: (id: string) => void;
  onPlace: (req: PlaceRequest) => void;
  onPlaceActor: (id: string) => void;
  onNewPerson: (role: CastRole) => void;
  /** SCENE: Draw walls tool. */
  wallTool: boolean;
  wallDraftCount: number;
  onWallTool: (on: boolean) => void;
  onWallFinish: () => void;
  /** Doors and windows need a wall to go into. */
  hasWalls: boolean;
  /** The scene's daylight through windows. */
  sun?: Sun;
  onSun: (sun: Sun | undefined) => void;
  wallSnap: boolean;
  onWallSnap: (on: boolean) => void;
  /** ALL: switch to a category (to add its gear). */
  onMode: (m: Category) => void;
  /** CAMERA: give everyone without one a light meter in front of their face. */
  onMetersForAll: () => void;
  /** NOTES: drawing on the plan, and the pen it uses. */
  drawing: boolean;
  onDrawing: (on: boolean) => void;
  pen: { color: string; width: (typeof PEN_WIDTHS)[number]['id'] };
  onPen: (patch: Partial<{ color: string; width: (typeof PEN_WIDTHS)[number]['id'] }>) => void;
}

const kg = (v: number | null) => (v == null ? '? kg' : `${Math.round(v * 10) / 10} kg`);
const unitNo = (i: Item) => Number(/\d+/.exec(i.light?.unitId ?? '')?.[0] ?? 1e9);

/** One-line summary under an item's name in the scene list. */
function summary(item: Item, actors: Actor[], all: Item[] = []): { sub: string; warn?: string } {
  if (item.note) return { sub: item.note.text || (item.note.points || item.note.strokes ? `${(item.note.strokes ?? [0]).length} stroke${(item.note.strokes ?? [0]).length > 1 ? 's' : ''}` : '(no text)') };
  if (item.wall) {
    const n = item.wall.closed ? item.wall.points.length : item.wall.points.length - 1;
    return { sub: `${n} wall${n > 1 ? 's' : ''} · ${(wallLength(item) / 100).toFixed(1)} m${item.wall.closed ? ' · closed room' : ''}` };
  }
  if (item.kind === 'light') {
    const f = itemFixture(item);
    if (!f) return { sub: 'Stand-in · pick the real fixture' };
    const over = standCheck(item) === 'over';
    return { sub: `${f.powerW ?? '?'} W · rig ${kg(itemRigWeightKg(item))}`, warn: over ? 'Stand overloaded' : undefined };
  }
  if (item.kind === 'camera') {
    const two = item.camera?.twoShot?.map((id) => actors.find((a) => a.id === id)?.name ?? '?');
    if (two) return { sub: `Two shot: ${two.join(' & ')} · ${item.camera?.focalMm ?? 35} mm` };
    const focus = actors.find((a) => a.id === item.camera?.focusActorId);
    const thing = item.camera?.focusItemId ? all.find((i) => i.id === item.camera!.focusItemId) : undefined;
    const mm = item.camera?.focalMm ? ` · ${item.camera.focalMm} mm` : '';
    return { sub: focus ? `Focus on ${focus.name}${mm}` : thing ? `Focus on ${displayLabel(thing, actors) || itemName(thing)}${mm}` : 'No focus' };
  }
  const fabric = fabricById(item.grip?.fabric);
  if (fabric) return { sub: FABRIC_KIND_LABEL[fabric.kind] };
  const lib = libraryItem(item.catalogId);
  const size = item.sizeCm ?? (lib ? { w: lib.sizeCm.w, d: lib.sizeCm.d } : null);
  return { sub: size ? `${size.w} × ${size.d} cm` : '' };
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="section">
      <h3 className="section-title">
        {title}
        {count != null && <span className="count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function SceneList({ items, all, actors, empty, onSelect }: { items: Item[]; all: Item[]; actors: Actor[]; empty: string; onSelect: (id: string) => void }) {
  if (items.length === 0) return <p className="hint-text">{empty}</p>;
  return (
    <ul className="row-list">
      {items.map((i) => {
        const s = summary(i, actors, all);
        return (
          <li key={i.id}>
            <button className="row" onClick={() => onSelect(i.id)}>
              <span className="row-main">
                <span className="row-title">
                  {isMeter(i) ? meterName(i, all, actors) : displayLabel(i, actors) || itemName(i)}
                </span>
                <span className="row-sub">
                  {s.sub}
                  {s.warn && <span className="warn-text"> · {s.warn}</span>}
                </span>
              </span>
              {i.locked && <span className="row-meta muted">Locked</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Sun through the windows: on/off, presets, direction and height, or overcast. */
function DaylightSection({ sun, onSun, hasWindows }: { sun?: Sun; onSun: (s: Sun | undefined) => void; hasWindows: boolean }) {
  const s: Sun = sun ?? { on: false, ...SUN_PRESETS[0]!.sun };
  const set = (patch: Partial<Sun>) => onSun({ ...s, ...patch });
  return (
    <Section title="Daylight">
      <label className="field toggle">
        <span className="field-label">Sun through the windows</span>
        <input type="checkbox" aria-label="Daylight" checked={s.on} onChange={(e) => set({ on: e.target.checked })} />
      </label>
      {s.on && (
        <>
          <div className="btn-row">
            {SUN_PRESETS.map((p) => (
              <button key={p.id} className="btn" onClick={() => set({ ...p.sun, overcast: !!p.sun.overcast })}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">From {Math.round(s.azimuthDeg)}°</span>
            <input type="range" aria-label="Sun direction" min={0} max={359} value={s.azimuthDeg} onChange={(e) => set({ azimuthDeg: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="field-label">Height {Math.round(s.elevationDeg)}°</span>
            <input type="range" aria-label="Sun height" min={2} max={85} value={s.elevationDeg} onChange={(e) => set({ elevationDeg: Number(e.target.value) })} />
          </label>
          <label className="field toggle">
            <span className="field-label">Overcast</span>
            <input type="checkbox" aria-label="Overcast" checked={!!s.overcast} onChange={(e) => set({ overcast: e.target.checked })} />
          </label>
          <p className="hint-text">
            {s.overcast ? 'Overcast: windows glow softly into the room.' : `Sun about ${sunKelvin(s)} K. Low sun throws long patches and long shadows.`} Direction 0° is
            from the top of the plan.{hasWindows ? '' : ' Add windows to the walls to let it in.'}
          </p>
        </>
      )}
    </Section>
  );
}

function AddGrid({ category, onPlace, disabled }: { category: LibraryCategory; onPlace: Props['onPlace']; disabled?: boolean }) {
  const entries = LIBRARY.filter((i) => i.category === category && !i.unlisted && !i.noQuick && i.kind !== 'person');
  const colors = useCanvasColors();
  return (
    <div className="tile-grid">
      {entries.map((i) => (
        <button
          key={i.id}
          className="tile"
          disabled={disabled}
          draggable={!disabled}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, `lib:${i.id}`);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => onPlace({ library: i })}
          title="Tap to add in the middle of the view, or drag onto the plan"
        >
          <ItemThumb entry={i} colors={colors} />
          <span className="tile-text">
            <span>{i.name}</span>
            <span className="tile-sub">
              {i.sizeCm.w} × {i.sizeCm.d} cm
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function CategoryPanel(props: Props) {
  const { mode, items, actors, kind, gear, onSelect, onPlace, onPlaceActor, onNewPerson } = props;
  const mine = items.filter((i) => modeOf(i) === mode);
  const list = (empty: string, rows = mine) => <SceneList items={rows} all={items} actors={actors} empty={empty} onSelect={onSelect} />;

  switch (mode) {
    case 'all':
      return (
        <>
          <Section title="In this scene" count={items.filter((i) => !i.inWall).length}>
            {items.length === 0 && <p className="hint-text">Nothing on the plan yet. Start from a template, or pick a category below to add gear.</p>}
            {CATEGORIES.map((c) => {
              const rows = items.filter((i) => modeOf(i) === c.id && !i.inWall);
              if (!rows.length) return null;
              return (
                <div key={c.id} className="all-group">
                  <h4 className="all-group-title" style={{ '--cat': `var(--cat-${c.id})` } as React.CSSProperties}>
                    {c.label} <span className="count">{rows.length}</span>
                  </h4>
                  {list('', rows)}
                </div>
              );
            })}
          </Section>
          <Section title="Add">
            <div className="add-cats">
              {CATEGORIES.map((c, k) => (
                <button key={c.id} className="btn add-cat" style={{ '--cat': `var(--cat-${c.id})` } as React.CSSProperties} onClick={() => props.onMode(c.id)}>
                  {c.label} <kbd>{k + 1}</kbd>
                </button>
              ))}
            </div>
            <p className="hint-text">In All, anything on the plan can be picked and moved. Choosing a category opens its gear to add, and narrows picking to it, which helps once the plan gets busy.</p>
          </Section>
        </>
      );
    case 'lights':
      return (
        <>
          <Section title="In this scene" count={mine.length}>
            {list('No lights yet. Search below to add one.', [...mine].sort((a, b) => unitNo(a) - unitNo(b)))}
          </Section>
          <Section title="Add a light">
            <FixtureSearch gear={gear} onPick={(fixture) => onPlace({ fixture })} />
          </Section>
          {!limitingList(gear) && (
            <Section title="Stand-ins">
              <p className="hint-text">For when the exact fixture doesn't matter yet. You can pick the real one later.</p>
              <AddGrid category="lights" onPlace={onPlace} />
            </Section>
          )}
        </>
      );
    case 'grip':
      return (
        <>
          <Section title="In this scene" count={mine.length}>
            {list('No grip yet.')}
          </Section>
          <Section title="Add grip">
            <GripSearch onPlace={onPlace} />
          </Section>
          <Section title="Quick add">
            <AddGrid category="grip" onPlace={onPlace} />
          </Section>
        </>
      );
    case 'camera':
      return (
        <>
          <Section title="In this scene" count={mine.length}>
            {list('No cameras yet.')}
          </Section>
          <Section title="Add camera gear">
            <AddGrid category="camera" onPlace={onPlace} />
            {(() => {
              const without = items.filter((p) => p.kind === 'person' && !p.hidden && !items.some((m) => isMeter(m) && m.attachedTo?.to === p.id)).length;
              return (
                <>
                  <p className="hint-text">
                    A light meter reads the light where it stands. Link it to a person (drag Link in the bar over it onto them) and it reads the light on that person instead, wherever the meter sits; Rotate (R) swings it around them.
                  </p>
                  {without > 0 && (
                    <button id="meters-for-all" className="btn" onClick={props.onMetersForAll}>
                      Give {without === 1 ? 'the 1 person' : `all ${without} people`} without one a meter
                    </button>
                  )}
                </>
              );
            })()}
          </Section>
        </>
      );
    case 'notes':
      return (
        <>
          <Section title="Notes on this plan" count={mine.length}>
            {list('No notes yet. Add text or an arrow, or draw on the plan, to point things out.')}
          </Section>
          <Section title="Add">
            <AddGrid category="notes" onPlace={onPlace} />
          </Section>
          <Section title="Draw">
            <button id="draw-notes" className={`btn big ${props.drawing ? '' : 'primary'}`} onClick={() => props.onDrawing(!props.drawing)}>
              {props.drawing ? 'Finish drawing' : 'Draw on the plan'}
            </button>
            <div className="field">
              <span className="field-label">Colour</span>
              <div className="swatches">
                {NOTE_COLORS.map((c) => (
                  <button key={c} className={`swatch-btn ${props.pen.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Pen colour ${c}`} aria-pressed={props.pen.color === c} onClick={() => props.onPen({ color: c })} />
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">Width</span>
              <div className="segmented" role="radiogroup" aria-label="Pen width">
                {PEN_WIDTHS.map((w) => (
                  <button key={w.id} role="radio" aria-checked={props.pen.width === w.id} onClick={() => props.onPen({ width: w.id })}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint-text">Draw with a pen or finger on a tablet or phone, or a mouse or drawing tablet on a computer. Strokes that touch join into one shape until you press Finish drawing; then move it (W), turn it (R) or scale it like anything else. Two fingers still zoom and pan.</p>
          </Section>
        </>
      );
    case 'scene': {
      const placed = new Map(mine.filter((i) => i.actorId).map((i) => [i.actorId!, i.id]));
      const others = mine.filter((i) => !i.actorId);
      return (
        <>
          <Section title="Props">
            <AddGrid category="props" onPlace={onPlace} />
          </Section>
          <Section title="Set & props in this scene" count={others.length}>
            {list('Nothing yet.', others)}
          </Section>
          <Section title={kind === 'doc' ? 'People' : 'Cast'} count={actors.length}>
            <p className="hint-text">
              {kind === 'doc' ? 'Interviewees and interviewers' : 'Actors'} belong to the project and look the same in every scene.
            </p>
            {actors.length > 0 && (
              <ul className="row-list">
                {actors.map((a) => {
                  const tokenId = placed.get(a.id);
                  return (
                    <li key={a.id}>
                      <button className="row" onClick={() => (tokenId ? onSelect(tokenId) : onPlaceActor(a.id))}>
                        <span className="dot" style={{ background: a.color }} aria-hidden="true" />
                        <span className="row-main">
                          <span className="row-title">{a.name}</span>
                          <span className="row-sub">
                            {ROLE_LABEL[roleOf(a)]} · {a.gender === 'female' ? 'Female' : 'Male'}
                          </span>
                        </span>
                        <span className={`row-meta ${tokenId ? '' : 'accent'}`}>{tokenId ? 'In scene' : '+ Place'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="btn-row">
              {KIND_ROLES[kind].map((r) => (
                <button key={r} id={`new-${r}`} className="btn primary" onClick={() => onNewPerson(r)}>
                  + {ROLE_LABEL[r]}
                </button>
              ))}
              <button className="btn" onClick={() => onPlace({ library: LIBRARY.find((i) => i.id === 'generic.person.crew')! })}>
                + Crew
              </button>
            </div>
          </Section>
          <Section title="Build set">
            {props.wallTool ? (
              <>
                <button id="draw-walls" className="btn primary big" onClick={props.onWallFinish}>
                  Finish
                </button>
                <ul className="hint-list">
                  <li>Click on the plan to place corners. Click the first corner to close the room.</li>
                  <li>Click the end of an open wall to continue it.</li>
                  <li>Click on a wall to add a corner to it; click that corner to start a new wall from there.</li>
                  <li>Right-click, double-click or Enter ends open walls so you can start another. Right-click again to stop drawing. Esc cancels.</li>
                </ul>
              </>
            ) : (
              <>
                <button id="draw-walls" className="btn primary big" onClick={() => props.onWallTool(true)}>
                  Draw walls
                </button>
                <p className="hint-text">Draw a room corner by corner, or add corners to walls you drew. Select a wall afterwards to drag its corners or change its thickness.</p>
              </>
            )}
            <button
              id="wall-snap"
              className={`btn toggle-btn ${props.wallSnap ? 'on' : ''}`}
              aria-pressed={props.wallSnap}
              onClick={() => props.onWallSnap(!props.wallSnap)}
            >
              Snapping {props.wallSnap ? 'on' : 'off'}
            </button>
            <p className="hint-text">
              Snaps to corners, walls and 0/45/90°. Hold Ctrl (⌘ on Mac) to place freely; Shift for 15° steps.
            </p>
          </Section>
          <DaylightSection sun={props.sun} onSun={props.onSun} hasWindows={items.some((i) => libraryItem(i.catalogId)?.category === 'windows')} />
          <Section title="Doors">
            <p className="hint-text">
              {props.hasWalls
                ? 'They sit in the nearest wall and slide along walls when dragged. Drag the side handles to resize.'
                : 'Draw walls first: doors and windows go into walls.'}
            </p>
            <AddGrid category="doors" onPlace={onPlace} disabled={!props.hasWalls} />
          </Section>
          <Section title="Windows">
            <AddGrid category="windows" onPlace={onPlace} disabled={!props.hasWalls} />
          </Section>
        </>
      );
    }
  }
}
