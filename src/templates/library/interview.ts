import type { TemplateDefinition } from '../types';
import { countOption, interviewCameras, interviewersBesideCamera, subjectsFacingCameras } from './shared';

export const interview: TemplateDefinition = {
  id: 'interview',
  name: 'Interview',
  description: 'Seated interview: interviewees, an interviewer beside camera A, cameras in a half circle around them (85/50 mm singles, 35/24 mm wides).',
  kinds: ['doc'],
  placeholder: true,
  options: [
    countOption('interviewees', 'Interviewees', 1, 4),
    countOption('interviewers', 'Interviewers', 1, 3),
    countOption('cameras', 'Cameras', 2, 4),
  ],
  build: (o) => {
    const people = subjectsFacingCameras('Interviewee', o.number('interviewees'), [], 0, 'interviewee');
    const items = [...people, ...interviewCameras(o.number('cameras'))];
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
