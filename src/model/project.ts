// A project: several scenes, one cast (actors) shared by all of them, and the gear list in use.
import { libraryItem } from '../library/items';
import { aimAt } from './geometry';
import type { Actor, CastRole, Gender, Item } from './types';

export interface SceneDoc {
  id: string;
  name: string;
  /** Walls, screens and other set pieces. */
  setItems: Item[];
  items: Item[];
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

export function newActor(
  existing: readonly Actor[],
  opts: { role?: CastRole; gender?: Gender; name?: string } = {},
): Actor {
  const role = opts.role ?? 'actor';
  const color = ACTOR_COLORS[existing.length % ACTOR_COLORS.length]!;
  const n = existing.filter((a) => roleOf(a) === role).length + 1;
  return { id: uid(), name: opts.name ?? `${ROLE_LABEL[role]} ${n}`, color, gender: opts.gender ?? 'male', role };
}

export const sceneItems = (s: SceneDoc): Item[] => [...s.setItems, ...s.items];

// ---- Edit modes ---------------------------------------------------------------------

/** Top-menu categories. Only items of the active category can be selected and moved. */
export type EditMode = 'lights' | 'grip' | 'camera' | 'scene';

export const EDIT_MODES: { id: EditMode; label: string }[] = [
  { id: 'lights', label: 'Lights' },
  { id: 'grip', label: 'Grip' },
  { id: 'camera', label: 'Camera' },
  { id: 'scene', label: 'Scene' },
];

export function modeOf(item: Item): EditMode {
  if (item.kind === 'light' || item.kind === 'modifier') return 'lights';
  if (item.kind === 'grip') return 'grip';
  if (item.kind === 'camera' || item.kind === 'path' || libraryItem(item.catalogId)?.category === 'camera') return 'camera';
  return 'scene';
}

// ---- Camera focus -------------------------------------------------------------------

/**
 * Turns every camera that focuses on an actor to face that actor's position in the scene.
 * Returns the same array when nothing changes.
 */
export function applyCameraFocus(items: Item[], all: readonly Item[] = items): Item[] {
  let changed = false;
  const out = items.map((i) => {
    const target = i.kind === 'camera' && i.camera?.focusActorId ? all.find((a) => a.actorId === i.camera!.focusActorId) : undefined;
    if (!target) return i;
    const rotationDeg = aimAt(i.pos, target.pos);
    if (Math.abs(rotationDeg - i.rotationDeg) < 1e-6) return i;
    changed = true;
    return { ...i, rotationDeg };
  });
  return changed ? out : items;
}

export function focusScene(s: SceneDoc): SceneDoc {
  const all = sceneItems(s);
  const items = applyCameraFocus(s.items, all);
  const setItems = applyCameraFocus(s.setItems, all);
  return items === s.items && setItems === s.setItems ? s : { ...s, items, setItems };
}
