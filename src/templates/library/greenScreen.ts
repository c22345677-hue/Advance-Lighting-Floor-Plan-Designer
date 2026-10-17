import { GENERIC } from '../../catalog/generic';
import type { TemplateDefinition } from '../types';
import {
  countOption,
  framingOption,
  light,
  subjectsFacingCameras,
} from './shared';

export const greenScreen: TemplateDefinition = {
  id: 'green-screen',
  name: 'Green screen',
  description:
    'Subjects in front of a chroma key screen, lit evenly by a 2×1 panel each side; cameras on 50 mm, locked on the subjects.',
  kinds: ['doc', 'narrative'],
  placeholder: true,
  options: [
    countOption('subjects', 'Subjects', 1, 4),
    countOption('cameras', 'Cameras', 1, 2),
    {
      type: 'select',
      key: 'screenWidth',
      label: 'Screen width',
      default: '600',
      choices: [
        { value: '300', label: '3 m' },
        { value: '600', label: '6 m' },
        { value: '900', label: '9 m' },
      ],
    },
    {
      type: 'repeat',
      key: 'cameraSetup',
      label: 'Camera setup',
      countFrom: 'cameras',
      itemLabel: 'Camera {n}',
      options: [framingOption],
    },
  ],
  build: (o) => {
    const width = Number(o.select('screenWidth'));
    const screen = { x: 0, y: -250 };
    const subjects = o.number('subjects');
    const people = subjectsFacingCameras(
      'Subject',
      subjects,
      o.repeat('cameraSetup').map((c) => c.select('framing')),
      30,
    );
    // Each camera on 50 mm, locked on a subject ('@k': the template's k-th person).
    let cam = 0;
    const items = people.map((i) =>
      i.kind === 'camera'
        ? {
            ...i,
            camera: { focalMm: 50, focusActorId: `@${cam++ % subjects}` },
          }
        : i,
    );
    // A 2×1 LED panel each side of the screen, pointed at its centre, lighting it evenly.
    for (const side of [-1, 1]) {
      items.push(
        light(
          'generic.light.led-panel-2x1',
          { x: side * (width / 2 + 60), y: screen.y + 200 },
          screen,
          { aimItemId: '#Green screen', heightCm: 180, throwCm: 400 },
        ),
      );
    }
    return {
      setItems: [
        {
          kind: 'set',
          catalogId: GENERIC.greenScreen,
          pos: screen,
          rotationDeg: 0,
          sizeCm: { w: width, d: 20 },
          label: 'Green screen',
        },
      ],
      shots: [{ name: 'Green screen', items }],
    };
  },
};
