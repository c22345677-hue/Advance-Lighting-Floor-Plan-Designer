// Helpers shared by the template layouts.
import { GENERIC } from '../../catalog/generic';
import { aimAt, arc, row } from '../../model/geometry';
import type { CastRole, Vec2 } from '../../model/types';
import type { DraftItem, NumberOption, SelectOption } from '../types';

export const countOption = (key: string, label: string, def: number, max: number): NumberOption => ({
  type: 'number',
  key,
  label,
  default: def,
  min: 1,
  max,
});

export const framingOption: SelectOption = {
  type: 'select',
  key: 'framing',
  label: 'Framing',
  default: 'medium',
  choices: [
    { value: 'wide', label: 'Wide' },
    { value: 'medium', label: 'Medium' },
    { value: 'close', label: 'Close-up' },
  ],
};

/** Rough camera-to-subject distance per framing, cm. Placeholder until real layouts. */
export const FRAMING_DISTANCE_CM: Record<string, number> = {
  wide: 400,
  medium: 250,
  close: 170,
};

/** A person; `role` decides what they become in the project's cast (default: by project type). */
export const person = (pos: Vec2, rotationDeg: number, label: string, role?: CastRole): DraftItem => ({
  kind: 'person',
  catalogId: GENERIC.person,
  pos,
  rotationDeg,
  label,
  ...(role ? { castRole: role } : {}),
});

export const camera = (pos: Vec2, target: Vec2, label: string): DraftItem => ({
  kind: 'camera',
  catalogId: GENERIC.camera,
  pos,
  rotationDeg: aimAt(pos, target),
  label,
});

/**
 * Placeholder layout: subjects in a row at (0, 0) facing down (+y), cameras on an arc
 * below them, each at its own framing distance.
 */
export function subjectsFacingCameras(
  subjectLabel: string,
  subjectCount: number,
  cameraFramings: string[],
  spreadDeg: number,
  role?: CastRole,
): DraftItem[] {
  const center = { x: 0, y: 0 };
  const subjects = row(center, subjectCount, 120).map((p, i) =>
    person(p, 180, subjectCount > 1 ? `${subjectLabel} ${i + 1}` : subjectLabel, role),
  );
  const cameras = cameraFramings.map((framing, i) => {
    const dist = FRAMING_DISTANCE_CM[framing] ?? FRAMING_DISTANCE_CM.medium!;
    const pos = arc(center, cameraFramings.length, dist, spreadDeg, 180)[i]!;
    return camera(pos, center, `Cam ${String.fromCharCode(65 + i)}`);
  });
  return [...subjects, ...cameras];
}

/**
 * Interviewers sit just beside the first camera, a little closer to the subjects, facing them.
 * Placeholder until the interview layout is defined.
 */
export function interviewersBesideCamera(count: number, camera: Vec2, subjects: Vec2): DraftItem[] {
  const toSubject = { x: subjects.x - camera.x, y: subjects.y - camera.y };
  const len = Math.hypot(toSubject.x, toSubject.y) || 1;
  const fwd = { x: toSubject.x / len, y: toSubject.y / len };
  const side = { x: -fwd.y, y: fwd.x };
  return Array.from({ length: count }, (_, i) => {
    const offset = (i % 2 === 0 ? 1 : -1) * (55 + Math.floor(i / 2) * 60);
    const pos = { x: camera.x + fwd.x * 40 + side.x * offset, y: camera.y + fwd.y * 40 + side.y * offset };
    return person(pos, aimAt(pos, subjects), count > 1 ? `Interviewer ${i + 1}` : 'Interviewer', 'interviewer');
  });
}
