// Items that can be scaled with the Scale tool: drawings (about their middle) and bounce boards
// and mirrors (their width), arrows (their length).
import { libraryItem } from '../library/items';
import { itemLook } from './gear';
import { scaleDrawing } from './notes';
import type { Item } from './types';

/** Widths a board or mirror can be set to, cm. */
export const BOARD_WIDTH_CM: [number, number] = [30, 300];

const isArrow = (i: Item) => libraryItem(i.catalogId)?.shape === 'note-arrow';

/** Lengths an arrow can be scaled to, cm. */
export const ARROW_LENGTH_CM: [number, number] = [40, 3000];

const isBoard = (i: Item) => i.kind === 'grip' && ['polyboard', 'mirror'].includes(libraryItem(i.catalogId)?.shape ?? '');

/** Can the Scale tool (or a width slider) resize it? */
export const isScalable = (i: Item) => i.catalogId === 'generic.note.draw' || isBoard(i) || isArrow(i);
export const isResizableBoard = isBoard;

/** The item made `k` times bigger: a drawing all over, a board across, an arrow along. */
export function scaleItem(item: Item, k: number): Partial<Item> {
  if (item.catalogId === 'generic.note.draw') return scaleDrawing(item, k);
  const { w, d } = itemLook(item);
  if (isArrow(item)) return { sizeCm: { w, d: Math.round(Math.min(ARROW_LENGTH_CM[1], Math.max(ARROW_LENGTH_CM[0], d * k))) } };
  return { sizeCm: { w: Math.round(Math.min(BOARD_WIDTH_CM[1], Math.max(BOARD_WIDTH_CM[0], w * k))), d } };
}
