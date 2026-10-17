// A project: several scenes, one cast (actors) shared by all of them, and the gear list in use.
import { libraryItem } from '../library/items';
import { aimAt } from './geometry';
import { attachOpenings } from './walls';
import { settleAttachments } from './attach';
import { DEFAULT_LENS_MM } from './lens';
import { fitTwoShot } from './twoShot';
import type { Sun } from './sun';
import type { EquipmentState } from './equipment';
import type { Actor, CastRole, Gender, Item, Vec2 } from './types';

export interface SceneDoc {
  id: string;
  name: string;
  /** Walls, screens and other set pieces. */
  setItems: Item[];
  items: Item[];
  /** Daylight through the windows (see sun.ts). */
  sun?: Sun;
  /** Layout right after the last template was added; Reset returns to it (none = empty). */
  baseline?: { setItems: Item[]; items: Item[] };
}

/** Production type, picked first in Templates. Decides what people are called. */
export type ProjectKind = 'narrative' | 'doc';

export interface Project {
  id: string;
  name: string;
  /** Missing = 'narrative'. */
  kind?: ProjectKind;
  actors: Actor[];
  scenes: SceneDoc[];
  /** Saved gear list used on this job (see gearList.ts), and whether to limit picks to it. */
  gearListId?: string;
  gearLimit?: boolean;
  /** Equipment list edits: rules on/off, kits, hand-added lines, overrides. */
  equipment?: EquipmentState;
}

const uid = () => crypto.randomUUID();

export const newScene = (name: string): SceneDoc => ({ id: uid(), name, setItems: [], items: [] });

export const newProject = (name = 'Untitled project'): Project => ({
  id: uid(),
  name,
  actors: [],
  scenes: [newScene('Scene 1')],
});

/** Actor colours offered in the picker; distinct on the grey plan in both themes. */
export const ACTOR_COLORS = ['#e5484d', '#3e8ef7', '#f5a524', '#2fae55', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export const ROLE_LABEL: Record<CastRole, string> = {
  actor: 'Actor',
  interviewee: 'Interviewee',
  interviewer: 'Interviewer',
};

/** Roles offered for new people in each production type; the first is the default. */
export const KIND_ROLES: Record<ProjectKind, CastRole[]> = {
  narrative: ['actor'],
  doc: ['interviewee', 'interviewer'],
};

export const roleOf = (a: Actor): CastRole => a.role ?? 'actor';

/** What the cast list is called: "Actors" for narrative, "People" for doc. */
export const castTitle = (kind: ProjectKind | undefined): string => (kind === 'doc' ? 'People' : 'Actors');

/**
 * A colour no one in the cast has yet (whatever colours they were given or changed to), in
 * palette order. When all are taken, the one used least.
 */
export function nextActorColor(existing: readonly Actor[]): string {
  const used = (c: string) => existing.filter((a) => a.color.toLowerCase() === c.toLowerCase()).length;
  let best = ACTOR_COLORS[0]!;
  for (const c of ACTOR_COLORS) if (used(c) < used(best)) best = c;
  return best;
}

export function newActor(
  existing: readonly Actor[],
  opts: { role?: CastRole; gender?: Gender; name?: string } = {},
): Actor {
  const role = opts.role ?? 'actor';
  const color = nextActorColor(existing);
  const n = existing.filter((a) => roleOf(a) === role).length + 1;
  return { id: uid(), name: opts.name ?? `${ROLE_LABEL[role]} ${n}`, color, gender: opts.gender ?? 'male', role };
}

export const sceneItems = (s: SceneDoc): Item[] => [...s.setItems, ...s.items];

// ---- Edit modes ---------------------------------------------------------------------

/** What an item belongs to on the plan. */
export type Category = 'lights' | 'grip' | 'camera' | 'scene' | 'notes';

/**
 * Top-menu modes: All (everything can be picked and moved, the default) or one category, where
 * only that category's items can be picked (handy once a plan gets busy).
 */
export type EditMode = 'all' | Category;

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'lights', label: 'Lights' },
  { id: 'grip', label: 'Grip' },
  { id: 'camera', label: 'Camera' },
  { id: 'scene', label: 'Scene' },
  { id: 'notes', label: 'Notes' },
];

export const EDIT_MODES: { id: EditMode; label: string }[] = [{ id: 'all', label: 'All' }, ...CATEGORIES];

/** Can `item` be picked in `mode`? */
export const inMode = (item: Item, mode: EditMode) => mode === 'all' || modeOf(item) === mode;

export function modeOf(item: Item): Category {
  if (item.kind === 'light' || item.kind === 'modifier') return 'lights';
  if (item.kind === 'grip') return 'grip';
  if (item.kind === 'note') return 'notes';
  if (item.kind === 'camera' || item.kind === 'path' || libraryItem(item.catalogId)?.category === 'camera') return 'camera';
  return 'scene';
}

// ---- Camera focus -------------------------------------------------------------------

/**
 * Turns every camera with "focus on" and every light with "aimed at" to face that actor's position in the scene.
 * Returns the same array when nothing changes.
 */
/** The person an item follows: a camera's "focus on", a light's "aimed at" or a person's "looking at". */
export function followsActorId(i: Item): string | undefined {
  if (i.kind === 'camera') return i.camera?.focusActorId;
  if (i.kind === 'light') return i.light?.aimActorId;
  if (i.kind === 'person' && i.lookAtActorId !== i.actorId) return i.lookAtActorId;
  return undefined;
}

