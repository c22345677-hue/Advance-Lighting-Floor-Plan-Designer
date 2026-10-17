import type { TemplateDefinition } from '../types';
import { countOption, interviewersBesideCamera, subjectsFacingCameras } from './shared';

export const interview: TemplateDefinition = {
  id: 'interview',
  name: 'Interview',
  description: 'Seated interview: interviewees, an interviewer beside camera A, multi-camera.',
  kinds: ['doc'],
  placeholder: true,
  options: [
    countOption('interviewees', 'Interviewees', 1, 4),
    countOption('interviewers', 'Interviewers', 1, 3),
    countOption('cameras', 'Cameras', 2, 4),
  ],
  build: (o) => {
    const items = subjectsFacingCameras(
      'Interviewee',
      o.number('interviewees'),
      Array.from({ length: o.number('cameras') }, () => 'medium'),
      50,
      'interviewee',
    );
    const camA = items.find((i) => i.kind === 'camera')!;
    return {
      shots: [
        {
          name: 'Interview',
          items: [...items, ...interviewersBesideCamera(o.number('interviewers'), camA.pos, { x: 0, y: 0 })],
        },
      ],
    };
  },
};
