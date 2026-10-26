// Notes on the plan: text, arrows and freehand drawings. Colours, how big a text note's box is,
// and the shapes arrows come in.
import type { Item, Vec2 } from './types';

/** Note colours offered; the first is what a new note starts with. */
export const NOTE_COLORS = ['#3e8ef7', '#f0a23b', '#ffffff', '#1d1f22', '#e5484d', '#2fae55', '#f5d90a', '#a855f7'];
export const NOTE_DEFAULT_COLOR = NOTE_COLORS[0]!;

export const noteColor = (item: Item) => item.note?.color ?? NOTE_DEFAULT_COLOR;

/** Room round the text inside a text note's box, cm. */
export const NOTE_PAD_CM = 8;

/**
 * Lines a text note wraps to in a box `w` wide (a close estimate of the plan's condensed font,
 * about half the text size per character; the drawing measures it exactly).
 */
export function noteLines(text: string, w: number, size: number): number {
  const perLine = Math.max(1, Math.floor((w - NOTE_PAD_CM * 2) / (size * 0.5)));
  let lines = 0;
  for (const para of (text || 'Note').split('\n')) {
    let len = 0;
    let n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const add = len ? word.length + 1 : word.length;
      if (len + add > perLine && len > 0) {
        n += Math.ceil(word.length / perLine);
        len = word.length % perLine;
      } else len += add;
    }
    lines += n;
  }
  return lines;
}

/** Height of a text note's box: it grows with the text, cm. */
export const noteTextHeight = (item: Item, w: number): number => {
  const size = item.note?.fontSize ?? 24;
  return noteLines(item.note?.text ?? '', w, size) * size * 1.15 + NOTE_PAD_CM * 2;
};

export type ArrowStyle = 'straight' | 'bend35-right' | 'bend35-left' | 'bend75-right' | 'bend75-left' | 'curve-right' | 'curve-left' | 'double';

export const ARROW_STYLES: { id: ArrowStyle; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'bend35-right', label: 'Bend 35° right' },
  { id: 'bend35-left', label: 'Bend 35° left' },
  { id: 'bend75-right', label: 'Bend 75° right' },
  { id: 'bend75-left', label: 'Bend 75° left' },
  { id: 'curve-right', label: 'Curve right' },
  { id: 'curve-left', label: 'Curve left' },
  { id: 'double', label: 'Double-headed' },
];

/**
 * The arrow's line in its own frame (tail at the bottom, pointing up), `d` long: a straight
 * shaft, a shaft that bends 35° or 75° partway, or a curve.
 */
export function arrowPoints(style: ArrowStyle | undefined, d: number): { points: Vec2[]; curved: boolean } {
  const tail = { x: 0, y: d / 2 };
  const bend = /^bend(\d+)-(left|right)$/.exec(style ?? '');
  if (bend) {
    const deg = (Number(bend[1]) * Math.PI) / 180;
    const side = bend[2] === 'right' ? 1 : -1;
    const elbow = { x: 0, y: d / 2 - d * 0.55 };
    const rest = d * 0.45;
    return { points: [tail, elbow, { x: elbow.x + side * Math.sin(deg) * rest, y: elbow.y - Math.cos(deg) * rest }], curved: false };
  }
  const curve = /^curve-(left|right)$/.exec(style ?? '');
  if (curve) {
    const side = curve[1] === 'right' ? 1 : -1;
    return { points: [tail, { x: side * d * 0.22, y: 0 }, { x: 0, y: -d / 2 }], curved: true };
  }
  return { points: [tail, { x: 0, y: -d / 2 }], curved: false };
}

/** Pen widths for drawing on the plan, in screen pixels at the zoom it's drawn at. */
export const PEN_WIDTHS = [
  { id: 'fine', label: 'Fine', px: 2 },
  { id: 'medium', label: 'Medium', px: 4 },
  { id: 'bold', label: 'Bold', px: 8 },
] as const;

/** A freehand stroke drawn on the plan (world points) as a note: centred on its bounds, points relative. */
export function drawingNote(points: Vec2[], color: string, strokeCm: number): Pick<Item, 'pos' | 'sizeCm' | 'note'> {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pos = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  return {
    pos,
    sizeCm: { w: Math.max(strokeCm, x1 - x0) + strokeCm, d: Math.max(strokeCm, y1 - y0) + strokeCm },
    note: { text: '', color, strokeCm, points: points.flatMap((p) => [p.x - pos.x, p.y - pos.y]) },
  };
}
