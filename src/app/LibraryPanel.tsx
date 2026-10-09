import { useMemo, useState } from 'react';
import { isWeatherSealed, SIZE_CLASSES, sizeClass, type SizeClass } from '../catalog/classify';
import type { Fixture } from '../catalog/schema';
import { CATEGORY_LABELS, LIBRARY, type LibraryCategory, type LibraryItem } from '../library/items';
import { BRANDS, filterFixtures, RIGGING_PICKS } from '../model/gear';
import type { EditMode } from '../model/project';
import { avail, limitingList, NO_GEAR, type GearScope } from './gearScope';

export type PlaceRequest = { library: LibraryItem } | { fixture: Fixture };

interface Props {
  mode: EditMode;
  gear: GearScope;
  onPlace: (req: PlaceRequest) => void;
}

/** Library categories offered in each edit mode. Actors are placed from the Actors tab. */
const MODE_CATEGORIES: Record<EditMode, LibraryCategory[]> = {
  lights: ['lights', 'grip'],
  camera: ['camera'],
  scene: ['set', 'props', 'people'],
};

export function LibraryPanel({ mode, gear, onPlace }: Props) {
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
      {category === 'people' && <p className="muted small">Actors are added and placed from the Actors tab.</p>}
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
