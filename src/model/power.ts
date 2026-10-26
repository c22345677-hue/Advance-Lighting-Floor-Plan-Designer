// Power distribution: lights on circuits, each circuit's load against its breaker.
import { itemFixture } from './gear';
import type { Item } from './types';

/** Typical draw of stand-in lights (no catalogue fixture), W. */
const STAND_IN_W: Record<string, number> = {
  'generic.light.cob': 300,
  'generic.light.led-panel': 100,
  'generic.light.led-panel-2x1': 200,
  'generic.light.fresnel': 650,
  'generic.light.hmi-par': 1200,
  'generic.light.tube': 30,
  'generic.light.mat': 200,
  'generic.light.practical': 10,
  'generic.light.balloon': 400,
  'generic.light.spacelight': 1000,
  'generic.light.cob-softbox': 600,
};

/** A light's draw at its set intensity is not modelled: planning uses full power. */
export function lightWatts(i: Item): { w: number; estimated: boolean } {
  const w = itemFixture(i)?.powerW;
  if (w != null) return { w, estimated: false };
  return { w: STAND_IN_W[i.catalogId ?? ''] ?? 100, estimated: true };
}

/** Plan to keep a circuit at or under this share of its breaker. */
export const SAFE_LOAD = 0.8;
export const defaultBreakerA = (volts: number) => (volts >= 200 ? 16 : 20);

export interface Circuit {
  name: string;
  lights: Item[];
  watts: number;
  amps: number;
  /** Load as a share of the breaker, 0–1+. */
  load: number;
  status: 'ok' | 'high' | 'over';
  estimated: number;
}

const amps = (w: number, volts: number) => Math.round((w / volts) * 10) / 10;

export function circuitLoads(items: readonly Item[], volts: number, breakerA: number) {
  const lights = items.filter((i) => i.kind === 'light' && !i.hidden);
  const names = [...new Set(lights.map((l) => l.light?.circuit).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const make = (name: string, ls: Item[]): Circuit => {
    const watts = ls.reduce((n, l) => n + lightWatts(l).w, 0);
    const load = watts / volts / breakerA;
    return {
      name,
      lights: ls,
      watts,
      amps: amps(watts, volts),
      load,
      status: load > 1 ? 'over' : load > SAFE_LOAD ? 'high' : 'ok',
      estimated: ls.filter((l) => lightWatts(l).estimated).length,
    };
  };
  const circuits = names.map((n) => make(n, lights.filter((l) => l.light?.circuit === n)));
  const unassigned = lights.filter((l) => !l.light?.circuit);
  const total = lights.reduce((n, l) => n + lightWatts(l).w, 0);
  return { circuits, unassigned, totalWatts: total, totalAmps: amps(total, volts) };
}

/**
 * Puts every light on a circuit, biggest first, filling circuits up to the safe load
 * (a light bigger than that gets a circuit of its own). Circuits are named A, B, C…
 */
export function autoAssign(items: readonly Item[], volts: number, breakerA: number): { id: string; circuit: string }[] {
  const limit = breakerA * volts * SAFE_LOAD;
  const lights = items.filter((i) => i.kind === 'light' && !i.hidden).sort((a, b) => lightWatts(b).w - lightWatts(a).w);
  const bins: number[] = [];
  const out: { id: string; circuit: string }[] = [];
  for (const l of lights) {
    const w = lightWatts(l).w;
    let k = bins.findIndex((used) => used + w <= limit);
    if (k < 0) {
      bins.push(0);
      k = bins.length - 1;
    }
    bins[k]! += w;
    out.push({ id: l.id, circuit: circuitName(k) });
  }
  return out;
}

/** A, B, … Z, AA, AB… */
export function circuitName(k: number): string {
  let s = '';
  let n = k;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
