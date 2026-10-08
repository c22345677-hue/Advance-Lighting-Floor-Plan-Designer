import { GENERIC } from '../../catalog/generic';
import type { TemplateDefinition } from '../types';
import { countOption, framingOption, subjectsFacingCameras } from './shared';

export const greenScreen: TemplateDefinition = {
  id: 'green-screen',
  name: 'Green screen',
  description: 'Subjects in front of a chroma key screen.',
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
  build: (o) => ({
    setItems: [
      {
        kind: 'set',
        catalogId: GENERIC.greenScreen,
        pos: { x: 0, y: -250 },
        rotationDeg: 0,
        sizeCm: { w: Number(o.select('screenWidth')), d: 20 },
        label: 'Green screen',
      },
    ],
    shots: [
      {
        name: 'Green screen',
        items: subjectsFacingCameras(
          'Subject',
          o.number('subjects'),
          o.repeat('cameraSetup').map((c) => c.select('framing')),
          30,
        ),
      },
    ],
  }),
};
