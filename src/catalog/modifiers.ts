import type { Fixture, Modifier } from './schema';

/** Modifiers that fit a fixture: made for that model, or sharing its mount. */
export function modifiersFor(fixture: Fixture, modifiers: readonly Modifier[]): Modifier[] {
  return modifiers.filter(
    (m) =>
      m.fitsFixtureIds.includes(fixture.id) ||
      (m.fitsFixtureIds.length === 0 && fixture.mount !== null && m.mounts.includes(fixture.mount)),
  );
}

/**
 * Head weight plus attached modifiers, the number that matters for stands and rigging.
 * Null when any part's weight is unknown.
 */
export function rigWeightKg(fixture: Fixture, attached: readonly Modifier[]): number | null {
  if (fixture.weightKg === null) return null;
  let total = fixture.weightKg;
  for (const m of attached) {
    if (m.weightKg === null) return null;
    total += m.weightKg;
  }
  return Math.round(total * 1000) / 1000;
}
