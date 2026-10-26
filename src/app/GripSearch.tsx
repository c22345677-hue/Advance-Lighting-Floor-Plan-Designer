// Grip from the library and stands from the catalogue: free-text search plus kind and brand
// filters, the same way lights are searched. Tap to add in the middle of the view, or drag.
import { useMemo, useState } from 'react';
import type { Stand, StandType } from '../catalog/schema';
import { STANDS } from '../catalog/data';
import { LIBRARY, type LibraryItem } from '../library/items';
import { DRAG_TYPE, type PlaceRequest } from './CategoryPanel';

type Kind = '' | 'frames' | 'boards' | 'stands' | 'bags';

const KINDS: { id: Kind; label: string }[] = [
  { id: '', label: 'All grip' },
  { id: 'frames', label: 'Flags & frames' },
  { id: 'boards', label: 'Boards' },
  { id: 'stands', label: 'Stands' },
  { id: 'bags', label: 'Sandbags' },
];

const STAND_TYPE: Record<StandType, string> = { light: 'Light stand', 'c-stand': 'C-stand', combo: 'Combo stand', roller: 'Roller stand', boom: 'Boom stand' };

const kindOfLib = (i: LibraryItem): Kind => (i.shape === 'stand' ? 'stands' : i.shape === 'sandbag' ? 'bags' : i.shape === 'polyboard' ? 'boards' : 'frames');

const STAND_BRANDS = [...new Set(STANDS.map((s) => s.brand))].sort();

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (text: string, q: string[]) => q.every((w) => text.toLowerCase().includes(w));

export function GripSearch({ onPlace }: { onPlace: (req: PlaceRequest) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('');
  const [brand, setBrand] = useState('');
  const active = query.trim() !== '' || kind !== '' || brand !== '';
  const q = words(query);
  const lib = useMemo(
    () => (active && !brand ? LIBRARY.filter((i) => i.category === 'grip' && !i.unlisted && (!kind || kindOfLib(i) === kind) && matches(i.name, q)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, kind, brand, query],
  );
  const stands = useMemo(
    () =>
      active && (!kind || kind === 'stands')
        ? STANDS.filter((s) => (!brand || s.brand === brand) && matches(`${s.brand} ${s.model} ${STAND_TYPE[s.type]}`, q)).slice(0, 60)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, kind, brand, query],
  );
  const row = (key: string, drag: string, onClick: () => void, title: React.ReactNode, sub: string) => (
    <li key={key}>
      <button
        className="row"
        onClick={onClick}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, drag);
          e.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <span className="row-main">
          <span className="row-title">{title}</span>
          <span className="row-sub">{sub}</span>
        </span>
      </button>
    </li>
  );
  const standSub = (s: Stand) =>
    [STAND_TYPE[s.type], s.maxHeightCm != null ? `to ${(s.maxHeightCm / 100).toFixed(1)} m` : null, s.loadCapacityKg != null ? `holds ${s.loadCapacityKg} kg` : null, s.weightKg != null ? `${s.weightKg} kg` : null]
      .filter(Boolean)
      .join(' · ');
  return (
    <div className="stack">
      <input type="search" className="text-input" placeholder="Search: flag, 8×8, C-stand, combo…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search grip" />
      <div className="filter-grid">
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind of grip">
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Stand brand">
          <option value="">All brands</option>
          {STAND_BRANDS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      {active && (
        <ul className="row-list scroll">
          {lib.length + stands.length === 0 && <li className="row-empty">No match.</li>}
          {lib.map((i) => row(i.id, `lib:${i.id}`, () => onPlace({ library: i }), i.name, `${i.sizeCm.w} × ${i.sizeCm.d} cm`))}
          {stands.map((s) =>
            row(
              s.id,
              `stand:${s.id}`,
              () => onPlace({ stand: s }),
              <>
                {s.model} <span className="muted">{s.brand}</span>
              </>,
              standSub(s),
            ),
          )}
        </ul>
      )}
    </div>
  );
}
