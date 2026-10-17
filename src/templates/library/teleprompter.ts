import type { TemplateDefinition } from '../types';
import { countOption, subjectsFacingCameras } from './shared';

export const teleprompter: TemplateDefinition = {
  id: 'teleprompter',
  name: 'Teleprompter',
  description: 'Presenter reading a teleprompter, talking straight into the lens.',
  kinds: ['doc'],
  placeholder: true,
  options: [
    countOption('presenters', 'Presenters', 1, 3),
    countOption('cameras', 'Cameras', 1, 3),
  ],
  build: (o) => ({
    shots: [
      {
        name: 'Teleprompter',
        items: subjectsFacingCameras(
          'Presenter',
          o.number('presenters'),
          Array.from({ length: o.number('cameras') }, () => 'medium'),
          30,
        ),
      },
    ],
  }),
};
