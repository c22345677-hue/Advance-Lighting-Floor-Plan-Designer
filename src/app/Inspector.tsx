import { useState } from 'react';
import { bestBatteryOutputPct, isFullyWeatherSealed, isWeatherSealed, sizeClass } from '../catalog/classify';
import { modifiersFor } from '../catalog/modifiers';
import { MODIFIERS } from '../catalog/data';
import type { Fixture } from '../catalog/schema';
import { libraryItem } from '../library/items';
import {
  itemFixture,
  itemModifiers,
  itemRigWeightKg,
  RIGGING_PICKS,
  standById,
  standCheck,
  standsFor,
} from '../model/gear';
import type { ProjectKind } from '../model/project';
import type { Actor, Item, LightProps } from '../model/types';
import { ActorEditor } from './ActorsPanel';
import { avail, limitingList, type GearScope } from './gearScope';
import { FixtureSearch } from './LibraryPanel';
import { beamDegOf, displayLabel, isFocusLocked } from './PlanCanvas';

interface Props {
  item: Item;
  /** Everything in the scene (for camera focus targets). */
  sceneItems: Item[];
  actors: Actor[];
  kind: ProjectKind;
  gear: GearScope;
  onUpdate: (patch: Partial<Omit<Item, 'id'>>) => void;
  onUpdateActor: (id: string, patch: Partial<Omit<Actor, 'id'>>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const kg = (v: number | null | undefined) => (v == null ? '?' : `${Math.round(v * 100) / 100} kg`);

export function Inspector(props: Props) {
  const { item, sceneItems, actors, kind, gear, onUpdate, onUpdateActor, onDuplicate, onDelete } = props;
  const setLight = (patch: Partial<LightProps>) => onUpdate({ light: { ...item.light, ...patch } });
  const name = itemFixture(item)?.model ?? libraryItem(item.catalogId)?.name ?? item.kind;
  const actor = item.actorId ? actors.find((a) => a.id === item.actorId) : undefined;
  const rotationLocked = isFocusLocked(item, sceneItems);

  return (
    <div className="panel-body">
      <h3 className="insp-title">{displayLabel(item, actors) || name}</h3>

      {actor ? (
        <>
          <p className="muted small">Changes apply to {actor.name} in every scene.</p>
          <ActorEditor actor={actor} kind={kind} onUpdate={(patch) => onUpdateActor(actor.id, patch)} />
        </>
      ) : (
      <label className="field">
        <span className="field-label">Label</span>
        <input
          className="text-input"
          value={item.label ?? ''}
          placeholder={name}
          onChange={(e) => onUpdate({ label: e.target.value || undefined })}
        />
      </label>
      )}
      <label className="field">
        <span className="field-label">Rotation</span>
        <input
          className="text-input num"
          type="number"
          step={15}
          disabled={rotationLocked}
          title={rotationLocked ? 'Follows its focus actor' : undefined}
          value={Math.round(item.rotationDeg)}
          onChange={(e) => onUpdate({ rotationDeg: ((Number(e.target.value) % 360) + 360) % 360 })}
        />
      </label>

      <div className="btn-row">
        <button onClick={onDuplicate}>Duplicate</button>
        <button aria-pressed={!!item.locked} onClick={() => onUpdate({ locked: !item.locked || undefined })}>
          {item.locked ? 'Unlock' : 'Lock'}
        </button>
        <button className="danger" onClick={onDelete}>
          {actor ? 'Remove from scene' : 'Delete'}
        </button>
      </div>

      {item.kind === 'camera' && <CameraSection item={item} sceneItems={sceneItems} actors={actors} onUpdate={onUpdate} />}
      {item.kind === 'light' && <LightSection item={item} gear={gear} setLight={setLight} onUpdate={onUpdate} />}
    </div>
  );
}

function CameraSection({ item, sceneItems, actors, onUpdate }: Pick<Props, 'item' | 'sceneItems' | 'actors' | 'onUpdate'>) {
  const inScene = actors.filter((a) => sceneItems.some((i) => i.actorId === a.id));
  const focus = item.camera?.focusActorId;
  const setFocus = (focusActorId: string | undefined) => onUpdate({ camera: { ...item.camera, focusActorId } });
  return (
    <section className="insp-section">
      <h4>Camera</h4>
      <label className="field toggle">
        <span className="field-label">Camera focus on</span>
        <input
          type="checkbox"
          checked={!!focus}
          disabled={inScene.length === 0}
          onChange={(e) => setFocus(e.target.checked ? inScene[0]?.id : undefined)}
        />
      </label>
      {inScene.length === 0 && <p className="muted small">Place a person in this scene to focus on them.</p>}
      {focus && (
        <>
          <select value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Focus on actor">
            {inScene.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {!inScene.some((a) => a.id === focus) && <option value={focus}>(not in this scene)</option>}
          </select>
          <p className="muted small">The camera turns to face this person whenever either of them moves.</p>
        </>
      )}
    </section>
  );
}

function LightSection({
  item,
  gear,
  setLight,
  onUpdate,
}: {
  item: Item;
  gear: GearScope;
  setLight: (p: Partial<LightProps>) => void;
  onUpdate: Props['onUpdate'];
}) {
  const fixture = itemFixture(item);
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
      <section className="insp-section">
        <h4>Fixture</h4>
        {fixture && !picking ? (
          <>
            <FixtureCard f={fixture} />
            <button onClick={() => setPicking(true)}>Change fixture</button>
          </>
        ) : (
          <>
            <p className="muted small">Pick the real light to get its power, weight and fitting modifiers.</p>
            <FixtureSearch onPick={pick} compact gear={gear} keepId={fixture?.id} />
            {fixture && <button onClick={() => setPicking(false)}>Cancel</button>}
          </>
        )}
      </section>

      {fixture && <ModifierSection item={item} fixture={fixture} gear={gear} setLight={setLight} />}
      {fixture && <StandSection item={item} gear={gear} setLight={setLight} />}

      <section className="insp-section">
        <h4>Beam</h4>
        <label className="field">
          <span className="field-label">Angle</span>
          <input
            className="text-input num"
            type="number"
            min={5}
            max={360}
            value={beamDegOf(item)}
            onChange={(e) => setLight({ beamDeg: Math.min(360, Math.max(5, Number(e.target.value) || 5)) })}
          />
          <span className="unit">°</span>
        </label>
        <label className="field">
          <span className="field-label">Throw</span>
          <input
            className="text-input num"
            type="number"
            min={50}
            step={50}
            value={item.light?.throwCm ?? 300}
            onChange={(e) => setLight({ throwCm: Math.max(50, Number(e.target.value) || 50) })}
          />
          <span className="unit">cm</span>
        </label>
      </section>
    </>
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
    <section className="insp-section">
      <h4>Modifiers</h4>
      {attached.map((m) => (
        <div key={m.id} className="attached">
          <span>
            {m.model} <span className="muted">{kg(m.weightKg)}</span>
          </span>
          <button aria-label={`Remove ${m.model}`} onClick={() => setLight({ modifierIds: ids.filter((i) => i !== m.id) })}>
            ×
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
        <p className="muted small">
          {list ? 'No modifiers left on the gear list that fit this light.' : `No catalogued modifiers fit this light${fixture.mount ? ` (${fixture.mount} mount)` : ''}.`}
        </p>
      )}
      <div className="rig-weight">
        Rig weight <b>{kg(rig)}</b>
        {rig === null && <span className="muted small"> (a weight is unknown)</span>}
      </div>
    </section>
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
    <section className="insp-section">
      <h4>Stand</h4>
      <select value={current?.id ?? ''} onChange={(e) => setLight({ standId: e.target.value || undefined })} aria-label="Stand">
        <option value="">No stand</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.brand} {s.model} · {kg(s.weightKg)} · max {kg(s.loadCapacityKg)} · {s.maxHeightCm ?? '?'} cm
          </option>
        ))}
      </select>
      <p className="muted small">
        {list ? 'Stands left on the gear list.' : `Lightest stands that carry ${rig != null ? kg(rig) : 'this light'} are listed first.`}
      </p>
      {check === 'over' && <p className="warn">Over the stand's load capacity.</p>}
      {check === 'unknown' && <p className="muted small">Can't check the load: a weight is unknown.</p>}
      {check === 'ok' && current && (
        <p className="ok">
          OK: {kg(rig)} on a stand rated {kg(current.loadCapacityKg)}.
        </p>
      )}
    </section>
  );
}
