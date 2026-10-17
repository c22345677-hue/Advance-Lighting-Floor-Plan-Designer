// Helpers shared by the template layouts.
import { GENERIC } from '../../catalog/generic';
import { add, aimAt, arc, rotate, row } from '../../model/geometry';
import { interviewCameraTargets } from '../../model/project';
import type { CastRole, Vec2 } from '../../model/types';
import type { DraftItem, NumberOption } from '../types';

export const countOption = (key: string, label: string, def: number, max: number): NumberOption => ({
  type: 'number',
  key,
  label,
  default: def,
  min: 1,
  max,
});

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
 * An interview laid out for matching eyelines: interviewees on the left facing the interviewers
 * on the right, and every camera on the same side of that line (below it on the plan). So in
 * every shot the interviewees look left to right and the interviewers right to left.
 *
 * Cameras take their people in the same order the project assigns them (see
 * interviewCameraTargets): a single from beside the person they look at, slightly off their
 * eyeline; a two shot from further back, off to the camera side.
 */
export function interviewLayout(interviewees: number, interviewers: number, cameras: number): DraftItem[] {
  const ees = column({ x: -110, y: 0 }, interviewees, 120);
  const ers = column({ x: 110, y: 0 }, interviewers, 100);
  const mean = (ps: Vec2[]) => ({ x: ps.reduce((t, p) => t + p.x, 0) / ps.length, y: ps.reduce((t, p) => t + p.y, 0) / ps.length });
  const eeMid = mean(ees);
  const erMid = ers.length ? mean(ers) : { x: eeMid.x + 220, y: eeMid.y };
  const people = [
    ...ees.map((p, i) => person(p, aimAt(p, erMid), interviewees > 1 ? `Interviewee ${i + 1}` : 'Interviewee', 'interviewee')),
    ...ers.map((p, i) => person(p, aimAt(p, eeMid), interviewers > 1 ? `Interviewer ${i + 1}` : 'Interviewer', 'interviewer')),
  ];
  const at: Record<string, Vec2> = {};
  ees.forEach((p, i) => (at[`e${i}`] = p));
  ers.forEach((p, i) => (at[`r${i}`] = p));
  /** `from` + `dist` along `toward`, turned `deg` to the camera side (down the plan). */
  const out = (from: Vec2, toward: Vec2, deg: number, dist: number) => {
    const len = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
    const u = { x: (toward.x - from.x) / len, y: (toward.y - from.y) / len };
    const [p, q] = [rotate(u, deg), rotate(u, -deg)];
    const d = p.y >= q.y ? p : q;
    return add(from, { x: d.x * dist, y: d.y * dist });
  };
  const targets = interviewCameraTargets(ees.map((_, i) => `e${i}`), ers.map((_, i) => `r${i}`));
  const cams = Array.from({ length: cameras }, (_, k) => {
    const t = targets[k];
    let pos: Vec2;
    let aim: Vec2;
    if (typeof t === 'string') {
      // A single, from beside whoever they're talking to.
      aim = at[t]!;
      pos = out(aim, t.startsWith('e') ? erMid : eeMid, 40, 250);
    } else if (t) {
      const [a, b] = [at[t[0]]!, at[t[1]]!];
      aim = mean([a, b]);
      // Two interviewees: from the interviewer's side; interviewee and interviewer: side on.
      pos = t[1].startsWith('e') ? out(aim, erMid, 60, 300) : out(aim, b, 90, 300);
    } else {
      aim = mean([eeMid, erMid]);
      pos = out(aim, erMid, 90, 400);
    }
    return camera(pos, aim, `Cam ${String.fromCharCode(65 + k)}`);
  });
  return [...people, ...cams];
}

/** `count` points in a column through `center` (top to bottom), `spacing` apart. */
const column = (center: Vec2, count: number, spacing: number): Vec2[] =>
  row({ x: 0, y: 0 }, count, spacing).map((p) => ({ x: center.x, y: center.y + p.x }));

/** A light (generic stand-in) at `pos`, aimed at `target`. */
export const light = (catalogId: string, pos: Vec2, target: Vec2, extra: Partial<DraftItem['light']> = {}): DraftItem => ({
  kind: 'light',
  catalogId,
  pos,
  rotationDeg: aimAt(pos, target),
  light: { ...extra },
});

/** A prop from the library, e.g. "table". */
export const prop = (id: string, pos: Vec2, rotationDeg = 0): DraftItem => ({ kind: 'prop', catalogId: `generic.prop.${id}`, pos, rotationDeg });

/** A grip item, e.g. "polyboard" or "flag". */
export const grip = (id: string, pos: Vec2, target: Vec2, extra: Partial<DraftItem> = {}): DraftItem => ({
  kind: 'grip',
  catalogId: `generic.grip.${id}`,
  pos,
  rotationDeg: aimAt(pos, target),
  ...extra,
});

export const lightsOption = { type: 'boolean' as const, key: 'lights', label: 'Starter lights', default: true };
