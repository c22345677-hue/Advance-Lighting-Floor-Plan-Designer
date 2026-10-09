import { useMemo, useState } from 'react';
import { MODIFIERS, STANDS } from '../catalog/data';
import { fixtureById, modifierById, standById } from '../model/gear';
import { availability, setQty, type GearKind, type GearList } from '../model/gearList';
import { useConfirm } from './confirm';
import { FixtureSearch } from './FixtureSearch';

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
  const x = kind === 'fixture' ? fixtureById(id) : kind === 'modifier' ? modifierById(id) : standById(id);
  return x ? `${x.brand} ${x.model}` : id;
}

/** The job's gear: what is on the truck, and how many. Lists are saved and reusable across projects. */
export function GearListPanel({ lists, active, limit, usage, onSelect, onLimit, onSave, onCreate, onDelete }: Props) {
  const [adding, setAdding] = useState<GearKind | null>(null);
  const confirm = useConfirm();

  return (
    <div className="stack-lg">
      <p className="hint-text">
        List the gear you have on this job. With <b>Only use this list</b> on, the light, modifier and stand pickers only offer this
        gear, and show how many are left in the current scene.
      </p>

      <div className="field">
        <span className="field-label">List for this project</span>
        <span className="inline">
          <select value={active?.id ?? ''} onChange={(e) => onSelect(e.target.value || undefined)} aria-label="Gear list">
            <option value="">None</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={onCreate}>
            New list
          </button>
        </span>
      </div>

      {active && (
        <>
          <label className="field">
            <span className="field-label">List name</span>
            <input className="text-input" value={active.name} onChange={(e) => onSave({ ...active, name: e.target.value })} />
          </label>
          <label className="field toggle">
            <span className="field-label">Only use this list</span>
            <input type="checkbox" checked={limit} onChange={(e) => onLimit(e.target.checked)} />
          </label>

          {(['fixture', 'modifier', 'stand'] as GearKind[]).map((kind) => {
            const entries = active.entries.filter((e) => e.kind === kind);
            return (
              <section key={kind} className="section">
                <h3 className="section-title">
                  {KIND_LABEL[kind]}
                  <span className="count">{entries.reduce((n, e) => n + e.qty, 0)}</span>
                </h3>
                {entries.length > 0 && (
                  <ul className="row-list">
                    {entries.map((e) => {
                      const av = availability(active, usage, kind, e.id);
                      return (
                        <li key={e.id} className="row static">
                          <span className="row-main">
                            <span className="row-title">{gearName(kind, e.id)}</span>
                            {av && av.used > 0 && (
                              <span className={`row-sub ${av.left < 0 ? 'warn-text' : ''}`}>{av.used} used in this scene</span>
                            )}
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
                        </li>
                      );
                    })}
                  </ul>
                )}
                {adding === kind ? (
                  <GearPicker
                    kind={kind}
                    onPick={(id) =>
                      onSave(setQty(active, kind, id, (active.entries.find((x) => x.kind === kind && x.id === id)?.qty ?? 0) + 1))
                    }
                    onClose={() => setAdding(null)}
                  />
                ) : (
                  <button className="btn" onClick={() => setAdding(kind)}>
                    + Add {KIND_LABEL[kind].toLowerCase()}
                  </button>
                )}
              </section>
            );
          })}

          <div className="insp-actions">
            <button className="btn danger" onClick={async () =>
                (await confirm({ title: `Delete "${active.name}"?`, message: 'The list is removed from every project that uses it.', confirm: 'Delete list', danger: true })) &&
                onDelete(active.id)
              }>
              Delete this list
            </button>
          </div>
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
    <div className="picker">
      {kind === 'fixture' ? (
        <FixtureSearch onPick={(f) => onPick(f.id)} autoFocus />
      ) : (
        <div className="stack">
          <input
            type="search"
            className="text-input"
            autoFocus
            placeholder={kind === 'modifier' ? 'Search modifiers: dome, lantern…' : 'Search stands: C-stand, combo…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="row-list scroll">
              {results.map((x) => (
                <li key={x.id}>
                  <button className="row" onClick={() => onPick(x.id)}>
                    <span className="row-main">
                      <span className="row-title">
                        {x.model} <span className="muted">{x.brand}</span>
                      </span>
                      <span className="row-sub">{x.weightKg != null ? `${x.weightKg} kg` : '? kg'}</span>
                    </span>
                    <span className="row-meta accent">+ Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button className="btn" onClick={onClose}>
        Done adding
      </button>
    </div>
  );
}
