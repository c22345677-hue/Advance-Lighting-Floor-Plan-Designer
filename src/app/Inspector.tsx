import { useState, type ReactNode } from 'react';
import { bestBatteryOutputPct, isFullyWeatherSealed, isWeatherSealed, sizeClass } from '../catalog/classify';
import { modifiersFor } from '../catalog/modifiers';
import { MODIFIERS } from '../catalog/data';
import type { Fixture } from '../catalog/schema';
import { FABRIC_KIND_LABEL, FABRICS, takesFabric, type FabricKind } from '../library/fabrics';
import { isOpening, libraryItem } from '../library/items';
import { DEFAULT_WALL_CM, wallLength } from '../model/walls';
import { beamReach, DEFAULT_THROW_CM, lightSource } from '../model/shadows';
import { isMeter } from '../model/attach';
import { circuitName, lightWatts } from '../model/power';
import { bounceId, DAYLIGHT_ID, lightName, meterReadings, shutterSpeed, stopParts, type CameraSettings } from '../model/exposure';
import type { Sun } from '../model/sun';
import { COLOR_KIND_LABEL, colorKindOf, displayKelvin, hsToRgb, KIND_RANGE, lightColor, rgbCss, type ColorKind } from '../model/color';
import { GEL_GROUP_LABEL, gelById, GELS, type Gel, type GelGroup } from '../library/gels';
import { itemLook } from '../model/gear';
import {
  itemFixture,
  itemModifiers,
  itemRigWeightKg,
  RIGGING_PICKS,
  standById,
  standCheck,
  standsFor,
} from '../model/gear';
import { modeOf, ROLE_LABEL, roleOf, twoShotTargets, type ProjectKind } from '../model/project';
import type { Actor, Item, LightProps } from '../model/types';
import { FixtureSearch } from './FixtureSearch';
import { COMMON_LENSES_MM, COMMON_ZOOMS_MM, DEFAULT_LENS_MM, horizontalFovDeg, LENS_RANGE_MM } from '../model/lens';
import { avail, limitingList, type GearScope } from './gearScope';
import { useConfirm } from './confirm';
import { IconClose } from './icons';
import { PersonEditor } from './PersonEditor';
import { addMark, goToMark, marksOf, removeMark } from '../model/blocking';
import { CameraView } from './CameraView';
import { beamDegOf, displayLabel, itemName, meterName } from './PlanCanvas';
import { BOARD_WIDTH_CM, isResizableBoard } from '../model/scale';
import { beamRange, canSkirt, lightStyle, SKIRT_SIDES, zoomRange } from '../model/emitter';
import { ARROW_STYLES, NOTE_COLORS, NOTE_DEFAULT_COLOR, type ArrowStyle } from '../model/notes';

interface Props {
  item: Item;
  /** Everything in the scene (for camera focus targets). */
  sceneItems: Item[];
  actors: Actor[];
  kind: ProjectKind;
  gear: GearScope;
  onUpdate: (patch: Partial<Omit<Item, 'id'>>) => void;
  onUpdateActor: (id: string, patch: Partial<Omit<Actor, 'id'>>) => void;
  onDeleteActor: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Light meter camera settings (ISO, frame rate, shutter). */
  camera: CameraSettings;
  /** The scene's daylight (for the light meter). */
  sun?: Sun;
}

const kg = (v: number | null | undefined) => (v == null ? '?' : `${Math.round(v * 100) / 100} kg`);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Settings of the selected item, in the same order for every type:
 * name → what it is (fixture, fabric, focus, person) → position → actions.
 */
