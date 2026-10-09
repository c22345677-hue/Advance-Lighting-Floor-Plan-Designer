import type { TemplateDefinition } from '../types';
import { countOption, framingOption, subjectsFacingCameras } from './shared';

export const pieceToCamera: TemplateDefinition = {
  id: 'piece-to-camera',
  name: 'Piece to camera',
  description: 'Presenter talking straight into the lens.',
  kinds: ['doc', 'narrative'],
  placeholder: true,
  options: [
    countOption('presenters', 'Presenters', 1, 3),
    countOption('cameras', 'Cameras', 1, 3),
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
    shots: [
      {
        name: 'Piece to camera',
        items: subjectsFacingCameras(
          'Presenter',
          o.number('presenters'),
          o.repeat('cameraSetup').map((c) => c.select('framing')),
          30,
        ),
      },
    ],
  }),
};
