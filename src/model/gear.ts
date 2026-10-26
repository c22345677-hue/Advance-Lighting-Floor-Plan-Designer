// Links placed items to the gear catalogue: fixture lookup, power totals, rig weight, stands.
import { FIXTURES, MODIFIERS, STANDS } from '../catalog/data';
import { isWeatherSealed, riggingPicks, sizeClass, type SizeClass } from '../catalog/classify';
import { rigWeightKg } from '../catalog/modifiers';
import type { Fixture, Modifier, Stand } from '../catalog/schema';
import { libraryItem, type Shape } from '../library/items';
import type { Item } from './types';

const FIXTURE_BY_ID = new Map(FIXTURES.map((f) => [f.id, f]));
const MODIFIER_BY_ID = new Map(MODIFIERS.map((m) => [m.id, m]));
const STAND_BY_ID = new Map(STANDS.map((s) => [s.id, s]));

export const fixtureById = (id: string | undefined): Fixture | undefined => (id ? FIXTURE_BY_ID.get(id) : undefined);
export const modifierById = (id: string): Modifier | undefined => MODIFIER_BY_ID.get(id);
export const standById = (id: string | undefined): Stand | undefined => (id ? STAND_BY_ID.get(id) : undefined);

/** The catalogue fixture behind a placed light, if one was picked. */
export const itemFixture = (item: Item): Fixture | undefined =>
  item.kind === 'light' ? fixtureById(item.catalogId) : undefined;

export const itemModifiers = (item: Item): Modifier[] =>
  (item.light?.modifierIds ?? []).map(modifierById).filter((m): m is Modifier => !!m);

/** Head + modifiers, kg. Null when no fixture is picked or a weight is unknown. */
export function itemRigWeightKg(item: Item): number | null {
  const f = itemFixture(item);
  return f ? rigWeightKg(f, itemModifiers(item)) : null;
}

/** Stands whose load capacity carries `kg`, lightest first. */
export function standsFor(kg: number | null): Stand[] {
  return STANDS.filter((s) => s.loadCapacityKg !== null && (kg === null || s.loadCapacityKg >= kg)).sort(
    (a, b) => (a.weightKg ?? Infinity) - (b.weightKg ?? Infinity),
  );
}

export type StandCheck = 'ok' | 'over' | 'unknown';

/** Does the light's stand carry its rig weight? */
export function standCheck(item: Item): StandCheck | null {
  const stand = standById(item.light?.standId);
  if (!stand) return null;
  const kg = itemRigWeightKg(item);
  if (kg === null || stand.loadCapacityKg === null) return 'unknown';
  return kg <= stand.loadCapacityKg ? 'ok' : 'over';
}

export interface PowerTotals {
  watts: number;
  amps: number;
  /** Lights placed without a known power draw (generic or catalogue gaps). */
  unknown: number;
}

export function powerTotals(items: readonly Item[], volts: number): PowerTotals {
  let watts = 0;
  let unknown = 0;
  for (const i of items) {
    if (i.kind !== 'light') continue;
    const w = itemFixture(i)?.powerW;
    if (w == null) unknown++;
    else watts += w;
  }
  return { watts, amps: Math.round((watts / volts) * 100) / 100, unknown };
}

export const RIGGING_PICKS = riggingPicks(FIXTURES);
export const BRANDS = [...new Set(FIXTURES.map((f) => f.brand))];

export interface FixtureFilter {
  query?: string;
  brand?: string;
  sizeClass?: SizeClass;
  rigging?: boolean;
  sealed?: boolean;
  /** Limit to these fixture ids (a job gear list). */
  ids?: ReadonlySet<string>;
}

/** How well a fixture matches the query: whole-word hits beat word starts beat substrings. */
function relevance(x: Fixture, words: string[]): number {
  const tokens = `${x.brand} ${x.model} ${(x.aliases ?? []).join(' ')}`.toLowerCase().split(/[\s\-/]+/);
  let score = 0;
  for (const w of words) {
    if (tokens.includes(w)) score += 3;
    else if (tokens.some((t) => t.startsWith(w))) score += 2;
    else score += 1;
  }
  return score;
}

