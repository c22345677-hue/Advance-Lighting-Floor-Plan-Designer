// Narrative layouts: dialogue, dinner table, car interior, walk-and-talk.
import { aimAt, arc } from '../../model/geometry';
import type { Vec2 } from '../../model/types';
import type { DraftItem, TemplateDefinition } from '../types';
import { camera, countOption, light, lightsOption, person, prop } from './shared';

const C = { x: 0, y: 0 };

export const dialogue: TemplateDefinition = {
  id: 'dialogue',
  name: 'Two-person dialogue',
  description: 'Two actors facing each other; over-the-shoulder singles and a wide two shot.',
  kinds: ['narrative'],
  options: [{ type: 'number', key: 'gap', label: 'Distance between them', default: 150, min: 60, max: 400, step: 10, unit: 'cm' }, lightsOption],
  build: (o) => {
    const g = o.number('gap') / 2;
    const a = { x: -g, y: 0 };
    const b = { x: g, y: 0 };
    const items: DraftItem[] = [
      // They look at each other ("@0", "@1": the template's people, linked once cast).
      { ...person(a, aimAt(a, b), 'Actor 1'), lookAtActorId: '@1' },
      { ...person(b, aimAt(b, a), 'Actor 2'), lookAtActorId: '@0' },
      // Over-the-shoulder singles on 85 mm, each locked on the actor facing it; Cam C a 35 mm two shot.
      { ...camera({ x: -g - 120, y: 45 }, b, 'Cam A'), camera: { focalMm: 85, focusActorId: '@1' } },
      { ...camera({ x: g + 120, y: 45 }, a, 'Cam B'), camera: { focalMm: 85, focusActorId: '@0' } },
      { ...camera({ x: 0, y: 380 }, C, 'Cam C'), camera: { focalMm: 35, twoShot: ['@0', '@1'] } },
    ];
    if (o.boolean('lights'))
      items.push(
        light('generic.light.mat', { x: 0, y: -220 }, C, { heightCm: 220 }),
        light('generic.light.fresnel', { x: -g - 150, y: -150 }, b, { heightCm: 230 }),
        light('generic.light.fresnel', { x: g + 150, y: -150 }, a, { heightCm: 230 }),
      );
    return { shots: [{ name: 'Dialogue', items }] };
  },
};

export const dinnerTable: TemplateDefinition = {
  id: 'dinner-table',
  name: 'Dinner table',
  description: 'Actors around a dining table, a wide master and singles.',
  kinds: ['narrative'],
  options: [countOption('actors', 'Actors', 4, 6), countOption('cameras', 'Cameras', 2, 4), lightsOption],
  build: (o) => {
    const n = o.number('actors');
    const seats = arc(C, n, 95, n > 1 ? 360 - 360 / n : 0, 0);
    const items: DraftItem[] = [prop('round-table', C)];
    seats.forEach((p, i) => {
      items.push(person(p, aimAt(p, C), `Actor ${i + 1}`), prop('chair', { x: p.x * 1.15, y: p.y * 1.15 }, aimAt(p, C)));
    });
    const cams = arc(C, o.number('cameras'), 380, 100, 180);
    cams.forEach((p, i) => items.push(camera(p, C, `Cam ${String.fromCharCode(65 + i)}`)));
    if (o.boolean('lights')) items.push({ ...light('generic.light.spacelight', C, { x: 0, y: 1 }, { heightCm: 300 }), rotationDeg: 180 });
    return { shots: [{ name: 'Dinner', items }] };
  },
};

export const carInterior: TemplateDefinition = {
  id: 'car-interior',
  name: 'Car interior',
  description: 'Driver and passenger in a car; windshield two shot and side singles.',
  kinds: ['narrative'],
  options: [lightsOption],
  build: (o) => {
    // The car points up the plan; seats 45 cm either side of centre.
    const driver = { x: -40, y: -20 };
    const passenger = { x: 40, y: -20 };
    const ahead = { x: 0, y: -600 };
    const items: DraftItem[] = [
      prop('car', C),
      person(driver, 0, 'Driver'),
      person(passenger, 0, 'Passenger'),
      { ...camera({ x: 0, y: -260 }, { x: 0, y: -20 }, 'Cam A'), camera: { focalMm: 24 } },
      camera({ x: -160, y: -40 }, passenger, 'Cam B'),
      camera({ x: 160, y: -40 }, driver, 'Cam C'),
    ];
    if (o.boolean('lights'))
      items.push(
        light('generic.light.tube', { x: 0, y: -110 }, { x: 0, y: 0 }, { heightCm: 120 }),
        light('generic.light.led-panel', { x: -150, y: -200 }, driver, { heightCm: 150 }),
        light('generic.light.led-panel', { x: 150, y: -200 }, passenger, { heightCm: 150 }),
      );
    void ahead;
    return { shots: [{ name: 'Car', items }] };
  },
};

export const walkAndTalk: TemplateDefinition = {
  id: 'walk-and-talk',
  name: 'Walk and talk',
  description: 'Two actors walking towards a leading camera, with blocking marks.',
  kinds: ['narrative'],
  options: [{ type: 'number', key: 'distance', label: 'Walk length', default: 600, min: 200, max: 2000, step: 50, unit: 'cm' }],
  build: (o) => {
    const len = o.number('distance');
    const walker = (x: number, label: string): DraftItem => {
      const start: Vec2 = { x, y: len / 2 };
      const end: Vec2 = { x, y: -len / 2 };
      return { ...person(start, 0, label), blocking: { marks: [start, end], at: 0 } };
    };
    return {
      shots: [
        {
          name: 'Walk and talk',
          items: [
            walker(-35, 'Actor 1'),
            walker(35, 'Actor 2'),
            { ...camera({ x: 0, y: len / 2 - 280 }, { x: 0, y: len / 2 }, 'Cam A'), camera: { focalMm: 35 } },
            { kind: 'set', catalogId: 'generic.camera.dolly', pos: { x: 0, y: len / 2 - 330 }, rotationDeg: 180 },
          ],
        },
      ],
    };
  },
};
