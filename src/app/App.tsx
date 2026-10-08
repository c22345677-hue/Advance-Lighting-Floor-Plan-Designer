import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { Item } from '../model/types';
import { applyTemplate, getTemplate, type TemplateDefinition, type TemplateValues } from '../templates';
import { loadDoc, reducer, saveDoc, type PlanDoc } from './doc';
import { clampScale, PlanCanvas, zoomAt, type View } from './PlanCanvas';
import { TemplatePanel } from './TemplatePanel';
import { useCanvasColors } from './theme';

function sampleDoc(): PlanDoc {
  const t = getTemplate('interview');
  if (!t) return { setItems: [], items: [] };
  const r = applyTemplate(t, { interviewees: 1, cameras: 2 }, { origin: { x: 0, y: 0 } });
  return { setItems: r.setItems, items: r.shots.flatMap((s) => s.items) };
}

function fitView(doc: PlanDoc, width: number, height: number): View {
  const all = [...doc.setItems, ...doc.items];
  if (all.length === 0 || width === 0) return { x: width / 2, y: height / 2, scale: 0.8 };
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const i of all) {
    const r = Math.max(60, (i.sizeCm?.w ?? 0) / 2);
    minX = Math.min(minX, i.pos.x - r);
    maxX = Math.max(maxX, i.pos.x + r);
    minY = Math.min(minY, i.pos.y - r);
    maxY = Math.max(maxY, i.pos.y + r);
  }
  const scale = clampScale(Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.7);
  return {
    scale,
    x: width / 2 - ((minX + maxX) / 2) * scale,
    y: height / 2 - ((minY + maxY) / 2) * scale,
  };
}

/** Pick a round scale-bar length that draws between ~40 and ~160 px. */
function scaleBar(scale: number): { cm: number; px: number; label: string } {
  for (const cm of [10, 25, 50, 100, 200, 500, 1000, 2000, 5000]) {
    if (cm * scale >= 40) return { cm, px: cm * scale, label: cm >= 100 ? `${cm / 100} m` : `${cm} cm` };
  }
  return { cm: 10000, px: 10000 * scale, label: '100 m' };
}

const fmtM = (cm: number) => `${(cm / 100).toFixed(2)} m`;

export function App() {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: loadDoc() ?? sampleDoc(),
    future: [],
  }));
  const doc = history.present;
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const stageBox = useRef<HTMLDivElement>(null);
  const colors = useCanvasColors();

  useEffect(() => saveDoc(doc), [doc]);

  useLayoutEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!view && size.width > 0) setView(fitView(doc, size.width, size.height));
  }, [size, view, doc]);

  const selectedItem: Item | undefined = [...doc.setItems, ...doc.items].find((i) => i.id === selected);
  useEffect(() => {
    if (selected && !selectedItem) setSelected(null);
  }, [selected, selectedItem]);

  const deleteSelected = useCallback(() => {
    if (selected) dispatch({ type: 'delete', ids: [selected] });
    setSelected(null);
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if (e.key.toLowerCase() === 'r' && selected) {
        dispatch({ type: 'rotateBy', ids: [selected], deg: e.shiftKey ? -45 : 45 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, selected]);

  const addTemplate = (t: TemplateDefinition, values: TemplateValues) => {
    const v = view ?? { x: 0, y: 0, scale: 1 };
    const origin = { x: (size.width / 2 - v.x) / v.scale, y: (size.height / 2 - v.y) / v.scale };
    const r = applyTemplate(t, values, { origin });
    dispatch({ type: 'add', setItems: r.setItems, items: r.shots.flatMap((s) => s.items) });
    setPanelOpen(false);
  };

  const zoomBy = (f: number) => view && setView(zoomAt(view, f, { x: size.width / 2, y: size.height / 2 }));
  const bar = view ? scaleBar(view.scale) : null;
  const count = doc.setItems.length + doc.items.length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Floor Plan</span>
          <span className="brand-slate">Test build</span>
        </div>
        <div className="tools" role="toolbar" aria-label="Edit">
          <button id="undo" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button id="redo" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <span className="sep" aria-hidden="true" />
          <button
            id="rotate"
            onClick={() => selected && dispatch({ type: 'rotateBy', ids: [selected], deg: 45 })}
            disabled={!selected}
            title="Rotate 45° (R)"
          >
            Rotate 45°
          </button>
          <button id="delete" onClick={deleteSelected} disabled={!selected} title="Delete (Del)">
            Delete
          </button>
          <span className="sep" aria-hidden="true" />
          <button id="zoom-out" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
            −
          </button>
          <button id="fit" onClick={() => setView(fitView(doc, size.width, size.height))} title="Fit plan to screen">
            Fit
          </button>
          <button id="zoom-in" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            +
          </button>
          <span className="sep" aria-hidden="true" />
          <button
            id="clear"
            className={confirmClear ? 'danger' : ''}
            onClick={() => {
              if (confirmClear) {
                dispatch({ type: 'clear' });
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3000);
              }
            }}
            disabled={count === 0}
          >
            {confirmClear ? 'Tap again to clear' : 'Clear'}
          </button>
        </div>
        <button id="open-templates" className="primary templates-btn" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
          Templates
        </button>
      </header>

      <main className="workspace">
        <div className="stage" ref={stageBox}>
          {view && size.width > 0 && (
            <PlanCanvas
              width={size.width}
              height={size.height}
              view={view}
              onView={setView}
              doc={doc}
              dispatch={dispatch}
              selected={selected}
              onSelect={setSelected}
              colors={colors}
            />
          )}
          {count === 0 && (
            <div className="empty">
              <p>The plan is empty.</p>
              <button className="primary" onClick={() => setPanelOpen(true)}>
                Start from a template
              </button>
            </div>
          )}
        </div>

        <aside className={`panel ${panelOpen ? 'open' : ''}`} aria-label="Templates">
          <div className="panel-head">
            <h2>Templates</h2>
            <button id="close-templates" className="close" onClick={() => setPanelOpen(false)} aria-label="Close templates">
              ×
            </button>
          </div>
          <TemplatePanel onAdd={addTemplate} />
        </aside>
      </main>

      <footer className="statusbar">
        {bar && (
          <div className="scalebar" aria-label={`Scale bar: ${bar.label}`}>
            <span className="scalebar-line" style={{ width: `${bar.px}px` }} />
            <span>{bar.label}</span>
          </div>
        )}
        <span className="stat">Grid 50 cm</span>
        <span className="stat">{count} items</span>
        {selectedItem ? (
          <span className="stat selected-info">
            {selectedItem.label ?? selectedItem.kind} · x {fmtM(selectedItem.pos.x)} · y {fmtM(selectedItem.pos.y)} ·{' '}
            {Math.round(selectedItem.rotationDeg)}°
          </span>
        ) : (
          <span className="hint">Drag empty space to pan · scroll or pinch to zoom · tap an item to move or rotate it</span>
        )}
      </footer>
    </div>
  );
}