/**
 * Catalogue search: every query word must hit brand, model or an alias. Best matches first
 * ("600d" finds the LS 600d before the 600DSA), then by power.
 */
export function filterFixtures(f: FixtureFilter, limit = 60): Fixture[] {
  const words = (f.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits = FIXTURES.filter((x) => {
    if (f.ids && !f.ids.has(x.id)) return false;
    if (f.brand && x.brand !== f.brand) return false;
    if (f.sizeClass && sizeClass(x) !== f.sizeClass) return false;
    if (f.rigging && !RIGGING_PICKS.has(x.id)) return false;
    if (f.sealed && !isWeatherSealed(x.ipRating)) return false;
    const hay = `${x.brand} ${x.model} ${(x.aliases ?? []).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const score = new Map(hits.map((x) => [x.id, words.length ? relevance(x, words) : 0]));
  hits.sort((a, b) => score.get(b.id)! - score.get(a.id)! || (a.powerW ?? Infinity) - (b.powerW ?? Infinity));
  return hits.slice(0, limit);
}

/** Free-text search only; empty query finds nothing. */
export const searchFixtures = (query: string, limit = 40): Fixture[] =>
  query.trim() ? filterFixtures({ query }, limit) : [];

const FAMILY_SHAPE: Record<Fixture['family'], Shape> = {
  cob: 'cob',
  panel: 'panel',
  mat: 'mat',
  inflatable: 'inflatable',
  tube: 'tube',
  bulb: 'bulb',
  fresnel: 'fresnel',
  spot: 'fresnel',
  par: 'fresnel',
  pocket: 'panel',
  other: 'panel',
};

/** Shape and top-down footprint (cm) used to draw an item. */
export function itemLook(item: Item): { shape: Shape; w: number; d: number } {
  const f = itemFixture(item);
  if (f) {
    const shape = FAMILY_SHAPE[f.family];
    const dims = [f.sizeCm?.l, f.sizeCm?.w].filter((v): v is number => v != null);
    const big = dims.length ? Math.max(...dims) : 40;
    const small = dims.length ? Math.min(...dims) : 30;
    if (shape === 'panel' || shape === 'mat' || shape === 'tube') {
      return { shape, w: big, d: shape === 'panel' ? Math.min(small, f.sizeCm?.h ?? 8, 15) : 4 };
    }
    // Inflatables: a tube lies long and thin; a soft panel or balloon fills its square.
    if (shape === 'inflatable') return big / small > 2 && big >= 20 ? { shape, w: big, d: small } : { shape, w: big, d: big };
    return { shape, w: small, d: big };
  }
  const lib = libraryItem(item.catalogId);
  if (lib) {
    const w = item.sizeCm?.w ?? lib.sizeCm.w;
    const d = item.sizeCm?.d ?? lib.sizeCm.d;
    // A stand-in panel or mat is listed by its face (1×1, 2×4); from above it's a thin slab.
    const thin = item.kind === 'light' ? { panel: 8, mat: 4, tube: 5 }[lib.shape as 'panel' | 'mat' | 'tube'] : undefined;
    return { shape: lib.shape, w, d: thin ? Math.min(d, thin) : d };
  }
  const fallback: Shape = item.kind === 'person' ? 'person' : item.kind === 'camera' ? 'camera' : 'box';
  return { shape: fallback, w: item.sizeCm?.w ?? 40, d: item.sizeCm?.d ?? 40 };
}

/** Next free light number: L1, L2… */
export function nextUnitId(items: readonly Item[]): string {
  let max = 0;
  for (const i of items) {
    const m = /^L(\d+)$/.exec(i.light?.unitId ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `L${max + 1}`;
}
