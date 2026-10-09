import { useMemo, useState } from 'react';
import {
  buildEquipment,
  DEPTS,
  equipmentCsv,
  equipmentText,
  equipmentWarnings,
  exportLines,
  KITS,
  powerPlan,
  totalWeight,
  type Dept,
  type EquipmentLine,
  type EquipmentState,
} from '../model/equipment';
import type { GearList } from '../model/gearList';
import type { Project, SceneDoc } from '../model/project';

interface Props {
  project: Project;
  scene: SceneDoc;
  volts: number;
  gearList: GearList | null;
  onChange: (eq: EquipmentState) => void;
}

const STOCK_LABEL: Record<string, string> = {
  sandbag: 'sandbags',
  'stinger-10m': 'stingers',
  'power-strip': 'power strips',
  'distro-32a': '32 A distros',
  'distro-63a': '63 A distro',
  'apple-box-set': 'apple box sets',
  'c-stand': 'C-stands',
  'gaffer-tape': 'gaffer tape',
  'black-wrap': 'black wrap',
  ladder: 'ladders',
};

function sources(l: EquipmentLine): string {
  const parts: string[] = [];
  if (l.manual) parts.push('added by hand');
  else if (l.plan > 0) {
    const where = l.scenes.length > 1 ? ` (most in one scene: ${l.scenes.map((s) => `${s.name} ×${s.qty}`).join(', ')})` : '';
    parts.push(`plan ${l.plan}${where}`);
  }
  if (l.kit > 0) parts.push(`kits ${l.kit}`);
  if (l.edited) parts.push('quantity edited');
  return parts.join(' · ');
}

