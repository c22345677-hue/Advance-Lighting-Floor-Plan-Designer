// The side panel when nothing is selected. It always matches the top category:
// what of that category is in the scene, then how to add more.
import type { Fixture } from '../catalog/schema';
import { FABRIC_KIND_LABEL, fabricById } from '../library/fabrics';
import { LIBRARY, libraryItem, type LibraryCategory, type LibraryItem } from '../library/items';
import { itemFixture, itemRigWeightKg, standCheck } from '../model/gear';
import { KIND_ROLES, modeOf, ROLE_LABEL, roleOf, type EditMode, type ProjectKind } from '../model/project';
import type { Actor, CastRole, Item } from '../model/types';
import { wallLength } from '../model/walls';
import { FixtureSearch } from './FixtureSearch';
import { limitingList, type GearScope } from './gearScope';
import { displayLabel, itemName } from './PlanCanvas';

export type PlaceRequest = { library: LibraryItem } | { fixture: Fixture };

/** Drag-and-drop payload type for panel tiles: "lib:<id>" or "fixture:<id>". */
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
}

const kg = (v: number | null) => (v == null ? '? kg' : `${Math.round(v * 10) / 10} kg`);
const unitNo = (i: Item) => Number(/\d+/.exec(i.light?.unitId ?? '')?.[0] ?? 1e9);

/** One-line summary under an item's name in the scene list. */
function summary(item: Item, actors: Actor[]): { sub: string; warn?: string } {
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
    const focus = actors.find((a) => a.id === item.camera?.focusActorId);
    return { sub: focus ? `Focus on ${focus.name}` : 'No focus' };
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

function SceneList({ items, actors, empty, onSelect }: { items: Item[]; actors: Actor[]; empty: string; onSelect: (id: string) => void }) {
  if (items.length === 0) return <p className="hint-text">{empty}</p>;
  return (
    <ul className="row-list">
      {items.map((i) => {
        const s = summary(i, actors);
        return (
          <li key={i.id}>
            <button className="row" onClick={() => onSelect(i.id)}>
              <span className="row-main">
                <span className="row-title">
                  {displayLabel(i, actors) || itemName(i)}
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

function AddGrid({ category, onPlace }: { category: LibraryCategory; onPlace: Props['onPlace'] }) {
  const entries = LIBRARY.filter((i) => i.category === category && !i.unlisted && i.kind !== 'person');
  return (
    <div className="tile-grid">
      {entries.map((i) => (
        <button
          key={i.id}
          className="tile"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, `lib:${i.id}`);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => onPlace({ library: i })}
          title="Tap to add in the middle of the view, or drag onto the plan"
        >
          <span>{i.name}</span>
          <span className="tile-sub">
            {i.sizeCm.w} × {i.sizeCm.d} cm
          </span>
        </button>
      ))}
    </div>
  );
}

export function CategoryPanel(props: Props) {
  const { mode, items, actors, kind, gear, onSelect, onPlace, onPlaceActor, onNewPerson } = props;
  const mine = items.filter((i) => modeOf(i) === mode);
  const list = (empty: string, rows = mine) => <SceneList items={rows} actors={actors} empty={empty} onSelect={onSelect} />;

  switch (mode) {
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
          </Section>
        </>
      );
    case 'scene': {
      const placed = new Map(mine.filter((i) => i.actorId).map((i) => [i.actorId!, i.id]));
      const others = mine.filter((i) => !i.actorId);
      return (
        <>
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
                <p className="hint-text">
                  Click on the plan to place corners. Click the first corner to close the room, or double-click / Enter to stop with
                  open walls. Corners snap to other walls; lines straighten near 0/45/90° (Shift: 15° steps, Alt: free). Esc cancels.
                </p>
                <div className="btn-row">
                  <button className="btn primary" disabled={props.wallDraftCount < 2} onClick={props.onWallFinish}>
                    Finish walls
                  </button>
                  <button id="draw-walls" className="btn on" onClick={() => props.onWallTool(false)}>
                    Done drawing
                  </button>
                </div>
              </>
            ) : (
              <>
                <button id="draw-walls" className="btn primary big" onClick={() => props.onWallTool(true)}>
                  Draw walls
                </button>
                <p className="hint-text">Draw a room corner by corner. Select a wall afterwards to drag its corners or change its thickness.</p>
              </>
            )}
          </Section>
          <Section title="Doors">
            <p className="hint-text">Drag onto a wall and it snaps in. Drag the side handles to resize.</p>
            <AddGrid category="doors" onPlace={onPlace} />
          </Section>
          <Section title="Windows">
            <AddGrid category="windows" onPlace={onPlace} />
          </Section>
          <Section title="Set & props in this scene" count={others.length}>
            {list('Nothing yet.', others)}
          </Section>
          <Section title="Props">
            <AddGrid category="props" onPlace={onPlace} />
          </Section>
        </>
      );
    }
  }
}
