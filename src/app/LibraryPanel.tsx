import { useMemo, useState } from 'react';
import { isWeatherSealed, SIZE_CLASSES, sizeClass, type SizeClass } from '../catalog/classify';
import type { Fixture } from '../catalog/schema';
import { CATEGORY_LABELS, LIBRARY, type LibraryCategory, type LibraryItem } from '../library/items';
import { BRANDS, filterFixtures, RIGGING_PICKS } from '../model/gear';
import { KIND_ROLES, ROLE_LABEL, roleOf, type EditMode, type ProjectKind } from '../model/project';
import type { Actor, CastRole } from '../model/types';
import { avail, limitingList, NO_GEAR, type GearScope } from './gearScope';

export type PlaceRequest = { library: LibraryItem } | { fixture: Fixture };

interface Props {
  mode: EditMode;
  gear: GearScope;
  onPlace: (req: PlaceRequest) => void;
  /** Cast, for the People category. */
  kind: ProjectKind;
  actors: Actor[];
  placed: Set<string>;
  onNewPerson: (role: CastRole) => void;
  onPlaceActor: (id: string) => void;
}

/** Library categories offered in each edit mode. */
const MODE_CATEGORIES: Record<EditMode, LibraryCategory[]> = {
  lights: ['lights'],
  grip: ['grip'],
  camera: ['camera'],
  scene: ['people', 'set', 'props'],
};

export function LibraryPanel({ mode, gear, onPlace, kind, actors, placed, onNewPerson, onPlaceActor }: Props) {
  const categories = MODE_CATEGORIES[mode];
  const [picked, setCategory] = useState<LibraryCategory>(categories[0]!);
  const category = categories.includes(picked) ? picked : categories[0]!;
  const limited = !!limitingList(gear);
  const generic = LIBRARY.filter((i) => i.category === category && !(limited && i.category === 'lights') && i.id !== 'generic.person');
  return (
    <div className="panel-body">
      <div className="template-list" role="tablist" aria-label="Library categories">
        {categories.map((c) => (
          <button key={c} role="tab" aria-selected={c === category} className="template-tab" onClick={() => setCategory(c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {category === 'lights' && <FixtureSearch gear={gear} onPick={(fixture) => onPlace({ fixture })} />}
      {category === 'people' && (
        <div className="cast-add">
          <div className="btn-row">
            {KIND_ROLES[kind].map((r) => (
              <button key={r} id={`new-${r}`} className="primary" onClick={() => onNewPerson(r)}>
                + {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          {actors.some((a) => !placed.has(a.id)) && (
            <>
              <p className="muted small">Not in this scene yet:</p>
              <div className="lib-grid">
                {actors
                  .filter((a) => !placed.has(a.id))
                  .map((a) => (
                    <button key={a.id} className="lib-item" onClick={() => onPlaceActor(a.id)}>
                      <span>
                        <span className="dot" style={{ background: a.color }} /> {a.name}
                      </span>
                      <span className="lib-size">{ROLE_LABEL[roleOf(a)]}</span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
      <div className="lib-grid">
        {generic.map((i) => (
          <button key={i.id} className="lib-item" onClick={() => onPlace({ library: i })}>
            <span>{i.name}</span>
            <span className="lib-size">
              {i.sizeCm.w}×{i.sizeCm.d}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Real fixtures from the catalogue, with brand, size class and tag filters. */
export function FixtureSearch({
  onPick,
  compact,
  gear = NO_GEAR,
  keepId,
}: {
  onPick: (f: Fixture) => void;
  compact?: boolean;
  gear?: GearScope;
  /** Fixture already on this light: still pickable when the list has none left. */
  keepId?: string;
}) {
  const list = limitingList(gear);
  const ids = useMemo(
    () => (list ? new Set(list.entries.filter((e) => e.kind === 'fixture').map((e) => e.id)) : undefined),
    [list],
  );
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState<string>('');
  const [cls, setCls] = useState<SizeClass | ''>('');
  const [rigging, setRigging] = useState(false);
  const [sealed, setSealed] = useState(false);
  const active = !!ids || query.trim() !== '' || brand !== '' || cls !== '' || rigging || sealed;
  const results = useMemo(
    () => (active ? filterFixtures({ query, brand: brand || undefined, sizeClass: cls || undefined, rigging, sealed, ids }) : []),
    [active, query, brand, cls, rigging, sealed, ids],
  );

  return (
    <div className="fixture-search">
      <input
        type="search"
        className="text-input"
        placeholder={ids ? 'Search your gear list…' : 'Search lights: 600d, S60, Forza…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search the light catalogue"
      />
      <div className="filters">
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
          <option value="">All brands</option>
          {BRANDS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select value={cls} onChange={(e) => setCls(e.target.value as SizeClass | '')} aria-label="Size class">
          <option value="">All sizes</option>
          {SIZE_CLASSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button className={`tag-toggle ${rigging ? 'on' : ''}`} aria-pressed={rigging} onClick={() => setRigging((v) => !v)}>
          Best for rigging
        </button>
        <button className={`tag-toggle ${sealed ? 'on' : ''}`} aria-pressed={sealed} onClick={() => setSealed((v) => !v)}>
          Weather sealed
        </button>
      </div>
      {active && (
        <ul className={`fixture-list ${compact ? 'compact' : ''}`}>
          {results.length === 0 && <li className="muted">{ids?.size === 0 ? 'No lights on the gear list yet.' : 'No match.'}</li>}
          {results.map((f) => {
            const a = avail(gear, 'fixture', f.id);
            const out = !!list && !!a && a.left <= 0 && f.id !== keepId;
            return (
            <li key={f.id}>
              <button className="fixture-row" onClick={() => onPick(f)} disabled={out}>
                <span className="fixture-name">
                  <b>{f.model}</b> <span className="muted">{f.brand}</span>
                </span>
                <span className="fixture-specs">
                  {f.powerW != null ? `${f.powerW} W` : '? W'} · {f.weightKg != null ? `${f.weightKg} kg` : '? kg'}
                  {RIGGING_PICKS.has(f.id) && <span className="chip">Rig</span>}
                  {isWeatherSealed(f.ipRating) && <span className="chip">{f.ipRating}</span>}
                  {sizeClass(f) && <span className="chip dim">{sizeClass(f)}</span>}
                  {a && <span className={`chip ${a.left > 0 ? '' : 'dim'}`}>{Math.max(0, a.left)}/{a.qty} left</span>}
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
