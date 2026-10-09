import { useMemo, useState } from 'react';
import { isWeatherSealed, SIZE_CLASSES, sizeClass, type SizeClass } from '../catalog/classify';
import type { Fixture } from '../catalog/schema';
import { BRANDS, filterFixtures, RIGGING_PICKS } from '../model/gear';
import { avail, limitingList, NO_GEAR, type GearScope } from './gearScope';

const DRAG_TYPE = 'application/x-lfpd-item';

interface Props {
  onPick: (f: Fixture) => void;
  gear?: GearScope;
  /** Fixture already on this light: still pickable when the list has none left. */
  keepId?: string;
  autoFocus?: boolean;
}

/**
 * Real fixtures from the catalogue: free-text search plus brand, size class and tag filters.
 * With a limiting gear list, only that gear is listed, with how many are left.
 */
export function FixtureSearch({ onPick, gear = NO_GEAR, keepId, autoFocus }: Props) {
  const list = limitingList(gear);
  const ids = useMemo(
    () => (list ? new Set(list.entries.filter((e) => e.kind === 'fixture').map((e) => e.id)) : undefined),
    [list],
  );
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [cls, setCls] = useState<SizeClass | ''>('');
  const [rigging, setRigging] = useState(false);
  const [sealed, setSealed] = useState(false);
  const active = !!ids || query.trim() !== '' || brand !== '' || cls !== '' || rigging || sealed;
  const results = useMemo(
    () => (active ? filterFixtures({ query, brand: brand || undefined, sizeClass: cls || undefined, rigging, sealed, ids }) : []),
    [active, query, brand, cls, rigging, sealed, ids],
  );

  return (
    <div className="stack">
      <input
        type="search"
        className="text-input"
        placeholder={ids ? 'Search your gear list…' : 'Search: 600d, S60, Forza…'}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search lights"
      />
      <div className="filter-grid">
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
        <button className={`btn toggle-btn ${rigging ? 'on' : ''}`} aria-pressed={rigging} onClick={() => setRigging((v) => !v)}>
          Best for rigging
        </button>
        <button className={`btn toggle-btn ${sealed ? 'on' : ''}`} aria-pressed={sealed} onClick={() => setSealed((v) => !v)}>
          Weather sealed
        </button>
      </div>
      {active && (
        <ul className="row-list scroll">
          {results.length === 0 && (
            <li className="row-empty">{ids?.size === 0 ? 'No lights on the gear list yet.' : 'No match.'}</li>
          )}
          {results.map((f) => {
            const a = avail(gear, 'fixture', f.id);
            const out = !!list && !!a && a.left <= 0 && f.id !== keepId;
            return (
              <li key={f.id}>
                <button
                  className="row"
                  onClick={() => onPick(f)}
                  disabled={out}
                  draggable={!out}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, `fixture:${f.id}`);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <span className="row-main">
                    <span className="row-title">
                      {f.model} <span className="muted">{f.brand}</span>
                    </span>
                    <span className="row-sub">
                      {f.powerW != null ? `${f.powerW} W` : '? W'} · {f.weightKg != null ? `${f.weightKg} kg` : '? kg'}
                      {sizeClass(f) && <span className="chip dim">{sizeClass(f)}</span>}
                      {RIGGING_PICKS.has(f.id) && <span className="chip">Rig</span>}
                      {isWeatherSealed(f.ipRating) && <span className="chip">{f.ipRating}</span>}
                    </span>
                  </span>
                  {a && (
                    <span className={`row-meta ${a.left > 0 ? '' : 'muted'}`}>
                      {Math.max(0, a.left)}/{a.qty} left
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
