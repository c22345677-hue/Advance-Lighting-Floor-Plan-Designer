import { useEffect, useState } from 'react';

/** Canvas colours, read from the CSS tokens so the plan follows light/dark theme. */
export interface CanvasColors {
  canvas: string;
  gridMinor: string;
  gridMajor: string;
  origin: string;
  label: string;
  /** Backing behind name tags. */
  labelBg: string;
  person: string;
  camera: string;
  cameraFov: string;
  select: string;
  /** Light meter readings. */
  meter: string;
  chroma: string;
  set: string;
  /** Wall faces. */
  wallEdge: string;
  light: string;
  beam: string;
  grip: string;
  prop: string;
  warn: string;
  rotate: string;
}

const TOKENS: Record<keyof CanvasColors, string> = {
  canvas: '--canvas',
  gridMinor: '--grid-minor',
  gridMajor: '--grid-major',
  origin: '--grid-origin',
  label: '--plan-label',
  labelBg: '--plan-label-bg',
  person: '--plan-person',
  camera: '--plan-camera',
  cameraFov: '--plan-camera-fov',
  select: '--mode',
  meter: '--accent',
  chroma: '--plan-chroma',
  set: '--plan-set',
  wallEdge: '--plan-wall-edge',
  light: '--plan-light',
  beam: '--plan-beam',
  grip: '--plan-grip',
  prop: '--plan-prop',
  warn: '--danger',
  rotate: '--tool-rotate',
};

function read(): CanvasColors {
  const css = getComputedStyle(document.documentElement);
  const out = {} as CanvasColors;
  for (const [k, v] of Object.entries(TOKENS)) {
    out[k as keyof CanvasColors] = css.getPropertyValue(v).trim() || '#888';
  }
  return out;
}

/** Greyed version of a colour: same lightness, no hue, a bit closer to the canvas. */
export function greyOf(color: string, canvas = '#808080'): string {
  const parse = (s: string): [number, number, number, number] | null => {
    const hex = /^#([0-9a-f]{6})$/i.exec(s.trim());
    if (hex) {
      const n = parseInt(hex[1]!, 16);
      return [n >> 16, (n >> 8) & 255, n & 255, 1];
    }
    const m = /^rgba?\(([^)]+)\)$/i.exec(s.trim());
    if (!m) return null;
    const v = m[1]!.split(',').map((x) => parseFloat(x));
    return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1];
  };
  const c = parse(color);
  const bg = parse(canvas) ?? [128, 128, 128, 1];
  if (!c) return color;
  const y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const g = Math.round(y * 0.7 + (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) * 0.3);
  return c[3] < 1 ? `rgba(${g}, ${g}, ${g}, ${c[3]})` : `rgb(${g}, ${g}, ${g})`;
}

const parseRgb = (s: string): [number, number, number] | null => {
  const hex = /^#([0-9a-f]{6})$/i.exec(s.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s.trim());
  return m ? (m[1]!.split(',').slice(0, 3).map((x) => parseFloat(x)) as [number, number, number]) : null;
};

const toneCache = new Map<string, CanvasColors>();
/**
 * The plan colours shifted `depth` steps away from the canvas (lighter on a dark plan, darker on
 * a light one), for an item sitting on another item: a product on a table stays visible.
 */
export function tonedColors(c: CanvasColors, depth: number): CanvasColors {
  if (depth <= 0) return c;
  const key = `${c.canvas}|${c.prop}|${c.set}|${depth}`;
  let t = toneCache.get(key);
  if (!t) {
    const bg = parseRgb(c.canvas) ?? [128, 128, 128];
    const dark = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2] < 128;
    const k = Math.min(0.6, 0.24 * depth);
    const shift = (col: string) => {
      const v = parseRgb(col);
      if (!v) return col;
      const to = dark ? 255 : 0;
      const [r, g, b] = v.map((x) => Math.round(x + (to - x) * k));
      return `rgb(${r}, ${g}, ${b})`;
    };
    t = { ...c };
    for (const n of ['person', 'camera', 'chroma', 'set', 'light', 'grip', 'prop'] as const) t[n] = shift(c[n]);
    toneCache.set(key, t);
  }
  return t;
}

const mutedCache = new WeakMap<CanvasColors, CanvasColors>();
/** The plan colours greyed out, for items outside the category being edited. */
export function mutedColors(c: CanvasColors): CanvasColors {
  let m = mutedCache.get(c);
  if (!m) {
    m = { ...c };
    for (const k of ['person', 'camera', 'cameraFov', 'chroma', 'set', 'wallEdge', 'light', 'grip', 'prop'] as const) m[k] = greyOf(c[k], c.canvas);
    mutedCache.set(c, m);
  }
  return m;
}

export function useCanvasColors(): CanvasColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
    return () => {
      mq.removeEventListener('change', update);
      mo.disconnect();
    };
  }, []);
  return colors;
}
