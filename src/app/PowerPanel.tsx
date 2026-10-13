// Power window: lights grouped by circuit with each circuit's load against its breaker.
import { itemName } from './PlanCanvas';
import { autoAssign, circuitLoads, circuitName, lightWatts, SAFE_LOAD, type Circuit } from '../model/power';
import type { Item } from '../model/types';

interface Props {
  items: Item[];
  volts: 230 | 120;
  breakerA: number;
  onVolts: (v: 230 | 120) => void;
  onBreaker: (a: number) => void;
  onCircuits: (patches: { id: string; circuit: string | undefined }[]) => void;
}

const STATUS_TEXT = { ok: 'OK', high: `Over ${SAFE_LOAD * 100}% — little headroom`, over: 'Over the breaker' };

export function PowerPanel({ items, volts, breakerA, onVolts, onBreaker, onCircuits }: Props) {
  const r = circuitLoads(items, volts, breakerA);
  const names = r.circuits.map((c) => c.name);
  const next = circuitName(names.length);
  const lightRow = (l: Item) => {
    const w = lightWatts(l);
    return (
      <li key={l.id} className="row static">
        <span className="row-main">
          <span className="row-title">
            {l.light?.unitId ?? ''} {itemName(l)}
          </span>
          <span className="row-sub">
            {w.w} W{w.estimated ? ' (typical, stand-in)' : ''}
          </span>
        </span>
        <select
          aria-label={`Circuit for ${l.light?.unitId ?? itemName(l)}`}
          value={l.light?.circuit ?? ''}
          onChange={(e) => onCircuits([{ id: l.id, circuit: e.target.value || undefined }])}
        >
          <option value="">No circuit</option>
          {names.map((n) => (
            <option key={n} value={n}>
              Circuit {n}
            </option>
          ))}
          <option value={next}>New: circuit {next}</option>
        </select>
      </li>
    );
  };
  const circuitBlock = (c: Circuit) => (
    <section key={c.name} className="section">
      <h3 className="section-title">
        Circuit {c.name} <span className={`count ${c.status}`}>{c.amps} A</span>
      </h3>
      <div className={`load-bar ${c.status}`} role="meter" aria-valuenow={Math.round(c.load * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Circuit ${c.name} load`}>
        <span style={{ width: `${Math.min(100, c.load * 100)}%` }} />
        <i style={{ left: `${SAFE_LOAD * 100}%` }} aria-hidden="true" />
      </div>
      <p className={`hint-text ${c.status !== 'ok' ? 'warn-text' : ''}`}>
        {c.watts} W · {Math.round(c.load * 100)}% of a {breakerA} A breaker · {STATUS_TEXT[c.status]}
        {c.estimated ? ` · ${c.estimated} stand-in${c.estimated > 1 ? 's' : ''} at typical power` : ''}
      </p>
      <ul className="row-list">{c.lights.map(lightRow)}</ul>
    </section>
  );
  return (
    <div className="stack-lg">
      <div className="btn-row">
        <div className="segmented" role="radiogroup" aria-label="Mains voltage">
          {([230, 120] as const).map((v) => (
            <button key={v} role="radio" aria-checked={volts === v} onClick={() => onVolts(v)}>
              {v} V
            </button>
          ))}
        </div>
        <label className="field inline">
          <span className="field-label">Breaker</span>
          <span className="input-unit">
            <input className="text-input num" type="number" aria-label="Breaker size" min={1} max={400} value={breakerA} onChange={(e) => onBreaker(Math.max(1, Number(e.target.value) || 1))} />
            <span className="unit">A</span>
          </span>
        </label>
        <button className="btn primary" onClick={() => onCircuits(autoAssign(items, volts, breakerA))} disabled={!items.some((i) => i.kind === 'light')}>
          Auto-assign circuits
        </button>
      </div>
      <p className="hint-text">
        Total {r.totalWatts} W · {r.totalAmps} A at {volts} V. Circuits are planned to stay under {SAFE_LOAD * 100}% of the breaker. Lights count at full
        power.
      </p>
      {r.circuits.map(circuitBlock)}
      {r.unassigned.length > 0 && (
        <section className="section">
          <h3 className="section-title">
            Not on a circuit <span className="count">{r.unassigned.length}</span>
          </h3>
          <ul className="row-list">{r.unassigned.map(lightRow)}</ul>
        </section>
      )}
      {!items.some((i) => i.kind === 'light') && <p className="hint-text">No lights in this scene yet.</p>}
    </div>
  );
}
