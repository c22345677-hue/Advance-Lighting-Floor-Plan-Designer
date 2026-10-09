import { useEffect, useState } from 'react';

/** Canvas colours, read from the CSS tokens so the plan follows light/dark theme. */
export interface CanvasColors {
  canvas: string;
  gridMinor: string;
  gridMajor: string;
  origin: string;
  label: string;
  person: string;
  camera: string;
  cameraFov: string;
  select: string;
  chroma: string;
  set: string;
  light: string;
  beam: string;
  grip: string;
  prop: string;
  warn: string;
}

const TOKENS: Record<keyof CanvasColors, string> = {
  canvas: '--canvas',
  gridMinor: '--grid-minor',
  gridMajor: '--grid-major',
  origin: '--grid-origin',
  label: '--plan-label',
  person: '--plan-person',
  camera: '--plan-camera',
  cameraFov: '--plan-camera-fov',
  select: '--accent',
  chroma: '--plan-chroma',
  set: '--plan-set',
  light: '--plan-light',
  beam: '--plan-beam',
  grip: '--plan-grip',
  prop: '--plan-prop',
  warn: '--danger',
};

function read(): CanvasColors {
  const css = getComputedStyle(document.documentElement);
  const out = {} as CanvasColors;
  for (const [k, v] of Object.entries(TOKENS)) {
    out[k as keyof CanvasColors] = css.getPropertyValue(v).trim() || '#888';
  }
  return out;
}

export function useCanvasColors(): CanvasColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      mo.disconnect();
    };
  }, []);
  return colors;
}
