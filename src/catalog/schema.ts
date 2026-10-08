// Gear catalogue records. Every spec is nullable: unknown stays null, never guessed.
// Units: watts, kilograms, centimetres, metres (cables).

/** Shape family, used to pick the plan icon. */
export type FixtureFamily =
  | 'cob' // point source with reflector/bowens mount (e.g. LS 600d, Evoke)
  | 'panel' // soft panel (e.g. Nova, Litemat-style rigid panels)
  | 'mat' // flexible mat
  | 'inflatable' // balloon / inflatable soft light
  | 'tube'
  | 'bulb'
  | 'fresnel'
  | 'spot' // ellipsoidal / projection
  | 'par'
  | 'pocket' // on-camera / handheld mini lights
  | 'other';

export interface PowerSupply {
  /** True when the fixture has a separate ballast / control box / adapter. */
  external: boolean;
  weightKg: number | null;
  ipRating: string | null; // e.g. "IP54"; null = not rated / unknown
}

export interface BatteryOption {
  /** E.g. "V-mount 14.4 V", "Dual V-mount 28.8 V", "NP-F", "Built-in". */
  type: string;
  /** Max output on this battery as % of mains output; null = unknown. */
  maxOutputPct: number | null;
  note?: string;
}

export interface Fixture {
  id: string; // "<brand>.<model-slug>", stable
  brand: string;
  model: string;
  aliases?: string[]; // names crews use, e.g. "600d", "S60"
  family: FixtureFamily;
  /** Maximum power draw, W. */
  powerW: number | null;
  /** Main fixture (head) weight only, without power supply or accessories. The key number. */
  weightKg: number | null;
  psu: PowerSupply;
  /** Size when deployed (as used), cm: length × width × height. */
  sizeCm: { l: number; w: number; h: number } | null;
  /** Cable length from power supply to fixture, m. */
  headCableM: number | null;
  /** Fixture IP rating, e.g. "IP65"; null = not rated / unknown. */
  ipRating: string | null;
  /** Empty when the fixture can only run on mains. */
  batteries: BatteryOption[];
  /** Where each number came from (catalogue page, spec URL). */
  sources: string[];
  notes?: string;
}

export interface Stand {
  id: string;
  brand: string;
  model: string;
  weightKg: number | null;
  loadCapacityKg: number | null;
  /** Closed (minimum) and fully extended (maximum) height, cm. */
  minHeightCm: number | null;
  maxHeightCm: number | null;
  sources: string[];
  notes?: string;
}
