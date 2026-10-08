import type {
  OptionDef,
  OptionReader,
  ScalarOption,
  ScalarValue,
  ScalarValues,
  TemplateDefinition,
  TemplateValues,
} from './types';

/** Throws if a template's option definitions are inconsistent. Run once at registration. */
export function validateDefinition(t: TemplateDefinition): void {
  const fail = (msg: string): never => {
    throw new Error(`Template "${t.id}": ${msg}`);
  };
  const seen = new Map<string, OptionDef>();

  const checkScalar = (o: ScalarOption, where: string) => {
    if (o.type === 'number') {
      if (!(o.min <= o.max)) fail(`${where}: min > max`);
      if (o.default < o.min || o.default > o.max) fail(`${where}: default out of range`);
      if (o.step !== undefined && !(o.step > 0)) fail(`${where}: step must be > 0`);
    } else if (o.type === 'select') {
      if (o.choices.length === 0) fail(`${where}: no choices`);
      if (!o.choices.some((c) => c.value === o.default)) fail(`${where}: default not in choices`);
    }
  };

  for (const o of t.options) {
    if (seen.has(o.key)) fail(`duplicate option key "${o.key}"`);
    if (o.type === 'repeat') {
      const src = seen.get(o.countFrom);
      if (!src || src.type !== 'number') {
        fail(`repeat "${o.key}" must reference an earlier number option, got "${o.countFrom}"`);
      }
      const inner = new Set<string>();
      for (const io of o.options) {
        if (inner.has(io.key)) fail(`duplicate key "${io.key}" in repeat "${o.key}"`);
        inner.add(io.key);
        checkScalar(io, `${o.key}.${io.key}`);
      }
    } else {
      checkScalar(o, o.key);
    }
    seen.set(o.key, o);
  }
}

function resolveScalar(o: ScalarOption, input: unknown): ScalarValue {
  switch (o.type) {
    case 'number': {
      if (typeof input !== 'number' || !Number.isFinite(input)) return o.default;
      const step = o.step ?? 1;
      const snapped = o.min + Math.round((input - o.min) / step) * step;
      // Round off float noise from the step maths (e.g. 0.1 steps).
      const clean = Number(snapped.toFixed(10));
      return Math.min(o.max, Math.max(o.min, clean));
    }
    case 'select':
      return typeof input === 'string' && o.choices.some((c) => c.value === input)
        ? input
        : o.default;
    case 'boolean':
      return typeof input === 'boolean' ? input : o.default;
  }
}

function resolveScalars(options: ScalarOption[], input: unknown): ScalarValues {
  const src = isRecord(input) ? input : {};
  const out: ScalarValues = {};
  for (const o of options) out[o.key] = resolveScalar(o, src[o.key]);
  return out;
}

/**
 * Fill in defaults, clamp numbers, drop invalid choices and size repeat groups to their
 * count. Always returns a complete, valid set of values; never throws on bad input.
 */
export function resolveOptions(defs: OptionDef[], input: Partial<TemplateValues> = {}): TemplateValues {
  const out: TemplateValues = {};
  for (const o of defs) {
    if (o.type === 'repeat') {
      const count = out[o.countFrom];
      const given = Array.isArray(input[o.key]) ? (input[o.key] as unknown[]) : [];
      out[o.key] = Array.from({ length: typeof count === 'number' ? count : 0 }, (_, i) =>
        resolveScalars(o.options, given[i]),
      );
    } else {
      out[o.key] = resolveScalar(o, input[o.key]);
    }
  }
  return out;
}

/** Label for one element of a repeat group, e.g. "Camera 2". */
export function repeatItemLabel(itemLabel: string, index: number): string {
  return itemLabel.replaceAll('{n}', String(index + 1));
}

export function createReader(values: TemplateValues | ScalarValues): OptionReader {
  const get = (key: string, type: string): unknown => {
    if (!(key in values)) throw new Error(`Unknown template option "${key}"`);
    const v = values[key];
    if (type === 'repeat' ? !Array.isArray(v) : typeof v !== type) {
      throw new Error(`Template option "${key}" is not a ${type}`);
    }
    return v;
  };
  return {
    number: (key) => get(key, 'number') as number,
    select: (key) => get(key, 'string') as string,
    boolean: (key) => get(key, 'boolean') as boolean,
    repeat: (key) => (get(key, 'repeat') as ScalarValues[]).map(createReader),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
