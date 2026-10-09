// Job gear list: the fixtures, modifiers and stands available on a job, with quantities.
// Saved lists are reusable across projects; a project points at the one it uses.
import type { Item } from './types';

export type GearKind = 'fixture' | 'modifier' | 'stand';

export interface GearEntry {
  kind: GearKind;
  id: string; // catalogue id
  qty: number;
}

export interface GearList {
  id: string;
  name: string;
  entries: GearEntry[];
}

const key = (kind: GearKind, id: string) => `${kind}:${id}`;

/** How many of each catalogue item a scene uses. */
export function gearUsage(items: readonly Item[]): Map<string, number> {
  const used = new Map<string, number>();
  const bump = (k: string) => used.set(k, (used.get(k) ?? 0) + 1);
  for (const i of items) {
    if (i.kind !== 'light') continue;
    if (i.catalogId && !i.catalogId.startsWith('generic.')) bump(key('fixture', i.catalogId));
    for (const m of i.light?.modifierIds ?? []) bump(key('modifier', m));
    if (i.light?.standId) bump(key('stand', i.light.standId));
  }
  return used;
}

export interface Availability {
  qty: number;
  used: number;
  left: number;
}

/** Quantity on the list, how many the scene uses, and how many are left. Null = not on the list. */
export function availability(list: GearList, usage: Map<string, number>, kind: GearKind, id: string): Availability | null {
  const entry = list.entries.find((e) => e.kind === kind && e.id === id);
  if (!entry) return null;
  const used = usage.get(key(kind, id)) ?? 0;
  return { qty: entry.qty, used, left: entry.qty - used };
}

export function setQty(list: GearList, kind: GearKind, id: string, qty: number): GearList {
  const rest = list.entries.filter((e) => !(e.kind === kind && e.id === id));
  if (qty <= 0) return { ...list, entries: rest };
  const at = list.entries.findIndex((e) => e.kind === kind && e.id === id);
  const entries = [...list.entries];
  if (at >= 0) entries[at] = { kind, id, qty };
  else entries.push({ kind, id, qty });
  return { ...list, entries };
}
