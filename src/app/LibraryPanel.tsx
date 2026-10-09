import { useMemo, useState } from 'react';
import { isWeatherSealed, SIZE_CLASSES, sizeClass, type SizeClass } from '../catalog/classify';
import type { Fixture } from '../catalog/schema';
import { CATEGORY_LABELS, LIBRARY, type LibraryCategory, type LibraryItem } from '../library/items';
import { BRANDS, filterFixtures, RIGGING_PICKS } from '../model/gear';

export type PlaceRequest = { library: LibraryItem } | { fixture: Fixture };

interface Props {
  onPlace: (req: PlaceRequest) => void;
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as LibraryCategory[];

export function LibraryPanel({ onPlace }: Props) {
  const [category, setCategory] = useState<LibraryCategory>('lights');
  return (
    <div className="panel-body">
      <div className="template-list" role="tablist" aria-label="Library categories">
        {CATEGORIES.map((c) => (
          <button key={c} role="tab" aria-selected={c === category} className="template-tab" onClick={() => setCategory(c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {category === 'lights' && <FixtureSearch onPick={(fixture) => onPlace({ fixture })} />}
      <div className="lib-grid">
        {LIBRARY.filter((i) => i.category === category).map((i) => (
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
export function FixtureSearch({ onPick, compact }: { onPick: (f: Fixture) => void; compact?: boolean }) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState<string>('');
  const [cls, setCls] = useState<SizeClass | ''>('');
  const [rigging, setRigging] = useState(false);
  const [sealed, setSealed] = useState(false);
  const active = query.trim() !== '' || brand !== '' || cls !== '' || rigging || sealed;
  const results = useMemo(
    () => (active ? filterFixtures({ query, brand: brand || undefined, sizeClass: cls || undefined, rigging, sealed }) : []),
    [active, query, brand, cls, rigging, sealed],
  );

  return (
    <div className="fixture-search">
      <input
        type="search"
        className="text-input"
        placeholder="Search lights: 600d, S60, Forza…"
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
          {results.length === 0 && <li className="muted">No match.</li>}
          {results.map((f) => (
            <li key={f.id}>
              <button className="fixture-row" onClick={() => onPick(f)}>
                <span className="fixture-name">
                  <b>{f.model}</b> <span className="muted">{f.brand}</span>
                </span>
                <span className="fixture-specs">
                  {f.powerW != null ? `${f.powerW} W` : '? W'} · {f.weightKg != null ? `${f.weightKg} kg` : '? kg'}
                  {RIGGING_PICKS.has(f.id) && <span className="chip">Rig</span>}
                  {isWeatherSealed(f.ipRating) && <span className="chip">{f.ipRating}</span>}
                  {sizeClass(f) && <span className="chip dim">{sizeClass(f)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
