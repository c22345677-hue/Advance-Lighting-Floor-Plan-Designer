// View controls: show/hide and lock each category on the plan, and the light beams.
import { useEffect, useRef, useState } from 'react';
import { EDIT_MODES, type EditMode } from '../model/project';
import { IconLayers } from './icons';
import type { LayerState } from './PlanCanvas';

interface Props {
  layers: Partial<Record<EditMode, LayerState>>;
  beams: boolean;
  onLayers: (l: Partial<Record<EditMode, LayerState>>) => void;
  onBeams: (on: boolean) => void;
}

export function LayersMenu({ layers, beams, onLayers, onBeams }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', out);
    return () => window.removeEventListener('pointerdown', out);
  }, [open]);
  const set = (m: EditMode, patch: LayerState) => onLayers({ ...layers, [m]: { ...layers[m], ...patch } });
  const changed = beams === false || Object.values(layers).some((l) => l?.hidden || l?.locked);
  return (
    <div className="layers" ref={box}>
      <button className={`icon-btn ${changed ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label="Layers" title="Show, hide or lock categories">
        <IconLayers />
      </button>
      {open && (
        <div className="layers-pop" role="dialog" aria-label="Layers">
          <table>
            <tbody>
              {EDIT_MODES.map((m) => (
                <tr key={m.id}>
                  <td>{m.label}</td>
                  <td>
                    <label>
                      <input type="checkbox" checked={!layers[m.id]?.hidden} onChange={(e) => set(m.id, { hidden: !e.target.checked })} /> Show
                    </label>
                  </td>
                  <td>
                    <label>
                      <input type="checkbox" checked={!!layers[m.id]?.locked} onChange={(e) => set(m.id, { locked: e.target.checked })} /> Lock
                    </label>
                  </td>
                </tr>
              ))}
              <tr>
                <td>Beams</td>
                <td>
                  <label>
                    <input type="checkbox" checked={beams} onChange={(e) => onBeams(e.target.checked)} /> Show
                  </label>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="hint-text">Hidden layers still light the scene and cast shadows; they're just not drawn.</p>
        </div>
      )}
    </div>
  );
}
