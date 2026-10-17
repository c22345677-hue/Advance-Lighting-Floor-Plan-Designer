// Where the selection bar opens: close around the selection, on the side that covers the least
// of the plan (other items and their name tags). It only ever tries spots a short way from the
// selection, never the other side of the screen.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** How much covering it matters (1 = an item; text people read counts more). */
  weight?: number;
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Keeps a box of `size` inside `bounds`. */
export function clampInto(p: { x: number; y: number }, size: { w: number; h: number }, bounds: Box) {
  return {
    x: Math.min(bounds.x + bounds.w - size.w, Math.max(bounds.x, p.x)),
    y: Math.min(bounds.y + bounds.h - size.h, Math.max(bounds.y, p.y)),
  };
}

/**
 * Top-left corner for the bar. `sel` is the selection's box on screen (with its own name tags
 * in `obstacles` if they should stay visible), `bounds` the area the bar may use.
 */
export function placeBar(sel: Box, bar: { w: number; h: number }, obstacles: Box[], bounds: Box, gap = 12): { x: number; y: number } {
  const cx = sel.x + sel.w / 2;
  const cy = sel.y + sel.h / 2;
  const above = sel.y - gap - bar.h;
  const below = sel.y + sel.h + gap;
  const left = sel.x - gap - bar.w;
  const right = sel.x + sel.w + gap;
  // In order of preference: above, below (past the name tag), the sides, then shifted a little.
  const shift = bar.w / 3;
  const candidates = [
    { x: cx - bar.w / 2, y: above },
    { x: cx - bar.w / 2, y: below + 22 },
    { x: right, y: cy - bar.h / 2 },
    { x: left, y: cy - bar.h / 2 },
    { x: cx - bar.w / 2 + shift, y: above },
    { x: cx - bar.w / 2 - shift, y: above },
    { x: cx - bar.w / 2 + shift, y: below + 22 },
    { x: cx - bar.w / 2 - shift, y: below + 22 },
    { x: cx - bar.w / 2, y: above - 30 },
    { x: cx - bar.w / 2, y: below + 52 },
    { x: right, y: above },
    { x: left, y: above },
    { x: right, y: below },
    { x: left, y: below },
    { x: cx - bar.w / 2, y: above - 70 },
    { x: cx - bar.w / 2, y: below + 92 },
  ];
  // How far the bar may end up from the selection (after being kept on screen).
  const maxDist = 140;
  let best: { p: { x: number; y: number }; score: number } | null = null;
  candidates.forEach((c, rank) => {
    const p = clampInto(c, bar, bounds);
    const box = { ...p, ...bar };
    const gapX = Math.max(0, sel.x - (p.x + bar.w), p.x - (sel.x + sel.w));
    const gapY = Math.max(0, sel.y - (p.y + bar.h), p.y - (sel.y + sel.h));
    const dist = Math.hypot(gapX, gapY);
    if (dist > maxDist) return;
    let score = rank * 40 + overlap(box, sel) * 20 + Math.hypot(p.x - c.x, p.y - c.y) * 2;
    for (const o of obstacles) score += overlap(box, o) * (o.weight ?? 1);
    if (!best || score < best.score) best = { p, score };
  });
  return (best as { p: { x: number; y: number } } | null)?.p ?? clampInto({ x: cx - bar.w / 2, y: above }, bar, bounds);
}
