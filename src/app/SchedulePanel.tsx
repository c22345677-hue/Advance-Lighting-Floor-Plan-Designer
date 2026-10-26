// Lighting schedule: one sheet with the plan, every light and how it's set, the cameras, the
// light on each person and the power plan. Prints (or saves as PDF) on its own.
import { lightColor, rgbCss } from '../model/color';
import { bounceId, DAYLIGHT_ID, meterReadings, type CameraSettings } from '../model/exposure';
import type { Sun } from '../model/sun';
import { itemFixture, itemModifiers, standById } from '../model/gear';
import { DEFAULT_LENS_MM } from '../model/lens';
import { circuitLoads, lightWatts } from '../model/power';
import { lightSource } from '../model/shadows';
import type { Actor, Item } from '../model/types';
import { displayLabel, itemName, meterName } from './PlanCanvas';

interface Props {
  projectName: string;
  sceneName: string;
  items: Item[];
  actors: Actor[];
  planImage: string | null;
  camera: CameraSettings;
  volts: number;
  breakerA: number;
  sun?: Sun;
}

const actorName = (actors: Actor[], id: string | undefined) => actors.find((a) => a.id === id)?.name;

export function SchedulePanel(p: Props) {
  const lights = p.items.filter((i) => i.kind === 'light').sort((a, b) => (a.light?.unitId ?? '').localeCompare(b.light?.unitId ?? '', undefined, { numeric: true }));
  const cams = p.items.filter((i) => i.kind === 'camera');
  const readings = meterReadings(p.items, p.camera, p.sun);
  const power = circuitLoads(p.items, p.volts, p.breakerA);
  const who = (id: string) => {
    if (id === DAYLIGHT_ID) return 'daylight';
    if (id.includes('~mirror~')) return 'mirror';
    if (id.endsWith('~bounce')) {
      const board = p.items.find((x) => bounceId(x.id) === id);
      return `bounce off ${board ? displayLabel(board, p.actors) || itemName(board) : 'a board'}`;
    }
    const i = p.items.find((x) => x.id === id);
    return i ? displayLabel(i, p.actors) || itemName(i) : '?';
  };
  return (
    <div className="schedule print-area">
      <header className="schedule-head">
        <h2>{p.projectName || 'Untitled project'}</h2>
        <p>
          {p.sceneName} · lighting schedule · {new Date().toLocaleDateString()}
        </p>
      </header>
      {p.planImage && <img className="schedule-plan" src={p.planImage} alt={`Plan of ${p.sceneName}`} />}

      <h3 className="section-title">Lights ({lights.length})</h3>
      {lights.length === 0 ? (
        <p className="hint-text">No lights in this scene.</p>
      ) : (
        <div className="table-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Fixture</th>
                <th>Modifiers</th>
                <th>Colour</th>
                <th>Stand · height</th>
                <th>Aimed at</th>
                <th>Shadows</th>
                <th>Circuit</th>
                <th>W</th>
              </tr>
            </thead>
            <tbody>
              {lights.map((l) => {
                const f = itemFixture(l);
                const c = lightColor(l);
                const src = lightSource(l, p.items);
                const w = lightWatts(l);
                return (
                  <tr key={l.id}>
                    <td>{l.light?.unitId}</td>
                    <td>{f ? `${f.brand} ${f.model}` : `${itemName(l)} (stand-in)`}</td>
                    <td>{itemModifiers(l).map((m) => m.model).join(', ') || '—'}</td>
                    <td>
                      <span className="swatch" style={{ background: rgbCss(c.rgb) }} aria-hidden="true" /> {c.label}
                    </td>
                    <td>
                      {standById(l.light?.standId)?.model ?? '—'} · {src?.heightCm ?? '?'} cm
                    </td>
                    <td>{actorName(p.actors, l.light?.aimActorId) ?? '—'}</td>
                    <td>{src?.hardness ?? '—'}</td>
                    <td>{l.light?.circuit ?? '—'}</td>
                    <td>
                      {w.w}
                      {w.estimated ? '*' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cams.length > 0 && (
        <>
          <h3 className="section-title">Cameras</h3>
          <ul className="schedule-list">
            {cams.map((c) => {
              const cam = c.camera ?? {};
              const framing = cam.twoShot
                ? `two shot: ${cam.twoShot.map((id) => actorName(p.actors, id) ?? '?').join(' & ')}`
                : cam.focusActorId
                  ? `on ${actorName(p.actors, cam.focusActorId) ?? '?'}`
                  : 'free';
              return (
                <li key={c.id}>
                  <strong>{displayLabel(c, p.actors) || itemName(c)}</strong> · {cam.focalMm ?? DEFAULT_LENS_MM} mm
                  {cam.zoom ? ` (${cam.zoom.minMm}–${cam.zoom.maxMm} zoom)` : ''} · {framing}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {readings.length > 0 && (
        <>
          <h3 className="section-title">
            Light meters (approximate)
          </h3>
          <ul className="schedule-list">
            {readings.map((r) => (
              <li key={r.meterId}>
                <strong>{meterName(p.items.find((i) => i.id === r.meterId)!, p.items, p.actors)}</strong> · {r.contributions.length ? `≈ ${r.tStopLabel} at ISO ${r.config.iso}, ${r.config.fps} fps, ${r.config.shutterDeg}° · ≈ ${r.lux} lux (${r.footCandles} fc)${r.ratio ? ` · key:fill ${r.ratio}` : ''}${r.keyId ? ` · key ${who(r.keyId)}` : ''}` : 'no light'}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="section-title">
        Power · {power.totalWatts} W · {power.totalAmps} A at {p.volts} V
      </h3>
      <ul className="schedule-list">
        {power.circuits.map((c) => (
          <li key={c.name} className={c.status !== 'ok' ? 'warn-text' : ''}>
            <strong>Circuit {c.name}</strong> · {c.watts} W · {c.amps} A · {Math.round(c.load * 100)}% of {p.breakerA} A · {c.lights.map((l) => l.light?.unitId).join(', ')}
          </li>
        ))}
        {power.unassigned.length > 0 && <li>Not on a circuit: {power.unassigned.map((l) => l.light?.unitId).join(', ')}</li>}
      </ul>
      <p className="hint-text">* typical power for a stand-in light. Light readings are planning estimates.</p>
    </div>
  );
}
