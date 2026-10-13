// Product tabletop: a product on a table, camera, soft key, rim light and bounce.
import type { TemplateDefinition } from '../types';
import { camera, grip, light, prop } from './shared';

export const tabletop: TemplateDefinition = {
  id: 'tabletop',
  name: 'Product tabletop',
  description: 'A product on a table with a soft key, a rim light and a bounce card.',
  kinds: ['narrative', 'doc'],
  options: [],
  build: () => {
    const product = { x: 0, y: 0 };
    return {
      shots: [
        {
          name: 'Tabletop',
          items: [
            prop('desk', { x: 0, y: -10 }),
            { kind: 'prop', catalogId: 'generic.prop.stool', pos: product, rotationDeg: 0, label: 'Product' },
            { ...camera({ x: 0, y: 220 }, product, 'Cam A'), camera: { focalMm: 85 } },
            light('generic.light.cob', { x: -160, y: 60 }, product, { heightCm: 140 }),
            light('generic.light.led-panel', { x: 110, y: -150 }, product, { heightCm: 150 }),
            grip('polyboard', { x: 120, y: 60 }, product),
          ],
        },
      ],
    };
  },
};
