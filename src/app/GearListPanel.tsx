import { useMemo, useState } from 'react';
import { MODIFIERS, STANDS } from '../catalog/data';
import { fixtureById, modifierById, standById } from '../model/gear';
import { availability, setQty, type GearKind, type GearList } from '../model/gearList';
import { FixtureSearch } from './LibraryPanel';

interface Props {
  lists: GearList[];
  active: GearList | null;
  limit: boolean;
  usage: Map<string, number>;
  onSelect: (id: string | undefined) => void;
  onLimit: (on: boolean) => void;
  onSave: (list: GearList) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

const KIND_LABEL: Record<GearKind, string> = { fixture: 'Lights', modifier: 'Modifiers', stand: 'Stands' };

function gearName(kind: GearKind, id: string): string {
  if (kind === 'fixture') {
    const f = fixtureById(id);
    return f ? `${f.brand} ${f.model}` : id;
  }
  if (kind === 'modifier') {
    const m = modifierById(id);
    return m ? `${m.brand} ${m.model}` : id;
  }
  const s = standById(id);
  return s ? `${s.brand} ${s.model}` : id;
}

/** The job's gear: what is on the truck, and how many. */
export function GearListPanel({ lists, active, limit, usage, onSelect, onLimit, onSave, onCreate, onDelete }: Props) {
  const [adding, setAdding] = useState<GearKind | null>(null);

  return (
    <div className="panel-body">
      <p className="muted small">
        Make a list of the gear on this job. Turn on <b>Only use this list</b> and the library shows only that gear, in the quantities you set.
      </p>
      <div className="field">
        <select value={active?.id ?? ''} onChange={(e) => onSelect(e.target.value || undefined)} aria-label="Gear list">
          <option value="">No gear list</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button onClick={onCreate}>New</button>
      </div>

      {active && (
        <>
          <label className="field">
            <span className="field-label">Name</span>
            <input className="text-input" value={active.name} onChange={(e) => onSave({ ...active, name: e.target.value })} />
          </label>
          <label className="field toggle">
            <span className="field-label">Only use this list</span>
            <input type="checkbox" checked={limit} onChange={(e) => onLimit(e.target.checked)} />
          </label>

          {(['fixture', 'modifier', 'stand'] as GearKind[]).map((kind) => {
            const entries = active.entries.filter((e) => e.kind === kind);
            return (
              <section key={kind} className="insp-section">
                <h4>
                  {KIND_LABEL[kind]} ({entries.reduce((n, e) => n + e.qty, 0)})
                </h4>
                {entries.map((e) => {
                  const av = availability(active, usage, kind, e.id);
                  return (
                    <div key={e.id} className="gear-row">
                      <span className="gear-name">
                        {gearName(kind, e.id)}
                        {av && av.used > 0 && <span className={`muted small ${av.left < 0 ? 'warn' : ''}`}> · {av.used} used here</span>}
                      </span>
                      <span className="stepper">
                        <button aria-label="Fewer" onClick={() => onSave(setQty(active, kind, e.id, e.qty - 1))}>
                          −
                        </button>
                        <output>{e.qty}</output>
                        <button aria-label="More" onClick={() => onSave(setQty(active, kind, e.id, e.qty + 1))}>
                          +
                        </button>
                      </span>
                    </div>
                  );
                })}
                {adding === kind ? (
                  <GearPicker
                    kind={kind}
                    onPick={(id) => onSave(setQty(active, kind, id, (active.entries.find((x) => x.kind === kind && x.id === id)?.qty ?? 0) + 1))}
                    onClose={() => setAdding(null)}
                  />
                ) : (
                  <button onClick={() => setAdding(kind)}>+ Add {KIND_LABEL[kind].toLowerCase()}</button>
                )}
              </section>
            );
          })}

          <button
            className="danger"
            onClick={() => window.confirm(`Delete the gear list "${active.name}"?`) && onDelete(active.id)}
          >
            Delete this list
          </button>
        </>
      )}
    </div>
  );
}

function GearPicker({ kind, onPick, onClose }: { kind: GearKind; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const pool = kind === 'modifier' ? MODIFIERS : STANDS;
    return pool.filter((x) => words.every((w) => `${x.brand} ${x.model}`.toLowerCase().includes(w))).slice(0, 40);
  }, [q, kind]);

  return (
    <div className="fixture-search">
      {kind === 'fixture' ? (
        <FixtureSearch onPick={(f) => onPick(f.id)} compact />
      ) : (
        <>
          <input
            type="search"
            className="text-input"
            placeholder={kind === 'modifier' ? 'Search modifiers: dome, lantern…' : 'Search stands: C-stand, combo…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="fixture-list compact">
              {results.map((x) => (
                <li key={x.id}>
                  <button className="fixture-row" onClick={() => onPick(x.id)}>
                    <span className="fixture-name">
                      <b>{x.model}</b> <span className="muted">{x.brand}</span>
                    </span>
                    <span className="fixture-specs">{x.weightKg != null ? `${x.weightKg} kg` : '? kg'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button onClick={onClose}>Done adding</button>
    </div>
  );
}
