import { describe, expect, it } from 'vitest';
import { applyTemplate } from './apply';
import { getTemplate, listTemplates } from './registry';
import type { TemplateDefinition } from './types';

const seqIds = () => {
  let n = 0;
  return () => `id${++n}`;
};

const fixture: TemplateDefinition = {
  id: 'fixture',
  name: 'Fixture',
  description: '',
  kinds: ['narrative'],
  options: [],
  build: () => ({
    setItems: [{ kind: 'set', pos: { x: 0, y: -100 }, rotationDeg: 0 }],
    shots: [
      {
        name: 'A',
        items: [
          { kind: 'camera', pos: { x: 100, y: 0 }, rotationDeg: 0 },
          {
            kind: 'path',
            pos: { x: 0, y: 0 },
            rotationDeg: 0,
            path: { style: 'dolly', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] },
          },
        ],
        strings: [
          {
            catalogId: 'tube',
            count: 4,
            path: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, handles: [] },
            aim: { mode: 'target', target: { x: 0, y: 100 } },
          },
        ],
      },
      { name: 'B', items: [] },
    ],
  }),
};

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x);
  expect(a.y).toBeCloseTo(b.y);
};

describe('applyTemplate', () => {
  it('translates and rotates everything around the origin', () => {
    const r = applyTemplate(
      fixture,
      {},
      { origin: { x: 1000, y: 500 }, rotationDeg: 90 },
      { newId: seqIds(), firstShotNumber: 3 },
    );
    // 90° clockwise: (x, y) -> (-y, x)
    close(r.setItems[0]!.pos, { x: 1100, y: 500 });
    const [cam, path] = r.shots[0]!.items;
    close(cam!.pos, { x: 1000, y: 600 });
    expect(cam!.rotationDeg).toBe(90);
    close(path!.path!.points[1]!, { x: 900, y: 500 });
    const s = r.shots[0]!.strings[0]!;
    close(s.path.end, { x: 1000, y: 600 });
    expect(s.aim.mode === 'target' && s.aim.target.x).toBeCloseTo(900);
    expect(r.shots.map((s) => s.number)).toEqual(['3', '4']);
    expect(r.shots[1]!.strings).toEqual([]);
  });

  it('gives every created object a unique id and does not mutate the draft', () => {
    const r = applyTemplate(fixture, {}, { origin: { x: 0, y: 0 } });
    const ids = [
      ...r.setItems.map((i) => i.id),
      ...r.shots.flatMap((s) => [s.id, ...s.items.map((i) => i.id), ...s.strings.map((x) => x.id)]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const again = applyTemplate(fixture, {}, { origin: { x: 50, y: 50 } });
    close(again.shots[0]!.items[0]!.pos, { x: 150, y: 50 });
  });
});

describe('template library', () => {
  it('registers the starter templates', () => {
    expect(listTemplates().map((t) => t.id)).toEqual(['interview', 'teleprompter', 'dialogue', 'dinner-table', 'car-interior', 'walk-and-talk', 'green-screen', 'tabletop']);
  });

  it.each(listTemplates().map((t) => [t.id, t] as const))(
    '%s builds with defaults and with every count at its max',
    (_id, t) => {
      expect(() => applyTemplate(t, {}, { origin: { x: 0, y: 0 } })).not.toThrow();
      const max = Object.fromEntries(
        t.options.flatMap((o) => (o.type === 'number' ? [[o.key, o.max]] : [])),
      );
      expect(() => applyTemplate(t, max, { origin: { x: 0, y: 0 } })).not.toThrow();
    },
  );

  it('interview creates the requested people and cameras, cameras aimed at the subject', () => {
    const r = applyTemplate(
      getTemplate('interview')!,
      { interviewees: 2, cameras: 3 },
      { origin: { x: 0, y: 0 } },
    );
    const items = r.shots[0]!.items;
    const people = items.filter((i) => i.kind === 'person');
    expect(people.filter((i) => i.castRole === 'interviewee').map((i) => i.label)).toEqual(['Interviewee 1', 'Interviewee 2']);
    // At least one interviewer is always placed, facing the interviewees.
    const [interviewer] = people.filter((i) => i.castRole === 'interviewer');
    expect(interviewer?.label).toBe('Interviewer');
    const cams = items.filter((i) => i.kind === 'camera');
    expect(cams).toHaveLength(3);
    // Middle camera sits straight below the subjects, facing up.
    close(cams[1]!.pos, { x: 0, y: 250 });
    expect(cams[1]!.rotationDeg).toBeCloseTo(0);
  });

  it('green screen puts the screen on the set layer at the chosen width', () => {
    const r = applyTemplate(getTemplate('green-screen')!, { screenWidth: '900' }, { origin: { x: 0, y: 0 } });
    expect(r.setItems).toHaveLength(1);
    expect(r.setItems[0]!.sizeCm).toEqual({ w: 900, d: 20 });
  });
});