/** A camera's two shot when both people are in the scene: the two positions. */
export function twoShotTargets(i: Item, all: readonly Item[]): [Vec2, Vec2] | null {
  const ids = i.kind === 'camera' ? i.camera?.twoShot : undefined;
  if (!ids) return null;
  const a = all.find((x) => x.actorId === ids[0]);
  const b = all.find((x) => x.actorId === ids[1]);
  return a && b && a !== b ? [a.pos, b.pos] : null;
}

export function applyCameraFocus(items: Item[], all: readonly Item[] = items): Item[] {
  let changed = false;
  const out = items.map((i) => {
    const pair = twoShotTargets(i, all);
    if (pair) {
      const fit = fitTwoShot(i.pos, pair[0], pair[1], { focalMm: i.camera?.focalMm ?? DEFAULT_LENS_MM, zoom: i.camera?.zoom });
      const same =
        Math.abs(fit.pos.x - i.pos.x) < 1e-6 &&
        Math.abs(fit.pos.y - i.pos.y) < 1e-6 &&
        Math.abs(fit.rotationDeg - i.rotationDeg) < 1e-6 &&
        fit.focalMm === i.camera?.focalMm;
      if (same) return i;
      changed = true;
      return { ...i, pos: fit.pos, rotationDeg: fit.rotationDeg, camera: { ...i.camera, focalMm: fit.focalMm } };
    }
    const who = followsActorId(i);
    const aimItem = !who ? (i.kind === 'light' ? i.light?.aimItemId : i.kind === 'camera' ? i.camera?.focusItemId : undefined) : undefined;
    const target = who ? all.find((a) => a.actorId === who) : aimItem ? all.find((a) => a.id === aimItem && a.id !== i.id) : undefined;
    if (!target) return i;
    const rotationDeg = aimAt(i.pos, target.pos);
    if (Math.abs(rotationDeg - i.rotationDeg) < 1e-6) return i;
    changed = true;
    return { ...i, rotationDeg };
  });
  return changed ? out : items;
}

export function focusScene(s: SceneDoc): SceneDoc {
  // Attached items follow what they hang on, doors and windows their walls, then cameras and
  // lights turn to their people (and whatever hangs on those follows again).
  let cur = settleAttachments(s);
  const seated = attachOpenings(cur.setItems, sceneItems(cur));
  if (seated !== cur.setItems) cur = { ...cur, setItems: seated };
  for (let k = 0; k < 2; k++) {
    const all = sceneItems(cur);
    const items = applyCameraFocus(cur.items, all);
    const setItems = applyCameraFocus(cur.setItems, all);
    if (items !== cur.items || setItems !== cur.setItems) cur = { ...cur, items, setItems };
    cur = settleAttachments(cur);
  }
  return cur.items === s.items && cur.setItems === s.setItems ? s : cur;
}

/**
 * An interview set up from a template: the first interviewee and interviewer look at each other
 * (other interviewees look at the interviewer, other interviewers at the interviewee), camera 1
 * stays on the interviewee, camera 2 on the interviewer, camera 3 is a two shot of both; further
 * cameras take the next interviewees. Only when the layout has both roles.
 */
/**
 * Who each interview camera covers, in order. Interviewees come first: one camera each, then
 * one for each interviewer; once everyone has their own, the next is a two shot (of two
 * interviewees when there are several, else interviewee and interviewer), then the remaining
 * interviewee pairs. E.g. 1 camera, 1 interviewee: on them. 2 cameras, 1 interviewee and 1
 * interviewer: one each. 2 cameras, 2 interviewees: one on each interviewee.
 */
export function interviewCameraTargets(ees: string[], ers: string[]): (string | [string, string])[] {
  const singles: (string | [string, string])[] = [...ees, ...ers];
  const pairs: [string, string][] = [];
  if (ees.length >= 2) for (let k = 0; k + 1 < ees.length; k++) pairs.push([ees[k]!, ees[k + 1]!]);
  else if (ees.length === 1 && ers.length) pairs.push([ees[0]!, ers[0]!]);
  return [...singles, ...pairs];
}

export function linkInterview(items: Item[], actors: readonly Actor[]): Item[] {
  const role = (i: Item) => {
    const a = i.actorId ? actors.find((x) => x.id === i.actorId) : undefined;
    return a ? roleOf(a) : undefined;
  };
  const ees = items.filter((i) => role(i) === 'interviewee').map((i) => i.actorId!);
  const ers = items.filter((i) => role(i) === 'interviewer').map((i) => i.actorId!);
  if (!ees.length) return items;
  const camTargets = interviewCameraTargets(ees, ers);
  let cam = 0;
  return items.map((i) => {
    if (i.kind === 'camera') {
      const target = camTargets[cam++];
      if (Array.isArray(target)) return { ...i, camera: { ...i.camera, focusActorId: undefined, twoShot: target } };
      return target ? { ...i, camera: { ...i.camera, focusActorId: target } } : i;
    }
    const r = role(i);
    if (r === 'interviewee') return { ...i, lookAtActorId: ers[0] };
    if (r === 'interviewer') return { ...i, lookAtActorId: ees[0] };
    return i;
  });
}
