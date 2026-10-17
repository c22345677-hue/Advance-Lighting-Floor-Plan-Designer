import { describe, expect, it } from 'vitest';
import { placeBar } from './barPlacement';

const bounds = { x: 8, y: 56, w: 1000, h: 700 };
const bar = { w: 300, h: 44 };
const sel = { x: 450, y: 400, w: 40, h: 40 };

describe('selection bar placement', () => {
  it('opens just above the selection when nothing is there', () => {
    const p = placeBar(sel, bar, [], bounds);
    expect(p.y + bar.h).toBeLessThanOrEqual(sel.y);
    expect(sel.y - (p.y + bar.h)).toBeLessThan(20);
  });

  it('moves to another side when something sits above', () => {
    const blocker = { x: 300, y: 330, w: 340, h: 60 };
    const p = placeBar(sel, bar, [blocker], bounds);
    const box = { ...p, ...bar };
    const hits = box.x < blocker.x + blocker.w && box.x + box.w > blocker.x && box.y < blocker.y + blocker.h && box.y + box.h > blocker.y;
    expect(hits).toBe(false);
  });

  it('stays near the selection even when every nearby spot is busy', () => {
    const wall = { x: 0, y: 0, w: 2000, h: 2000 };
    const p = placeBar(sel, bar, [wall], bounds);
    expect(Math.abs(p.y + bar.h / 2 - (sel.y + sel.h / 2))).toBeLessThan(200);
  });

  it('near the top edge it opens below instead of off screen', () => {
    const top = { x: 450, y: 60, w: 40, h: 40 };
    const p = placeBar(top, bar, [], bounds);
    expect(p.y).toBeGreaterThanOrEqual(56);
    expect(p.y).toBeGreaterThan(top.y);
  });
});
