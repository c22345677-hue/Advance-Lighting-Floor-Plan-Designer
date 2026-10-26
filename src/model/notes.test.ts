import { describe, expect, it } from 'vitest';
import { arrowPoints, drawingFromStrokes, drawingNote, drawingStrokes, noteLines, noteTextHeight, NOTE_COLORS, NOTE_DEFAULT_COLOR, scaleDrawing, strokesTouch } from './notes';
import type { Item } from './types';

describe('notes', () => {
  it('a new note starts in the first colour offered', () => {
    expect(NOTE_DEFAULT_COLOR).toBe(NOTE_COLORS[0]);
  });
  it('a text note box grows as the text wraps to more lines', () => {
    const note = (text: string): Item => ({ id: 'n', kind: 'note', catalogId: 'generic.note.text', pos: { x: 0, y: 0 }, rotationDeg: 0, note: { text } });
    expect(noteLines('Short', 200, 24)).toBe(1);
    const long = 'Key light from camera left, keep it off the window. Second sentence wraps here.';
    expect(noteLines(long, 200, 24)).toBeGreaterThan(2);
    expect(noteTextHeight(note(long), 200)).toBeGreaterThan(noteTextHeight(note('Short'), 200));
  });
  it('bent arrows turn by their angle partway along', () => {
    const { points } = arrowPoints('bend75-right', 200);
    const [elbow, head] = points.slice(-2);
    const turn = (Math.atan2(head!.x - elbow!.x, -(head!.y - elbow!.y)) * 180) / Math.PI;
    expect(turn).toBeCloseTo(75);
    expect(arrowPoints('bend35-left', 200).points.at(-1)!.x).toBeLessThan(0);
  });
  it('a drawn stroke becomes a note centred on it', () => {
    const n = drawingNote([{ x: 0, y: 0 }, { x: 100, y: 50 }], '#fff', 4);
    expect(n.pos).toEqual({ x: 50, y: 25 });
    expect(n.note!.strokes).toEqual([[-50, -25, 50, 25]]);
  });
});

describe('drawings', () => {
  it('strokes that cross or touch are found; apart ones are not', () => {
    const a = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(strokesTouch(a, [{ x: 50, y: -20 }, { x: 50, y: 20 }], 1)).toBe(true);
    expect(strokesTouch(a, [{ x: 50, y: 3 }, { x: 50, y: 30 }], 4)).toBe(true);
    expect(strokesTouch(a, [{ x: 50, y: 30 }, { x: 50, y: 60 }], 4)).toBe(false);
  });
  it('joined strokes keep their places; scaling grows them about the centre', () => {
    const joined = drawingFromStrokes([[{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: -20 }, { x: 50, y: 20 }]], '#fff', 4);
    const item: Item = { id: 'd', kind: 'note', catalogId: 'generic.note.draw', ...joined };
    expect(drawingStrokes(item)[1]).toEqual([{ x: 50, y: -20 }, { x: 50, y: 20 }]);
    const big = { ...item, ...scaleDrawing(item, 2) };
    expect(drawingStrokes(big)[0]).toEqual([{ x: -50, y: 0 }, { x: 150, y: 0 }]);
  });
});
