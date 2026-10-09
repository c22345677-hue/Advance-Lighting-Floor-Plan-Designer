import { describe, expect, it } from 'vitest';
import { createReader, repeatItemLabel, resolveOptions, validateDefinition } from './options';
import type { OptionDef, TemplateDefinition } from './types';

const defs: OptionDef[] = [
  { type: 'number', key: 'cameras', label: 'Cameras', default: 2, min: 1, max: 4 },
  { type: 'number', key: 'height', label: 'Height', default: 1.5, min: 0, max: 3, step: 0.1 },
  {
    type: 'select',
    key: 'size',
    label: 'Size',
    default: 'm',
    choices: [
      { value: 's', label: 'S' },
      { value: 'm', label: 'M' },
    ],
  },
  { type: 'boolean', key: 'hair', label: 'Hair light', default: true },
  {
    type: 'repeat',
    key: 'cam',
    label: 'Camera',
    countFrom: 'cameras',
    itemLabel: 'Camera {n}',
    options: [{ type: 'number', key: 'lens', label: 'Lens', default: 50, min: 12, max: 200 }],
  },
];

const tmpl = (options: OptionDef[]): TemplateDefinition => ({
  id: 't',
  name: 'T',
  kinds: ['narrative'],
  description: '',
  options,
  build: () => ({ shots: [] }),
});

describe('resolveOptions', () => {
  it('fills defaults and sizes repeat groups', () => {
    expect(resolveOptions(defs)).toEqual({
      cameras: 2,
      height: 1.5,
      size: 'm',
      hair: true,
      cam: [{ lens: 50 }, { lens: 50 }],
    });
  });

  it('clamps and snaps numbers, rejects bad values', () => {
    const v = resolveOptions(defs, {
      cameras: 9,
      height: 1.234,
      size: 'xl',
      hair: 'yes' as unknown as boolean,
    });
    expect(v.cameras).toBe(4);
    expect(v.height).toBe(1.2);
    expect(v.size).toBe('m');
    expect(v.hair).toBe(true);
    expect(resolveOptions(defs, { cameras: Number.NaN }).cameras).toBe(2);
    expect(resolveOptions(defs, { cameras: 2.6 }).cameras).toBe(3);
  });

  it('keeps given repeat entries and pads or trims to the count', () => {
    expect(resolveOptions(defs, { cameras: 3, cam: [{ lens: 85 }] }).cam).toEqual([
      { lens: 85 },
      { lens: 50 },
      { lens: 50 },
    ]);
    expect(resolveOptions(defs, { cameras: 1, cam: [{ lens: 85 }, { lens: 35 }] }).cam).toEqual([
      { lens: 85 },
    ]);
  });
});

describe('validateDefinition', () => {
  it('accepts a valid definition', () => {
    expect(() => validateDefinition(tmpl(defs))).not.toThrow();
  });

  it.each<[string, OptionDef[]]>([
    ['duplicate', [defs[0]!, defs[0]!]],
    ['range', [{ type: 'number', key: 'n', label: 'N', default: 9, min: 1, max: 4 }]],
    ['choices', [{ type: 'select', key: 's', label: 'S', default: 'x', choices: [{ value: 'y', label: 'Y' }] }]],
    ['countFrom', [{ ...(defs[4] as Extract<OptionDef, { type: 'repeat' }>), countFrom: 'nope' }]],
    ['countFrom later', [defs[4]!, defs[0]!]],
  ])('rejects bad definition: %s', (_name, options) => {
    expect(() => validateDefinition(tmpl(options))).toThrow();
  });
});

describe('createReader', () => {
  it('reads typed values and throws on unknown or mistyped keys', () => {
    const r = createReader(resolveOptions(defs, { cameras: 1 }));
    expect(r.number('cameras')).toBe(1);
    expect(r.select('size')).toBe('m');
    expect(r.boolean('hair')).toBe(true);
    expect(r.repeat('cam').map((c) => c.number('lens'))).toEqual([50]);
    expect(() => r.number('missing')).toThrow();
    expect(() => r.number('size')).toThrow();
  });
});

it('repeatItemLabel numbers from 1', () => {
  expect(repeatItemLabel('Camera {n}', 0)).toBe('Camera 1');
});
