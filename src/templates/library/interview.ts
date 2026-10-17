import type { TemplateDefinition } from '../types';
import { countOption, interviewLayout } from './shared';

export const interview: TemplateDefinition = {
  id: 'interview',
  name: 'Interview',
  description:
    'Seated interview: interviewees facing the interviewers, every camera on one side of their eyeline so looks always match (85/50 mm singles, 35/24 mm wides).',
  kinds: ['doc'],
  placeholder: true,
  options: [
    countOption('interviewees', 'Interviewees', 1, 4),
    countOption('interviewers', 'Interviewers', 1, 3),
    countOption('cameras', 'Cameras', 2, 4),
  ],
  build: (o) => ({
    shots: [
      {
        name: 'Interview',
        items: interviewLayout(o.number('interviewees'), o.number('interviewers'), o.number('cameras')),
      },
    ],
  }),
};