export function Inspector(props: Props) {
  const { item, sceneItems, actors, kind, gear, onUpdate, onUpdateActor, onDeleteActor, onDuplicate, onDelete } = props;
  const setLight = (patch: Partial<LightProps>) => onUpdate({ light: { ...item.light, ...patch } });
  const fixture = itemFixture(item);
  const lib = libraryItem(item.catalogId);
  const name = itemName(item);
  const actor = item.actorId ? actors.find((a) => a.id === item.actorId) : undefined;
  const confirm = useConfirm();
  const subtitle = actor
    ? `${ROLE_LABEL[roleOf(actor)]} · same in every scene`
    : item.kind === 'light'
      ? fixture
        ? `${fixture.brand} light`
        : 'Stand-in light'
      : item.wall
        ? 'Set'
        : (lib?.name ?? item.kind);

  return (
    <>
      <div className="insp-head">
        <h2 className="insp-title">{displayLabel(item, actors) || name}</h2>
        <p className="insp-sub">{subtitle}</p>
      </div>

      {item.kind === 'note' ? (
        <NoteSection item={item} onUpdate={onUpdate} />
      ) : actor ? (
        <Section title={ROLE_LABEL[roleOf(actor)]}>
          <PersonEditor actor={actor} kind={kind} onUpdate={(patch) => onUpdateActor(actor.id, patch)} />
        </Section>
      ) : (
        <label className="field">
          <span className="field-label">Name on plan</span>
          <input
            className="text-input"
            value={item.label ?? ''}
            placeholder={name}
            onChange={(e) => onUpdate({ label: e.target.value || undefined })}
          />
        </label>
      )}

      {item.kind === 'person' && (
        <Section title="In this scene">
          <FollowPerson
            label="Looking at"
            hint="They turn to face this person, and keep facing them when either of them moves."
            value={item.lookAtActorId}
            sceneItems={sceneItems}
            actors={actors}
            exclude={item.actorId}
            onChange={(lookAtActorId) => onUpdate({ lookAtActorId })}
          />
        </Section>
      )}

      {item.kind === 'person' && <BlockingSection item={item} onUpdate={onUpdate} />}

      {isMeter(item) && <MeterSection item={item} sceneItems={sceneItems} actors={actors} camera={props.camera} sun={props.sun} onUpdate={onUpdate} />}

      {item.kind === 'light' && (
        <LightSection item={item} gear={gear} sceneItems={sceneItems} actors={actors} setLight={setLight} onUpdate={onUpdate} />
      )}
      {item.wall && (
        <Section title={item.wall.closed ? 'Room' : 'Walls'}>
          <p className="hint-text">
            {(wallLength(item) / 100).toFixed(2)} m of wall. Drag the round corner handles on the plan to reshape it.
          </p>
          <label className="field">
            <span className="field-label">Thickness</span>
            <span className="input-unit">
              <input
                className="text-input num"
                type="number"
                min={5}
                max={60}
                value={item.wall.thicknessCm ?? DEFAULT_WALL_CM}
                onChange={(e) =>
                  onUpdate({ wall: { ...item.wall!, thicknessCm: Math.min(60, Math.max(5, Math.round(Number(e.target.value) || DEFAULT_WALL_CM))) } })
                }
              />
              <span className="unit">cm</span>
            </span>
          </label>
          {item.wall.points.length > 2 && (
            <label className="field toggle">
              <span className="field-label">Closed room</span>
              <input type="checkbox" checked={item.wall.closed} onChange={(e) => onUpdate({ wall: { ...item.wall!, closed: e.target.checked } })} />
            </label>
          )}
        </Section>
      )}
      {isOpening(item.catalogId) && (
        <Section title="Size">
          <label className="field">
            <span className="field-label">Width</span>
            <span className="input-unit">
              <input
                className="text-input num"
                type="number"
                min={30}
                max={1000}
                value={Math.round(itemLook(item).w)}
                onChange={(e) =>
                  onUpdate({ sizeCm: { w: Math.min(1000, Math.max(30, Math.round(Number(e.target.value) || 30))), d: itemLook(item).d } })
                }
              />
              <span className="unit">cm</span>
            </span>
          </label>
          <button className="btn" onClick={() => onUpdate({ rotationDeg: (item.rotationDeg + 180) % 360, ...(item.inWall ? { inWall: { ...item.inWall, flip: !item.inWall.flip } } : {}) })}>
            Flip side
          </button>
          <p className="hint-text">Drag it onto a wall to snap in. On the plan, drag the side handles to resize.</p>
        </Section>
      )}
      {isResizableBoard(item) && (
        <Section title="Size">
          <label className="field">
            <span className="field-label">Width</span>
            <span className="spot-flood">
              <span className="spot-end">{BOARD_WIDTH_CM[0]}</span>
              <input
                type="range"
                aria-label="Board width"
                min={BOARD_WIDTH_CM[0]}
                max={BOARD_WIDTH_CM[1]}
                step={1}
                value={Math.round(itemLook(item).w)}
                onChange={(e) => onUpdate({ sizeCm: { w: Number(e.target.value), d: itemLook(item).d } })}
              />
              <span className="spot-end">{BOARD_WIDTH_CM[1]}</span>
              <span className="num spot-deg">{Math.round(itemLook(item).w)} cm</span>
            </span>
          </label>
          <div className="btn-row">
            {[
              ['2×2', 61],
              ['4×4', 122],
              ['4×8', 244],
            ].map(([label, cm]) => (
              <button key={label} className="btn small" onClick={() => onUpdate({ sizeCm: { w: cm as number, d: itemLook(item).d } })}>
                {label}
              </button>
            ))}
          </div>
          <p className="hint-text">Or pick it and drag the corner handle with Scale in the selection bar.</p>
        </Section>
      )}
      {takesFabric(item.catalogId) && (
        <Section title="Fabric">
          <select
            value={item.grip?.fabric ?? ''}
            onChange={(e) => onUpdate({ grip: { ...item.grip, fabric: e.target.value || undefined } })}
            aria-label="Fabric"
          >
            <option value="">Empty frame</option>
            {(Object.keys(FABRIC_KIND_LABEL) as FabricKind[]).map((k) => (
              <optgroup key={k} label={FABRIC_KIND_LABEL[k]}>
                {FABRICS.filter((f) => f.kind === k).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="hint-text">Black shows black, diffusion see-through grey, bounce white, chroma screens green or blue.</p>
          <FrameDiffusion item={item} sceneItems={sceneItems} />
        </Section>
      )}
      {item.kind === 'camera' && <CameraSection item={item} sceneItems={sceneItems} actors={actors} onUpdate={onUpdate} />}
      <AttachSection item={item} sceneItems={sceneItems} actors={actors} onUpdate={onUpdate} />

      <div className="insp-actions">
        <button className={`btn ${item.locked ? 'on' : ''}`} aria-pressed={!!item.locked} onClick={() => onUpdate({ locked: !item.locked || undefined })}>
          {item.locked ? 'Unlock' : 'Lock'}
        </button>
        {actor ? (
          <>
            <button className="btn" onClick={onDelete}>
              Remove from scene
            </button>
            <button
              className="btn danger"
              onClick={async () =>
                (await confirm({
                  title: `Remove ${actor.name}?`,
                  message: 'They are taken out of every scene in this project.',
                  confirm: 'Remove from project',
                  danger: true,
                })) && onDeleteActor(actor.id)
              }
            >
              Remove from project
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onDuplicate}>
              Duplicate
            </button>
            <button className="btn danger" onClick={onDelete}>
              Delete
            </button>
          </>
        )}
      </div>
    </>
  );
}

function LensSection({ item, sceneItems, onUpdate }: Pick<Props, 'item' | 'sceneItems' | 'onUpdate'>) {
  const mm = item.camera?.focalMm ?? DEFAULT_LENS_MM;
  const zoom = item.camera?.zoom;
  const [customPick, setCustom] = useState(false);
  // A length that isn't in the menu (typed, or left by a zoom) shows the custom controls.
  const custom = customPick || !COMMON_LENSES_MM.includes(mm);
  // A two shot sets a zoom lens's focal length itself.
  const auto = !!zoom && !!twoShotTargets(item, sceneItems);
  const range = zoom ? { min: zoom.minMm, max: zoom.maxMm } : LENS_RANGE_MM;
  const setCam = (patch: Partial<NonNullable<Item['camera']>>) => onUpdate({ camera: { ...item.camera, ...patch } });
  const setMm = (v: number) => setCam({ focalMm: Math.min(range.max, Math.max(range.min, Math.round(v))) });
  const zoomKey = zoom ? `${zoom.minMm}-${zoom.maxMm}` : '';
  const isCommonZoom = COMMON_ZOOMS_MM.some((z) => `${z.minMm}-${z.maxMm}` === zoomKey);
  const setZoom = (z: { minMm: number; maxMm: number }) => {
    const minMm = Math.max(LENS_RANGE_MM.min, Math.min(z.minMm, z.maxMm));
    const maxMm = Math.min(LENS_RANGE_MM.max, Math.max(z.minMm, z.maxMm));
    setCam({ zoom: { minMm, maxMm }, focalMm: Math.min(maxMm, Math.max(minMm, mm)) });
  };
  const slider = (
    <div className="lens-custom">
      <input type="range" aria-label="Focal length slider" min={range.min} max={range.max} value={mm} disabled={auto} onChange={(e) => setMm(Number(e.target.value))} />
      <span className="input-unit">
        <input
          className="text-input num"
          type="number"
          aria-label="Focal length in mm"
          min={range.min}
          max={range.max}
          value={mm}
          disabled={auto}
          onChange={(e) => e.target.value !== '' && setMm(Number(e.target.value))}
        />
        <span className="unit">mm</span>
      </span>
    </div>
  );
  return (
    <Section title="Lens">
      <div className="field">
        <span className="field-label">Type</span>
        <div className="segmented" role="radiogroup" aria-label="Lens type">
          <button role="radio" aria-checked={!zoom} onClick={() => setCam({ zoom: undefined })}>
            Prime
          </button>
          <button role="radio" aria-checked={!!zoom} onClick={() => !zoom && setZoom({ minMm: 24, maxMm: 70 })}>
            Zoom
          </button>
        </div>
      </div>
      {zoom ? (
        <>
          <label className="field">
            <span className="field-label">Range</span>
            <select
              aria-label="Zoom range"
              value={isCommonZoom ? zoomKey : 'custom'}
              onChange={(e) => {
                const z = COMMON_ZOOMS_MM.find((x) => `${x.minMm}-${x.maxMm}` === e.target.value);
                if (z) setZoom(z);
              }}
            >
              {COMMON_ZOOMS_MM.map((z) => (
                <option key={`${z.minMm}-${z.maxMm}`} value={`${z.minMm}-${z.maxMm}`}>
                  {z.minMm}–{z.maxMm} mm
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {!isCommonZoom && (
            <div className="field">
              <span className="field-label">From – to</span>
              <span className="input-unit">
                <input className="text-input num" type="number" aria-label="Zoom wide end" value={zoom.minMm} onChange={(e) => setZoom({ ...zoom, minMm: Number(e.target.value) || 1 })} />
                <span className="unit">–</span>
                <input className="text-input num" type="number" aria-label="Zoom long end" value={zoom.maxMm} onChange={(e) => setZoom({ ...zoom, maxMm: Number(e.target.value) || 1 })} />
                <span className="unit">mm</span>
              </span>
            </div>
          )}
          {slider}
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Focal length</span>
            <select
              aria-label="Lens"
              value={custom ? 'custom' : String(mm)}
              onChange={(e) => {
                if (e.target.value === 'custom') setCustom(true);
                else {
                  setCustom(false);
                  setMm(Number(e.target.value));
                }
              }}
            >
              {COMMON_LENSES_MM.map((l) => (
                <option key={l} value={l}>
                  {l} mm
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {custom && slider}
        </>
      )}
      <p className="hint-text">
        {auto ? `${mm} mm, set by the two shot. ` : ''}
        {Math.round(horizontalFovDeg(mm))}° horizontal angle of view on a Super 35 sensor. The cone on the plan follows the lens.
      </p>
    </Section>
  );
}

/** "Follow a person": a camera's focus or a light's aim. Turns the item to face them as either moves. */
function FollowPerson({
  label,
  hint,
  value,
  sceneItems,
  actors,
  onChange,
  exclude,
}: {
  label: string;
  hint: string;
  value: string | undefined;
  sceneItems: Item[];
  actors: Actor[];
  onChange: (actorId: string | undefined) => void;
  /** Left out of the list (a person can't look at themselves). */
  exclude?: string;
}) {
  const inScene = actors.filter((a) => a.id !== exclude && sceneItems.some((i) => i.actorId === a.id));
  return (
    <>
      <label className="field toggle">
        <span className="field-label">{label}</span>
        <input type="checkbox" checked={!!value} disabled={inScene.length === 0 && !value} onChange={(e) => onChange(e.target.checked ? inScene[0]?.id : undefined)} />
      </label>
      {inScene.length === 0 && !value && (
        <p className="hint-text">{exclude ? 'Place someone else in this scene to use this.' : 'Place a person in this scene to use this.'}</p>
      )}
      {value && (
        <>
          <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
            {inScene.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {!inScene.some((a) => a.id === value) && <option value={value}>(not in this scene)</option>}
          </select>
          <p className="hint-text">{hint}</p>
        </>
      )}
    </>
  );
}

/** What a light can point at: people, props and set pieces (not cameras, grip or other lights). */
function PointAt({ item, sceneItems, actors, setLight }: { item: Item; sceneItems: Item[]; actors: Actor[]; setLight: (p: Partial<LightProps>) => void }) {
  const targets = sceneItems
    .filter((i) => i.id !== item.id && !i.hidden && !i.wall && !i.inWall && (i.kind === 'person' || i.kind === 'prop' || i.kind === 'set') && !isMeter(i) && modeOf(i) !== 'camera')
    .map((i) => ({ value: i.actorId ? `actor:${i.actorId}` : `item:${i.id}`, label: displayLabel(i, actors) || itemName(i), person: i.kind === 'person' }));
  const value = item.light?.aimActorId ? `actor:${item.light.aimActorId}` : item.light?.aimItemId ? `item:${item.light.aimItemId}` : '';
  const set = (v: string) =>
    setLight(v.startsWith('actor:') ? { aimActorId: v.slice(6), aimItemId: undefined } : v.startsWith('item:') ? { aimItemId: v.slice(5), aimActorId: undefined } : { aimActorId: undefined, aimItemId: undefined });
  return (
    <>
      <label className="field">
        <span className="field-label">Point at</span>
        <select aria-label="Point at" value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Nothing (turn it by hand)</option>
          {targets.some((t) => t.person) && (
            <optgroup label="People">
              {targets.filter((t) => t.person).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          )}
          {targets.some((t) => !t.person) && (
            <optgroup label="Props and set">
              {targets.filter((t) => !t.person).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          )}
          {value && !targets.some((t) => t.value === value) && <option value={value}>(not in this scene)</option>}
        </select>
      </label>
      <p className="hint-text">The light keeps facing what it points at, whenever either moves.</p>
    </>
  );
}

type Framing = 'none' | 'one' | 'two' | 'object';

function CameraSection({ item, sceneItems, actors, onUpdate }: Pick<Props, 'item' | 'sceneItems' | 'actors' | 'onUpdate'>) {
  const cam = item.camera;
  const inScene = actors.filter((a) => sceneItems.some((i) => i.actorId === a.id));
  const framing: Framing = cam?.twoShot ? 'two' : cam?.focusActorId ? 'one' : cam?.focusItemId ? 'object' : 'none';
  // Things a camera can hold on besides people: props and set pieces.
  const objects = sceneItems.filter((i) => !i.hidden && !i.wall && !i.inWall && (i.kind === 'prop' || i.kind === 'set') && modeOf(i) !== 'camera');
  const setCam = (patch: Partial<NonNullable<Item['camera']>>) => onUpdate({ camera: { ...cam, ...patch } });
  const choose = (f: Framing) => {
    if (f === 'none') setCam({ focusActorId: undefined, twoShot: undefined, focusItemId: undefined });
    if (f === 'one') setCam({ twoShot: undefined, focusItemId: undefined, focusActorId: cam?.focusActorId ?? inScene[0]?.id });
    if (f === 'two' && inScene.length >= 2) setCam({ focusActorId: undefined, focusItemId: undefined, twoShot: [inScene[0]!.id, inScene[1]!.id] });
    if (f === 'object' && objects.length) setCam({ focusActorId: undefined, twoShot: undefined, focusItemId: cam?.focusItemId ?? objects[0]!.id });
  };
  const who = (value: string | undefined, onChange: (id: string) => void, label: string, exclude?: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {inScene
        .filter((a) => a.id !== exclude)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      {value && !inScene.some((a) => a.id === value) && <option value={value}>(not in this scene)</option>}
    </select>
  );
  return (
    <>
      <Section title="View">
        <CameraView cam={item} items={sceneItems} actors={actors} />
      </Section>
      <LensSection item={item} sceneItems={sceneItems} onUpdate={onUpdate} />
      <Section title="Framing">
        <div className="segmented" role="radiogroup" aria-label="Framing">
          <button role="radio" aria-checked={framing === 'none'} onClick={() => choose('none')}>
            Free
          </button>
          <button role="radio" aria-checked={framing === 'one'} disabled={!inScene.length && framing !== 'one'} onClick={() => choose('one')}>
            One person
          </button>
          <button role="radio" aria-checked={framing === 'two'} disabled={inScene.length < 2 && framing !== 'two'} onClick={() => choose('two')}>
            Two shot
          </button>
          <button role="radio" aria-checked={framing === 'object'} disabled={!objects.length && framing !== 'object'} onClick={() => choose('object')}>
            Object
          </button>
        </div>
        {framing === 'object' && (
          <>
            <select aria-label="Camera focus on object" value={cam?.focusItemId} onChange={(e) => setCam({ focusItemId: e.target.value })}>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {displayLabel(o, actors) || itemName(o)}
                </option>
              ))}
              {cam?.focusItemId && !objects.some((o) => o.id === cam.focusItemId) && <option value={cam.focusItemId}>(not in this scene)</option>}
            </select>
            <p className="hint-text">The camera keeps facing it (a product, a prop) whenever either moves.</p>
          </>
        )}
        {framing === 'one' && (
          <>
            {who(cam?.focusActorId, (focusActorId) => setCam({ focusActorId }), 'Camera focus on')}
            <p className="hint-text">The camera turns to face this person whenever either of them moves.</p>
          </>
        )}
        {framing === 'two' && cam?.twoShot && (
          <>
            {who(cam.twoShot[0], (id) => setCam({ twoShot: [id, cam.twoShot![1]] }), 'First person', cam.twoShot[1])}
            {who(cam.twoShot[1], (id) => setCam({ twoShot: [cam.twoShot![0], id] }), 'Second person', cam.twoShot[0])}
            <p className="hint-text">
              {cam.zoom
                ? 'Aims between them and zooms to fit both. If the widest end of the zoom still can\'t fit them, the camera moves back.'
                : 'Aims between them. With a prime lens the camera moves back when they don\'t both fit.'}
            </p>
          </>
        )}
        {inScene.length < 2 && framing === 'none' && <p className="hint-text">Place two people in this scene for a two shot.</p>}
      </Section>
    </>
  );
}

function LightSection({
  item,
  gear,
  sceneItems,
  actors,
  setLight,
  onUpdate,
}: {
  item: Item;
  gear: GearScope;
  sceneItems: Item[];
  actors: Actor[];
  setLight: (p: Partial<LightProps>) => void;
  onUpdate: Props['onUpdate'];
}) {
  const fixture = itemFixture(item);
  /** Lights that focus: flood and spot angles. Others: how narrow or wide the beam can be set. */
  const zoom = zoomRange(item);
  const range = beamRange(item);
  const [picking, setPicking] = useState(!fixture);
  const pick = (f: Fixture) => {
    // A new fixture keeps only the modifiers that still fit it.
    const fits = new Set(modifiersFor(f, MODIFIERS).map((m) => m.id));
    onUpdate({
      catalogId: f.id,
      light: { ...item.light, modifierIds: (item.light?.modifierIds ?? []).filter((id) => fits.has(id)) },
    });
    setPicking(false);
  };

  return (
    <>
      <Section title="Fixture">
        {fixture && !picking ? (
          <>
            <FixtureCard f={fixture} />
            <button className="btn" onClick={() => setPicking(true)}>
              Change fixture
            </button>
          </>
        ) : (
          <>
            <p className="hint-text">Pick the real light to get its power, weight and the modifiers that fit it.</p>
            <FixtureSearch onPick={pick} gear={gear} keepId={fixture?.id} />
            {fixture && (
              <button className="btn" onClick={() => setPicking(false)}>
                Cancel
              </button>
            )}
          </>
        )}
      </Section>

      {fixture && <ModifierSection item={item} fixture={fixture} gear={gear} setLight={setLight} />}
      {fixture && <StandSection item={item} gear={gear} setLight={setLight} />}

      <Section title="Aim">
        <PointAt item={item} sceneItems={sceneItems} actors={actors} setLight={setLight} />
      </Section>

      <ColorSection item={item} setLight={setLight} />

      {canSkirt(item) && (
        <Section title="Skirt">
          <SkirtControl down={item.light?.skirt} onChange={(skirt) => setLight({ skirt })} />
          <p className="hint-text">
            Each quarter of the skirt lowers on its own. Where it's down the light only reaches the floor straight below; all four down
            gives a pool of light under the {lightStyle(item) === 'balloon' ? 'balloon' : 'lantern'}.
          </p>
        </Section>
      )}

      <Section title="Beam">
        {zoom ? (
          <label className="field">
            <span className="field-label">Flood – spot</span>
            <span className="spot-flood">
              <span className="spot-end">{zoom[0]}°</span>
              <input
                type="range"
                aria-label="Flood to spot"
                min={0}
                max={100}
                step={1}
                value={item.light?.spotPct ?? (item.light?.beamDeg ? Math.round(((zoom[0] - beamDegOf(item)) / (zoom[0] - zoom[1])) * 100) : 0)}
                onChange={(e) => setLight({ spotPct: Number(e.target.value), beamDeg: undefined })}
              />
              <span className="spot-end">{zoom[1]}°</span>
              <span className="num spot-deg">{Math.round(beamDegOf(item))}°</span>
            </span>
          </label>
        ) : range ? (
          <label className="field">
            <span className="field-label">Beam angle</span>
            <span className="spot-flood">
              <span className="spot-end">{range[0]}°</span>
              <input
                type="range"
                aria-label="Beam angle"
                min={range[0]}
                max={range[1]}
                step={1}
                value={Math.round(Math.min(range[1], Math.max(range[0], beamDegOf(item))))}
                onChange={(e) => setLight({ beamDeg: Number(e.target.value) })}
              />
              <span className="spot-end">{range[1]}°</span>
              <span className="num spot-deg">{Math.round(beamDegOf(item))}°</span>
            </span>
          </label>
        ) : (
          <p className="hint-text">Lights all round (360°).</p>
        )}
        <label className="field">
          <span className="field-label">Throw</span>
          <span className="input-unit">
          <input
            className="text-input num"
            type="number"
            min={50}
            step={50}
            value={item.light?.throwCm ?? DEFAULT_THROW_CM}
            onChange={(e) => setLight({ throwCm: Math.max(50, Number(e.target.value) || 50) })}
          />
          <span className="unit">cm</span>
          </span>
        </label>
        {beamReach(item, sceneItems) > (item.light?.throwCm ?? DEFAULT_THROW_CM) && (
          <p className="hint-text">Drawn to {Math.round(beamReach(item, sceneItems) / 10) * 10} cm so it reaches 15% past the nearest person in the beam.</p>
        )}
      </Section>

      <ShadowSection item={item} sceneItems={sceneItems} setLight={setLight} />

      <Section title="Power">
        <label className="field">
          <span className="field-label">Circuit</span>
          <select aria-label="Circuit" value={item.light?.circuit ?? ''} onChange={(e) => setLight({ circuit: e.target.value || undefined })}>
            <option value="">No circuit</option>
            {(() => {
              const names = [...new Set(sceneItems.map((i) => i.light?.circuit).filter((c): c is string => !!c))].sort();
              const next = circuitName(names.length);
              return [...names.map((n) => <option key={n} value={n}>Circuit {n}</option>), <option key="new" value={next}>New: circuit {next}</option>];
            })()}
          </select>
        </label>
        <p className="hint-text">
          {lightWatts(item).w} W{lightWatts(item).estimated ? ' (typical for this kind of light)' : ''}. Tap the power total at the bottom for every circuit's load.
        </p>
      </Section>
    </>
  );
}

/** Colour: what the light can do, what it's set to, and gels. */
function ColorSection({ item, setLight }: { item: Item; setLight: (p: Partial<LightProps>) => void }) {
  const l = item.light ?? {};
  const { kind, guessed } = colorKindOf(item);
  const range = KIND_RANGE[kind];
  const out = lightColor(item);
  const hsi = kind === 'rgb' && l.colorMode === 'hsi';
  const cct = Math.min(range.max, Math.max(range.min, l.cct ?? (kind === 'tungsten' ? 3200 : 5600)));
  const gels = (l.gels ?? []).map((id) => gelById(id)).filter((g): g is Gel => !!g);
  const setCct = (v: number) => setLight({ cct: Math.round(Math.min(range.max, Math.max(range.min, v)) / 50) * 50 });
  return (
    <Section title="Colour">
      <div className="color-out">
        <span className="swatch big" style={{ background: rgbCss(out.rgb) }} aria-hidden="true" />
        <span>
          <strong>{out.label}</strong>
          <span className="muted"> · the beam on the plan shows this colour</span>
        </span>
      </div>
      <label className="field">
        <span className="field-label">Type</span>
        <select
          aria-label="Colour type"
          value={l.colorKind ?? ''}
          onChange={(e) => setLight({ colorKind: (e.target.value || undefined) as LightProps['colorKind'] })}
        >
          <option value="">{`${COLOR_KIND_LABEL[guessed ? kind : colorKindOf({ ...item, light: { ...l, colorKind: undefined } }).kind]} · auto`}</option>
          {(Object.keys(COLOR_KIND_LABEL) as ColorKind[]).map((k) => (
            <option key={k} value={k}>
              {COLOR_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {kind === 'rgb' && (
        <div className="segmented" role="radiogroup" aria-label="Colour mode">
          <button role="radio" aria-checked={!hsi} onClick={() => setLight({ colorMode: 'cct' })}>
            Colour temp
          </button>
          <button role="radio" aria-checked={hsi} onClick={() => setLight({ colorMode: 'hsi' })}>
            HSI
          </button>
        </div>
      )}
      {(kind === 'bicolor' || (kind === 'rgb' && !hsi)) && (
        <div className="lens-custom">
          <input
            type="range"
            className="cct-slider"
            aria-label="Colour temperature slider"
            min={range.min}
            max={range.max}
            step={50}
            value={cct}
            style={{ ['--cct-from' as string]: rgbCss(displayKelvin(range.min)), ['--cct-to' as string]: rgbCss(displayKelvin(range.max)) }}
            onChange={(e) => setCct(Number(e.target.value))}
          />
          <span className="input-unit">
            <input className="text-input num" type="number" aria-label="Colour temperature" min={range.min} max={range.max} step={50} value={cct} onChange={(e) => e.target.value !== '' && setCct(Number(e.target.value))} />
            <span className="unit">K</span>
          </span>
        </div>
      )}
      {hsi && (
        <div className="hsi">
          <ColorWheel hue={l.hue ?? 0} sat={l.sat ?? 100} onChange={(hue, sat) => setLight({ hue, sat })} />
          <div className="hsi-sliders">
            <label className="field-label">
              Hue {Math.round(l.hue ?? 0)}°
              <input type="range" className="hue-slider" aria-label="Hue" min={0} max={359} value={l.hue ?? 0} onChange={(e) => setLight({ hue: Number(e.target.value) })} />
            </label>
            <label className="field-label">
              Saturation {Math.round(l.sat ?? 100)}%
              <input type="range" aria-label="Saturation" min={0} max={100} value={l.sat ?? 100} onChange={(e) => setLight({ sat: Number(e.target.value) })} />
            </label>
            <label className="field-label">
              Intensity {l.intensityPct ?? 100}%
              <input type="range" aria-label="Intensity" min={0} max={100} value={l.intensityPct ?? 100} onChange={(e) => setLight({ intensityPct: Number(e.target.value) })} />
            </label>
          </div>
        </div>
      )}
      {kind !== 'rgb' && kind !== 'bicolor' && <p className="hint-text">Fixed colour. Add a gel to change it.</p>}

      <span className="field-label">Gels</span>
      {gels.length > 0 && (
        <ul className="row-list">
          {gels.map((g, k) => (
            <li key={`${g.id}-${k}`} className="row static">
              <span className="swatch" style={{ background: g.color }} aria-hidden="true" />
              <span className="row-main">
                <span className="row-title">{g.name}</span>
                <span className="row-sub">
                  Rosco {g.number}
                  {g.mired ? ` · ${g.mired > 0 ? '+' : ''}${g.mired} mired` : ''}
                </span>
              </span>
              <button className="icon-btn" aria-label={`Remove ${g.name}`} onClick={() => setLight({ gels: (l.gels ?? []).filter((_, i) => i !== k) })}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      )}
      <select aria-label="Add a gel" value="" onChange={(e) => e.target.value && setLight({ gels: [...(l.gels ?? []), e.target.value] })}>
        <option value="">+ Add a Rosco gel…</option>
        {(Object.keys(GEL_GROUP_LABEL) as GelGroup[]).map((grp) => (
          <optgroup key={grp} label={GEL_GROUP_LABEL[grp]}>
            {GELS.filter((g) => g.group === grp).map((g) => (
              <option key={g.id} value={g.id}>
                {g.number} {g.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="hint-text">CTO and CTB shift the colour temperature; green/magenta and colour gels tint the light. Dense gels make the beam dimmer.</p>
    </Section>
  );
}

/** Hue around the circle, saturation from the centre (white) out. */
function ColorWheel({ hue, sat, onChange }: { hue: number; sat: number; onChange: (hue: number, sat: number) => void }) {
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    const h = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(x, y) / (r.width / 2));
    onChange(Math.round(h), Math.round(s * 100));
  };
  const a = (hue * Math.PI) / 180;
  const rr = (sat / 100) * 50;
  return (
    <div
      className="color-wheel"
      role="slider"
      aria-label="Colour wheel"
      aria-valuetext={`Hue ${hue}°, saturation ${sat}%`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => e.buttons && pick(e)}
    >
      <span className="color-wheel-dot" style={{ left: `${50 + Math.sin(a) * rr}%`, top: `${50 - Math.cos(a) * rr}%`, background: rgbCss(hsToRgb(hue, sat / 100)) }} />
    </div>
  );
}

/** What this item hangs on, and what hangs on it. */
function AttachSection({ item, sceneItems, actors, onUpdate }: { item: Item; sceneItems: Item[]; actors: Actor[]; onUpdate: Props['onUpdate'] }) {
  const parent = item.attachedTo ? sceneItems.find((i) => i.id === item.attachedTo!.to) : undefined;
  const children = sceneItems.filter((i) => i.attachedTo?.to === item.id);
  const name = (i: Item) => (isMeter(i) ? meterName(i, sceneItems, actors) : displayLabel(i, actors) || itemName(i));
  if (!parent && !children.length) {
    if (item.wall || item.inWall) return null;
    return (
      <Section title="Attach">
        <p className="hint-text">Drag Link (in the bar over the selection) onto anything to attach it, or tap Link and then tap the target; they then move and turn as one.</p>
      </Section>
    );
  }
  return (
    <Section title="Attached">
      <ul className="row-list">
        {parent && (
          <li className="row static">
            <span className="row-main">
              <span className="row-title">On {name(parent)}</span>
              <span className="row-sub">{isMeter(item) ? 'Reads the light on it, wherever the meter sits. Rotate (R) swings it around' : 'Moves and turns with it'}</span>
            </span>
            <button id="insp-detach" className="btn" onClick={() => onUpdate({ attachedTo: undefined })}>
              Detach
            </button>
          </li>
        )}
        {children.map((c) => (
          <li key={c.id} className="row static">
            <span className="row-main">
              <span className="row-title">{name(c)}</span>
              <span className="row-sub">Attached here</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const METER_STOPS = ['1', '1.4', '2', '2.8', '4', '5.6', '8', '11', '16', '22', '32'];
const meterZone = (k: number) => (k < 1 || k >= 9 ? 'red' : k < 2 || k >= 8 ? 'amber' : 'green');

/** The meter's screen and settings: camera (ISO, frame rate, shutter), stop increments, lux or fc; then each light's share. */
function MeterSection({
  item,
  sceneItems,
  actors,
  camera,
  sun,
  onUpdate,
}: {
  item: Item;
  sceneItems: Item[];
  actors: Actor[];
  camera: CameraSettings;
  sun?: Sun;
  onUpdate: Props['onUpdate'];
}) {
  const r = meterReadings(sceneItems, camera, sun).find((x) => x.meterId === item.id);
  const holder = item.attachedTo ? sceneItems.find((i) => i.id === item.attachedTo!.to) : undefined;
  if (!r) return null;
  const c = r.config;
  const set = (patch: Partial<NonNullable<Item['meter']>>) => onUpdate({ meter: { ...item.meter, ...patch } });
  const num = (label: string, key: 'iso' | 'fps' | 'shutterDeg', unit: string, min: number, max: number) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-unit">
        <input
          className="text-input num"
          type="number"
          aria-label={label}
          min={min}
          max={max}
          value={c[key]}
          onChange={(e) => e.target.value !== '' && set({ [key]: Math.min(max, Math.max(min, Number(e.target.value))) })}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );
  const parts = stopParts(r.tStop, c.step);
  const none = r.contributions.length === 0;
  const at = Math.min(10, Math.max(0, Math.log2(Math.max(0.5, r.tStop) ** 2)));
  return (
    <Section title="Light meter">
      {holder && <p className="hint-text">The light on {displayLabel(holder, actors) || itemName(holder)}: an attached meter reads what it hangs on, wherever it sits.</p>}
      <div className="meter-screen" aria-label={`Reading approximately ${r.tStopLabel}`}>
        <div className="ms-head">
          <span>{c.fps} fps</span>
          <span>ISO {c.iso}</span>
          <span>{c.shutterDeg}° · {shutterSpeed(c.fps, c.shutterDeg)}</span>
        </div>
        <div className="ms-main">
          <span className="ms-t">T</span>
          <span className="ms-big">{none ? '—' : parts.under ? '<1' : parts.over ? '>32' : parts.base}</span>
          {!none && parts.frac && <span className="ms-frac">{parts.frac}</span>}
          <span className="ms-side">
            {!none && c.unit !== 'off' && <span className="ms-level">≈ {(c.unit === 'fc' ? r.footCandles : r.lux).toLocaleString()} {c.unit === 'fc' ? 'fc' : 'lx'}</span>}
            {none && <span className="ms-level">no light</span>}
            <span className="ms-approx">approximately</span>
          </span>
        </div>
        <div className="ms-scale">
          {METER_STOPS.slice(0, -1).map((s, k) => (
            <span key={s} className={`ms-seg ${meterZone(k)}`} />
          ))}
          {!none && <span className="ms-needle" style={{ left: `${(at / 10) * 100}%` }} />}
        </div>
        <div className="ms-ticks">
          {METER_STOPS.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        {r.ratio && !none && <div className="ms-foot">key:fill {r.ratio}</div>}
      </div>
      {num('ISO', 'iso', '', 50, 25600)}
      {num('Frame rate', 'fps', 'fps', 1, 240)}
      {num('Shutter angle', 'shutterDeg', '°', 1, 360)}
      <label className="field">
        <span className="field-label">Shows stops in</span>
        <select aria-label="Stop increments" value={c.step} onChange={(e) => set({ step: e.target.value as typeof c.step })}>
          <option value="third">Thirds (⅓)</option>
          <option value="half">Halves (½)</option>
          <option value="quarter">Quarters (¼)</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Light level</span>
        <select aria-label="Light level unit" value={c.unit} onChange={(e) => set({ unit: e.target.value as typeof c.unit })}>
          <option value="lux">Lux (lx)</option>
          <option value="fc">Foot-candles (fc)</option>
          <option value="off">Don't show</option>
        </select>
      </label>
      {!none && (
        <ul className="row-list">
          {r.contributions.map((x) => {
            const l = sceneItems.find((i) => i.id === x.lightId);
            return (
              <li key={x.lightId} className="row static">
                <span className="row-main">
                  <span className="row-title">
                    {l ? lightName(l) : x.lightId === DAYLIGHT_ID ? 'Daylight (windows)' : x.lightId.endsWith('~bounce') ? `Bounce off ${itemName(sceneItems.find((i) => bounceId(i.id) === x.lightId) ?? sceneItems[0]!)}` : x.lightId.includes('~mirror~') ? `Mirror (${lightName(sceneItems.find((i) => i.id === x.lightId.split('~mirror~')[1]) ?? sceneItems[0]!)})` : '?'} {x.lightId === r.keyId && r.contributions.length > 1 ? <span className="chip">Key</span> : null}
                  </span>
                  <span className="row-sub">
                    ≈ {c.unit === 'fc' ? `${Math.round(x.lux / 10.764)} fc` : `${Math.round(x.lux)} lux`}
                    {x.blocked ? ' · partly blocked' : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint-text">
        Approximate: a planning simulation from each light's power, beam, distance and height, modifiers, gels, diffusion and anything in the way. Meter
        it on set.
      </p>
    </Section>
  );
}

/** Blocking: marks 1, 2, 3… and which one they're on. */
function BlockingSection({ item, onUpdate }: { item: Item; onUpdate: Props['onUpdate'] }) {
  const marks = marksOf(item);
  const at = item.blocking?.at ?? 0;
  return (
    <Section title="Blocking">
      {marks.length > 0 && (
        <ul className="row-list">
          {marks.map((_, k) => (
            <li key={k} className="row static">
              <span className="row-main">
                <span className="row-title">Mark {k + 1}</span>
                <span className="row-sub">{k === at ? 'Standing here now' : ''}</span>
              </span>
              {k !== at && (
                <button className="btn" onClick={() => onUpdate(goToMark(item, k))}>
                  Go to
                </button>
              )}
              <button className="icon-btn" aria-label={`Remove mark ${k + 1}`} onClick={() => onUpdate(removeMark(item, k))}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn" onClick={() => onUpdate(addMark(item))}>
        + Add a mark
      </button>
      <p className="hint-text">
        Marks are joined by a numbered path on the plan; drag them to place them. "Go to" moves this person there, and cameras, lights,
        readings and shadows follow.
      </p>
    </Section>
  );
}


/** A note's text, colour and size. */
function NoteSection({ item, onUpdate }: { item: Item; onUpdate: Props['onUpdate'] }) {
  const note = item.note ?? { text: '' };
  const { shape, w, d } = itemLook(item);
  const setNote = (patch: Partial<NonNullable<Item['note']>>) => onUpdate({ note: { ...note, ...patch } });
  const size = (label: string, value: number, set: (v: number) => void) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-unit">
        <input className="text-input num" type="number" min={10} step={10} aria-label={label} value={Math.round(value)} onChange={(e) => set(Math.max(10, Number(e.target.value) || 10))} />
        <span className="unit">cm</span>
      </span>
    </label>
  );
  const isDraw = shape === 'note-draw';
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="field toggle">
      <span className="field-label">{label}</span>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
    </label>
  );
  return (
    <Section title={isDraw ? 'Drawing' : shape === 'note-arrow' ? 'Arrow' : 'Note'}>
      {!isDraw && (
        <label className="field stack">
          <span className="field-label">{shape === 'note-arrow' ? 'Label' : 'Text'}</span>
          <textarea className="text-input" rows={2} aria-label="Note text" value={note.text} onChange={(e) => setNote({ text: e.target.value })} />
        </label>
      )}
      <div className="field">
        <span className="field-label">Colour</span>
        <div className="swatches">
          {NOTE_COLORS.map((c) => (
            <button key={c} className={`swatch-btn ${(note.color ?? NOTE_DEFAULT_COLOR) === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={(note.color ?? NOTE_DEFAULT_COLOR) === c} onClick={() => setNote({ color: c })} />
          ))}
        </div>
      </div>
      {shape === 'note-arrow' && (
        <label className="field">
          <span className="field-label">Shape</span>
          <select className="text-input" aria-label="Arrow shape" value={note.arrow ?? 'straight'} onChange={(e) => setNote({ arrow: e.target.value as ArrowStyle })}>
            {ARROW_STYLES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!isDraw && (
        <label className="field">
          <span className="field-label">Text size</span>
          <span className="input-unit">
            <input className="text-input num" type="number" min={8} max={200} aria-label="Text size" value={note.fontSize ?? 24} onChange={(e) => setNote({ fontSize: Math.min(200, Math.max(8, Number(e.target.value) || 24)) })} />
          </span>
        </label>
      )}
      {toggle(isDraw ? 'Edge' : 'Text outline', note.outline !== false, (on) => setNote({ outline: on }))}
      {!isDraw && toggle('Background', !!note.background, (on) => setNote({ background: on }))}
      {isDraw && (
        <label className="field">
          <span className="field-label">Line width</span>
          <span className="input-unit">
            <input className="text-input num" type="number" min={0.5} step={0.5} aria-label="Line width" value={Math.round((note.strokeCm ?? 4) * 10) / 10} onChange={(e) => setNote({ strokeCm: Math.max(0.5, Number(e.target.value) || 4) })} />
            <span className="unit">cm</span>
          </span>
        </label>
      )}
      {shape === 'note-area' && (
        <>
          {size('Width', w, (v) => onUpdate({ sizeCm: { w: v, d } }))}
          {size('Depth', d, (v) => onUpdate({ sizeCm: { w, d: v } }))}
        </>
      )}
      {shape === 'note-arrow' && size('Length', d, (v) => onUpdate({ sizeCm: { w, d: v } }))}
      {shape === 'note-text' && size('Box width', w, (v) => onUpdate({ sizeCm: { w: v, d: item.sizeCm?.d ?? 40 } }))}
      {shape === 'note-text' && <p className="hint-text">The box grows with the text; set its width and the text wraps to fit.</p>}
      {shape === 'note-arrow' && <p className="hint-text">Use the Rotate tool (R) to point it. Its label stays upright whichever way it points.</p>}
    </Section>
  );
}

const m = (cm: number) => `${(cm / 100).toFixed(1)} m`;

/** What a light does through diffusion, in a sentence or two. */
function diffusionText(src: NonNullable<ReturnType<typeof lightSource>>): string | null {
  if (!src.frameId || src.litCm == null) return null;
  const scatter = (src.scatter ?? 1) >= 0.9 ? 'it scatters fully, so the whole lit patch glows evenly' : 'it is light diffusion, so a hot spot and some hard shadow show through';
  return `From ${m(src.frameDistCm ?? 0)} back, the beam lights about ${Math.round(src.litCm)} cm of the frame; ${scatter}.`;
}

/** For a diffusion frame: how soft each light through it is on its subject. */
function FrameDiffusion({ item, sceneItems }: { item: Item; sceneItems: Item[] }) {
  const through = sceneItems
    .filter((l) => l.kind === 'light' && !l.hidden)
    .map((l) => ({ l, src: lightSource(l, sceneItems) }))
    .filter((x): x is { l: Item; src: NonNullable<typeof x.src> } => x.src?.frameId === item.id);
  if (!through.length) return null;
  return (
    <div className="hint-text">
      {through.map(({ l, src }) => (
        <p key={l.id}>
          <strong className={`hardness ${src.hardness}`}>{l.light?.unitId ?? 'Light'}: {src.hardness}</strong> · lights {Math.round(src.litCm ?? 0)} cm of the frame from {m(src.frameDistCm ?? 0)} back
          {src.subjectCm != null ? `, looks ${Math.round(src.apparentDeg ?? 0)}° wide from the subject ${m(src.subjectCm)} away` : ''}.
        </p>
      ))}
      <p>Softer: bring the frame closer to the subject, or pull the light back so it fills the frame. Harder: the opposite.</p>
    </div>
  );
}

const HARDNESS_TEXT = {
  hard: 'Hard: dark shadows with crisp edges.',
  medium: 'Medium: lighter shadows with soft edges.',
  soft: 'Soft: faint shadows that fade out at the edges.',
};

/** How this light's shadows look, and why; its height sets how long they are. */
function ShadowSection({ item, sceneItems, setLight }: { item: Item; sceneItems: Item[]; setLight: (p: Partial<LightProps>) => void }) {
  const src = lightSource(item, sceneItems);
  if (!src) return null;
  return (
    <Section title="Shadows">
      <p className="hint-text">
        <strong className={`hardness ${src.hardness}`}>{HARDNESS_TEXT[src.hardness]}</strong> Source about {src.sizeCm} cm across ({src.why})
        {src.subjectCm != null ? `, ${m(src.subjectCm)} from the subject, so it looks ${Math.round(src.apparentDeg ?? 0)}° wide` : ''}.{' '}
        {diffusionText(src) ?? ''} Softness comes from how big the source looks from the subject: bigger or closer is softer, smaller or farther is harder.
        {src.frameId ? ' Bring the frame closer to the subject, or pull the light back to fill it, to soften.' : ''}
      </p>
      <label className="field">
        <span className="field-label">Height</span>
        <span className="input-unit">
          <input
            className="text-input num"
            type="number"
            min={20}
            step={10}
            aria-label="Light height"
            value={src.heightCm}
            onChange={(e) => setLight({ heightCm: Math.max(20, Number(e.target.value) || 20) })}
          />
          <span className="unit">cm</span>
        </span>
      </label>
      <p className="hint-text">Lower lights make longer shadows. Anything taller than the light (walls, flags) shadows to the end of the beam.</p>
    </Section>
  );
}

function FixtureCard({ f }: { f: Fixture }) {
  const best = bestBatteryOutputPct(f);
  const rows: [string, string][] = [
    ['Power', f.powerW != null ? `${f.powerW} W` : '?'],
    ['Head weight', kg(f.weightKg)],
    ['Power supply', f.psu.external ? `external, ${kg(f.psu.weightKg)}` : 'built in'],
    ['IP', `${f.ipRating ?? '—'}${f.psu.external ? ` / PSU ${f.psu.ipRating ?? '—'}` : ''}`],
    [
      'Battery',
      f.batteries === null ? '?' : f.batteries.length === 0 ? 'mains only' : `${f.batteries.map((b) => b.type).join(', ')}${best != null ? ` (max ${best}%)` : ''}`,
    ],
  ];
  if (f.headCableM != null) rows.push(['Head cable', `${f.headCableM} m`]);
  return (
    <div className="card">
      <div className="card-title">
        <b>{f.model}</b> <span className="muted">{f.brand}</span>
      </div>
      <div className="tags">
        {sizeClass(f) && <span className="chip dim">{sizeClass(f)}</span>}
        {RIGGING_PICKS.has(f.id) && <span className="chip">Best for rigging</span>}
        {isWeatherSealed(f.ipRating) && <span className="chip">{isFullyWeatherSealed(f) ? 'Weather sealed' : 'Head sealed'}</span>}
      </div>
      <dl className="specs">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ModifierSection({
  item,
  fixture,
  gear,
  setLight,
}: {
  item: Item;
  fixture: Fixture;
  gear: GearScope;
  setLight: (p: Partial<LightProps>) => void;
}) {
  const attached = itemModifiers(item);
  const ids = item.light?.modifierIds ?? [];
  const list = limitingList(gear);
  const options = modifiersFor(fixture, MODIFIERS)
    .filter((m) => !ids.includes(m.id))
    .filter((m) => !list || (avail(gear, 'modifier', m.id)?.left ?? 0) > 0)
    .sort((a, b) => a.type.localeCompare(b.type) || (a.weightKg ?? 99) - (b.weightKg ?? 99));
  const rig = itemRigWeightKg(item);

  return (
    <Section title="Modifiers">
      {attached.map((m) => (
        <div key={m.id} className="attached">
          <span>
            {m.model} <span className="muted">{kg(m.weightKg)}</span>
          </span>
          <button className="icon-btn" aria-label={`Remove ${m.model}`} onClick={() => setLight({ modifierIds: ids.filter((i) => i !== m.id) })}>
            <IconClose />
          </button>
        </div>
      ))}
      {options.length > 0 ? (
        <select
          value=""
          onChange={(e) => e.target.value && setLight({ modifierIds: [...ids, e.target.value] })}
          aria-label="Add modifier"
        >
          <option value="">+ Add modifier ({options.length} fit)</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.type} · {m.brand} {m.model} · {kg(m.weightKg)}
            </option>
          ))}
        </select>
      ) : (
        <p className="hint-text">
          {list ? 'No modifiers left on the gear list that fit this light.' : `No catalogued modifiers fit this light${fixture.mount ? ` (${fixture.mount} mount)` : ''}.`}
        </p>
      )}
      <div className="rig-weight">
        <span>Rig weight (head + modifiers)</span>
        <b>{kg(rig)}</b>
      </div>
      {rig === null && <p className="hint-text">A weight is missing from the catalogue, so the total is unknown.</p>}
    </Section>
  );
}

function StandSection({ item, gear, setLight }: { item: Item; gear: GearScope; setLight: (p: Partial<LightProps>) => void }) {
  const rig = itemRigWeightKg(item);
  const current = standById(item.light?.standId);
  const check = standCheck(item);
  const list = limitingList(gear);
  const options = list
    ? list.entries
        .filter((e) => e.kind === 'stand' && (avail(gear, 'stand', e.id)?.left ?? 0) > 0)
        .map((e) => standById(e.id))
        .filter((s): s is NonNullable<typeof s> => !!s)
    : standsFor(rig).slice(0, 60);
  if (current && !options.includes(current)) options.unshift(current);

  return (
    <Section title="Stand">
      <select value={current?.id ?? ''} onChange={(e) => setLight({ standId: e.target.value || undefined })} aria-label="Stand">
        <option value="">No stand</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.brand} {s.model} · {kg(s.weightKg)} · max {kg(s.loadCapacityKg)} · {s.maxHeightCm ?? '?'} cm
          </option>
        ))}
      </select>
      <p className="hint-text">
        {list ? 'Stands left on the gear list.' : `Lightest stands that carry ${rig != null ? kg(rig) : 'this light'} are listed first.`}
      </p>
      {check === 'over' && <p className="warn">Over the stand's load capacity.</p>}
      {check === 'unknown' && <p className="hint-text">Can't check the load: a weight is unknown.</p>}
      {check === 'ok' && current && (
        <p className="ok">
          OK: {kg(rig)} on a stand rated {kg(current.loadCapacityKg)}.
        </p>
      )}
    </Section>
  );
}

/** Four skirt quarters laid out round the light (front at the top), plus all down / all up. */
function SkirtControl({ down, onChange }: { down: boolean[] | undefined; onChange: (skirt: boolean[]) => void }) {
  const cur = [0, 1, 2, 3].map((k) => !!down?.[k]);
  const all = cur.every(Boolean);
  const toggle = (k: number) => onChange(cur.map((v, j) => (j === k ? !v : v)));
  // Grid cells: front top middle, right middle right, back bottom middle, left middle left.
  const cells: Record<number, string> = { 0: 'skirt-front', 1: 'skirt-right', 2: 'skirt-back', 3: 'skirt-left' };
  return (
    <div className="skirt-control" role="group" aria-label="Skirt">
      {SKIRT_SIDES.map((side, k) => (
        <button key={side} type="button" className={`skirt-side ${cells[k]}`} aria-pressed={cur[k]} onClick={() => toggle(k)}>
          {side}
          <span className="skirt-state">{cur[k] ? 'down' : 'up'}</span>
        </button>
      ))}
      <button type="button" className="skirt-all" onClick={() => onChange(cur.map(() => !all))}>
        {all ? 'All up' : 'All down'}
      </button>
    </div>
  );
}
