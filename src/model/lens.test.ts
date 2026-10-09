import { expect, it } from 'vitest';
import { horizontalFovDeg } from './lens';

it('gives the Super 35 angle of view for a focal length', () => {
  expect(horizontalFovDeg(35)).toBeCloseTo(39.1, 1);
  expect(horizontalFovDeg(50)).toBeCloseTo(27.95, 1);
  expect(horizontalFovDeg(18)).toBeGreaterThan(horizontalFovDeg(85)); // wider lens, wider cone
});
