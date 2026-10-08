import type { TemplateDefinition } from '../types';
import { countOption, framingOption, subjectsFacingCameras } from './shared';

export const interview: TemplateDefinition = {
  id: 'interview',
  name: 'Interview',
  description: 'Seated interview, one or more interviewees, multi-camera.',
  placeholder: true,
  options: [
    countOption('interviewees', 'Interviewees', 1, 4),
    countOption('cameras', 'Cameras', 2, 4),
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
        name: 'Interview',
        items: subjectsFacingCameras(
          'Interviewee',
          o.number('interviewees'),
          o.repeat('cameraSetup').map((c) => c.select('framing')),
          50,
        ),
      },
    ],
  }),
};
