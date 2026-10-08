import type { Fixture } from './schema';

export type SizeClass = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

export const SIZE_CLASSES: { id: SizeClass; label: string; rule: string }[] = [
  { id: 'tiny', label: 'Tiny', rule: 'under 40 W, or under 150 W and under 600 g' },
  { id: 'small', label: 'Small', rule: '40–150 W, or under 600 W and under 1 kg' },
  { id: 'medium', label: 'Medium', rule: '150–600 W' },
  { id: 'large', label: 'Large', rule: '600–2500 W' },
  { id: 'huge', label: 'Huge', rule: '2500 W and up' },
];

/**
 * Size class by power draw, with weight able to pull a light down a class:
 * a very light low-power fixture counts as tiny, a sub-1 kg fixture as small.
 * Returns null when power is unknown.
 */
export function sizeClass(f: Pick<Fixture, 'powerW' | 'weightKg'>): SizeClass | null {
  const w = f.powerW;
  if (w === null) return null;
  const kg = f.weightKg;
  if (w < 40 || (w < 150 && kg !== null && kg < 0.6)) return 'tiny';
  if (w < 150 || (w < 600 && kg !== null && kg < 1)) return 'small';
  if (w < 600) return 'medium';
  if (w < 2500) return 'large';
  return 'huge';
}

/** Parses "IP65" → { solids: 6, water: 5 }. "X" (untested) reads as 0. */
export function parseIp(ip: string | null): { solids: number; water: number } | null {
  const m = ip?.trim().toUpperCase().match(/^IP([0-6X])([0-9X])/);
  if (!m) return null;
  const n = (c: string) => (c === 'X' ? 0 : Number(c));
  return { solids: n(m[1]!), water: n(m[2]!) };
}

/** Weather sealed = protected against splashing water at least (IPx4 and up). */
export const isWeatherSealed = (ip: string | null): boolean => (parseIp(ip)?.water ?? 0) >= 4;

/** Fixture and its power supply (if external) are both weather sealed. */
export const isFullyWeatherSealed = (f: Fixture): boolean =>
  isWeatherSealed(f.ipRating) && (!f.psu.external || isWeatherSealed(f.psu.ipRating));

/**
 * "Best for rigging": the lightest `perClass` fixtures (by head weight) in each size class.
 * Fixtures with unknown weight or class are never picked.
 */
export function riggingPicks(fixtures: Fixture[], perClass = 3): Set<string> {
  const byClass = new Map<SizeClass, Fixture[]>();
  for (const f of fixtures) {
    const c = sizeClass(f);
    if (!c || f.weightKg === null) continue;
    byClass.set(c, [...(byClass.get(c) ?? []), f]);
  }
  const picks = new Set<string>();
  for (const list of byClass.values()) {
    list
      .sort((a, b) => a.weightKg! - b.weightKg!)
      .slice(0, perClass)
      .forEach((f) => picks.add(f.id));
  }
  return picks;
}

/** Highest output available on battery power, or null if it can't run on batteries. */
export function bestBatteryOutputPct(f: Fixture): number | null {
  if (f.batteries.length === 0) return null;
  const known = f.batteries.map((b) => b.maxOutputPct).filter((p): p is number => p !== null);
  return known.length ? Math.max(...known) : null;
}