/** The job's equipment list: built from the plan, plus kits and hand-added items. */
export function EquipmentPanel({ project, scene, volts, gearList, onChange }: Props) {
  const eq = project.equipment ?? {};
  const [scope, setScope] = useState<'all' | 'scene'>('all');
  const [rentalOnly, setRentalOnly] = useState(true);
  const [withArt, setWithArt] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', dept: 'expendables' as Dept, qty: 1 });

  const ids = scope === 'scene' ? [scene.id] : undefined;
  const lines = useMemo(() => buildEquipment(project, ids), [project, scope, scene.id]);
  const warnings = equipmentWarnings(project, lines, gearList, ids);
  const weight = totalWeight(lines);
  const power = powerPlan(project, volts, ids);
  const exportOpts = { rentalOnly, includeNotRented: withArt };
  const exported = exportLines(lines, exportOpts);

  const setOverride = (key: string, patch: { qty?: number | undefined; owned?: boolean }) => {
    const cur = { ...eq.overrides?.[key], ...patch };
    const overrides = { ...eq.overrides };
    if (cur.qty == null && !cur.owned) delete overrides[key];
    else overrides[key] = cur;
    onChange({ ...eq, overrides });
  };
  const setKit = (id: string, times: number) => onChange({ ...eq, kits: { ...eq.kits, [id]: Math.max(0, times) } });
  const removeManual = (key: string) => onChange({ ...eq, manual: (eq.manual ?? []).filter((m) => `manual:${m.id}` !== key) });

  const fileName = `${project.name || 'equipment'}${scope === 'scene' ? ` - ${scene.name}` : ''}.csv`;
  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + equipmentCsv(lines, exportOpts)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyText = async () => {
    const t = equipmentText(lines, exportOpts);
    try {
      await navigator.clipboard.writeText(t);
      setText(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setText(t); // clipboard blocked: show it so it can be copied by hand
    }
  };
  return (
    <div className="stack-lg">
      <div className="eq-controls">
        <div className="segmented" role="radiogroup" aria-label="Scenes">
          <button role="radio" aria-checked={scope === 'all'} onClick={() => setScope('all')}>
            Whole project ({project.scenes.length} {project.scenes.length === 1 ? 'scene' : 'scenes'})
          </button>
          <button role="radio" aria-checked={scope === 'scene'} onClick={() => setScope('scene')}>
            {scene.name} only
          </button>
        </div>
        <label className="field toggle">
          <span className="field-label">Accessory rules</span>
          <input type="checkbox" checked={eq.rules ?? true} onChange={(e) => onChange({ ...eq, rules: e.target.checked })} />
        </label>
      </div>
      <p className="hint-text">
        Gear is reused between scenes, so each quantity is the most any one scene needs. Accessory rules add a stinger per light, a stand
        and 2 sandbags per light on a stand, and stands with sandbags for flags and frames.
      </p>

      <div className="eq-summary">
        <div className="stat-card">
          <span className="stat-label">Items</span>
          <b>{lines.reduce((n, l) => n + l.qty, 0)}</b>
          <span className="stat-sub">{lines.length} lines</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Known weight</span>
          <b>{weight.kg} kg</b>
          <span className="stat-sub">{weight.unknown ? `${weight.unknown} items without a weight` : 'all items weighed'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Peak power</span>
          <b>{(power.peakW / 1000).toFixed(2)} kW</b>
          <span className="stat-sub">
            {power.amps.toFixed(1)} A @ {volts} V{power.peakScene && scope === 'all' ? ` · ${power.peakScene}` : ''}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Generator</span>
          <b>{power.generatorKva ? `≥ ${power.generatorKva} kVA` : '—'}</b>
          <span className="stat-sub">peak + 25 % headroom</span>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="warn-box">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {DEPTS.map((d) => {
        const ls = lines.filter((l) => l.dept === d.id);
        if (!ls.length) return null;
        return (
          <section key={d.id} className="section">
            <h3 className="section-title">
              {d.label}
              <span className="count">{ls.reduce((n, l) => n + l.qty, 0)}</span>
            </h3>
            <ul className="row-list">
              {ls.map((l) => (
                <li key={l.key} className={`row static eq-row ${l.owned ? 'owned' : ''}`}>
                  <input
                    className="text-input num qty"
                    type="number"
                    min={0}
                    aria-label={`Quantity of ${l.name}`}
                    value={l.qty}
                    onChange={(e) => {
                      const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                      if (l.manual) onChange({ ...eq, manual: (eq.manual ?? []).map((m) => (`manual:${m.id}` === l.key ? { ...m, qty: v } : m)) });
                      else setOverride(l.key, { qty: v === l.plan + l.kit ? undefined : v });
                    }}
                  />
                  <span className="row-main">
                    <span className="row-title">
                      {l.name}
                      {l.detail && <span className="muted"> · {l.detail}</span>}
                      {l.notRented && <span className="chip dim">not rented</span>}
                    </span>
                    <span className="row-sub">{sources(l)}</span>
                  </span>
                  {l.edited && (
                    <button className="btn small-btn" onClick={() => setOverride(l.key, { qty: undefined })} title="Back to the planned quantity">
                      Undo edit
                    </button>
                  )}
                  {l.manual ? (
                    <button className="btn small-btn" onClick={() => removeManual(l.key)}>
                      Remove
                    </button>
                  ) : (
                    <label className="owned-toggle" title="Owned gear drops off the rental list">
                      <input type="checkbox" checked={l.owned} onChange={(e) => setOverride(l.key, { owned: e.target.checked })} />
                      Owned
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {lines.length === 0 && <p className="hint-text">Nothing yet. Place lights, grip and camera gear on the plan, or add a kit below.</p>}

      <section className="section">
        <h3 className="section-title">Kits</h3>
        <div className="kit-grid">
          {KITS.map((k) => {
            const times = eq.kits?.[k.id] ?? 0;
            return (
              <div key={k.id} className={`kit-card ${times ? 'on' : ''}`}>
                <b>{k.name}</b>
                <span className="hint-text">{k.contents.map(([id, n]) => `${n} ${STOCK_LABEL[id] ?? id}`).join(', ')}</span>
                <div className="btn-row">
                  <button id={`kit-${k.id}`} className="btn" onClick={() => setKit(k.id, times + 1)}>
                    + Add
                  </button>
                  {times > 0 && (
                    <>
                      <span className="kit-count">×{times}</span>
                      <button className="btn" onClick={() => setKit(k.id, times - 1)}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Add an item by hand</h3>
        <form
          className="add-line"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.name.trim()) return;
            onChange({ ...eq, manual: [...(eq.manual ?? []), { id: crypto.randomUUID(), ...newItem, name: newItem.name.trim() }] });
            setNewItem({ ...newItem, name: '', qty: 1 });
          }}
        >
          <input
            className="text-input"
            placeholder="e.g. Clothespins (bag)"
            aria-label="Item name"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />
          <select value={newItem.dept} onChange={(e) => setNewItem({ ...newItem, dept: e.target.value as Dept })} aria-label="Department">
            {DEPTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <input
            className="text-input num"
            type="number"
            min={1}
            aria-label="Quantity"
            value={newItem.qty}
            onChange={(e) => setNewItem({ ...newItem, qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
          />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      </section>

      <section className="section">
        <h3 className="section-title">Export</h3>
        <label className="field toggle">
          <span className="field-label">Leave out owned gear (rental list)</span>
          <input type="checkbox" checked={rentalOnly} onChange={(e) => setRentalOnly(e.target.checked)} />
        </label>
        <label className="field toggle">
          <span className="field-label">Include art / set (walls, doors…)</span>
          <input type="checkbox" checked={withArt} onChange={(e) => setWithArt(e.target.checked)} />
        </label>
        <div className="btn-row">
          <button id="eq-csv" className="btn primary" onClick={downloadCsv} disabled={!exported.length}>
            Download CSV ({exported.length} lines)
          </button>
          <button id="eq-copy" className="btn" onClick={copyText} disabled={!exported.length}>
            {copied ? 'Copied' : 'Copy as text'}
          </button>
        </div>
        {text && (
          <>
            <p className="hint-text">Copying is blocked here. Select the text below and copy it.</p>
            <textarea className="text-input eq-text" readOnly value={text} rows={10} onFocus={(e) => e.target.select()} />
          </>
        )}
      </section>
    </div>
  );
}
