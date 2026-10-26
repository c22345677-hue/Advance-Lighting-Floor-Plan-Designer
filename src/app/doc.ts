import { releaseChildren, settleAttachments } from '../model/attach';
import { normDeg } from '../model/geometry';
import { focusScene, newScene, type Project, type SceneDoc } from '../model/project';
import type { Actor, Item, Vec2 } from '../model/types';
import type { Sun } from '../model/sun';

export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}

/** Edits to the items of one scene. */
export type SceneAction =
  | { type: 'add'; setItems: Item[]; items: Item[] }
  | { type: 'move'; id: string; pos: Vec2 }
  | { type: 'update'; id: string; patch: Partial<Omit<Item, 'id'>> }
  /** Several item edits as one undo step. */
  | { type: 'updateMany'; patches: { id: string; patch: Partial<Omit<Item, 'id'>> }[] }
  | { type: 'rotate'; id: string; rotationDeg: number }
  | { type: 'rotateBy'; ids: string[]; deg: number }
  | { type: 'delete'; ids: string[] }
  /** One item takes over others (drawings joined into one shape): patch it, drop the rest. */
  | { type: 'merge'; id: string; patch: Partial<Omit<Item, 'id'>>; remove: string[] }
  | { type: 'clear' }
  /** Replace the scene's items with a template's and remember them as the scene's reset point (one template at a time). */
  | { type: 'applyTemplate'; setItems: Item[]; items: Item[] }
  /** Back to the template layout, or empty when the scene never had one. */
  | { type: 'reset' }
  | { type: 'sun'; sun: Sun | undefined }
  /** Make (or remake) group `slot` from these items. Items can be in several groups (groups inside groups). */
  | { type: 'setGroup'; slot: number; ids: string[] }
  | { type: 'colorGroup'; slot: number; color: string }
  | { type: 'renameGroup'; slot: number; name: string }
  | { type: 'deleteGroup'; slot: number };

export type Action =
  | { type: 'scene'; sceneId: string; action: SceneAction }
  | { type: 'addScene'; scene?: SceneDoc; afterId?: string }
  | { type: 'renameScene'; id: string; name: string }
  | { type: 'deleteScene'; id: string }
  | { type: 'addActor'; actor: Actor }
  | { type: 'updateActor'; id: string; patch: Partial<Omit<Actor, 'id'>> }
  | { type: 'deleteActor'; id: string }
  | { type: 'setProject'; patch: Partial<Pick<Project, 'name' | 'kind' | 'gearListId' | 'gearLimit' | 'equipment'>> }
  | { type: 'load'; project: Project }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

const mapItems = (s: SceneDoc, fn: (i: Item) => Item): SceneDoc => ({
  ...s,
  setItems: s.setItems.map(fn),
  items: s.items.map(fn),
});

const placed = (patch: Partial<Item>) => 'pos' in patch || 'rotationDeg' in patch;

/** Items placed by hand in this edit: if they hang on something, their new place becomes their new offset. */
function movedBy(a: SceneAction): Set<string> {
  switch (a.type) {
    case 'move':
    case 'rotate':
      return new Set([a.id]);
    case 'update':
      return new Set(placed(a.patch) ? [a.id] : []);
    case 'updateMany':
      return new Set(a.patches.filter((x) => placed(x.patch)).map((x) => x.id));
    case 'rotateBy':
      return new Set(a.ids);
    default:
      return new Set();
  }
}

function editScene(s: SceneDoc, a: SceneAction): SceneDoc {
  return settleAttachments(applyEdit(s, a), movedBy(a));
}

function applyEdit(s: SceneDoc, a: SceneAction): SceneDoc {
  switch (a.type) {
    case 'add':
      return { ...s, setItems: [...s.setItems, ...a.setItems], items: [...s.items, ...a.items] };
    case 'move':
      return mapItems(s, (i) => (i.id === a.id ? { ...i, pos: a.pos } : i));
    case 'update':
      return mapItems(s, (i) => (i.id === a.id ? { ...i, ...a.patch } : i));
    case 'updateMany': {
      const by = new Map(a.patches.map((x) => [x.id, x.patch]));
      return mapItems(s, (i) => (by.has(i.id) ? { ...i, ...by.get(i.id) } : i));
    }
    case 'rotate':
      return mapItems(s, (i) => (i.id === a.id ? { ...i, rotationDeg: normDeg(a.rotationDeg) } : i));
    case 'rotateBy':
      return mapItems(s, (i) => (a.ids.includes(i.id) ? { ...i, rotationDeg: normDeg(i.rotationDeg + a.deg) } : i));
    case 'delete': {
      // Doors and windows go with their wall; whatever hung on a deleted item stays, detached.
      const gone = new Set(a.ids);
      return {
        ...s,
        setItems: releaseChildren(s.setItems.filter((i) => !gone.has(i.id) && !(i.inWall && gone.has(i.inWall.wallId))), gone),
        items: releaseChildren(s.items.filter((i) => !gone.has(i.id)), gone),
      };
    }
    case 'merge': {
      const gone = new Set(a.remove);
      const keep = (list: Item[]) => list.filter((i) => !gone.has(i.id)).map((i) => (i.id === a.id ? { ...i, ...a.patch } : i));
      return { ...s, setItems: keep(s.setItems), items: keep(s.items) };
    }
    case 'clear':
      return { ...s, setItems: [], items: [] };
    case 'applyTemplate': {
      // A template replaces what's on the plan: never one layout on top of another (Undo brings it back).
      const { setItems, items } = a;
      return { ...s, setItems, items, baseline: structuredClone({ setItems, items }) };
    }
    case 'sun':
      return { ...s, sun: a.sun };
    case 'setGroup': {
      const old = s.groups?.find((g) => g.slot === a.slot);
      const others = (s.groups ?? []).filter((g) => g.slot !== a.slot);
      return { ...s, groups: [...others, { slot: a.slot, name: old?.name, color: old?.color, ids: a.ids }].sort((x, y) => x.slot - y.slot) };
    }
    case 'colorGroup':
      return { ...s, groups: (s.groups ?? []).map((g) => (g.slot === a.slot ? { ...g, color: a.color } : g)) };
    case 'renameGroup':
      return { ...s, groups: (s.groups ?? []).map((g) => (g.slot === a.slot ? { ...g, name: a.name.trim() || undefined } : g)) };
    case 'deleteGroup':
      return { ...s, groups: (s.groups ?? []).filter((g) => g.slot !== a.slot) };
    case 'reset':
      return {
        ...s,
        setItems: structuredClone(s.baseline?.setItems ?? []),
        items: structuredClone(s.baseline?.items ?? []),
      };
  }
}

/** Unique "Scene N" name. */
function nextSceneName(p: Project): string {
  let n = p.scenes.length + 1;
  while (p.scenes.some((s) => s.name === `Scene ${n}`)) n++;
  return `Scene ${n}`;
}

function edit(p: Project, a: Action): Project {
  switch (a.type) {
    case 'scene':
      return {
        ...p,
        scenes: p.scenes.map((s) => (s.id === a.sceneId ? focusScene(editScene(s, a.action)) : s)),
      };
    case 'addScene': {
      const scene = a.scene ?? newScene(nextSceneName(p));
      const at = a.afterId ? p.scenes.findIndex((s) => s.id === a.afterId) + 1 : p.scenes.length;
      const scenes = [...p.scenes];
      scenes.splice(at || scenes.length, 0, scene);
      return { ...p, scenes };
    }
    case 'renameScene':
      return { ...p, scenes: p.scenes.map((s) => (s.id === a.id ? { ...s, name: a.name } : s)) };
    case 'deleteScene':
      // A project always keeps one scene.
      return p.scenes.length > 1 ? { ...p, scenes: p.scenes.filter((s) => s.id !== a.id) } : p;
    case 'addActor':
      return { ...p, actors: [...p.actors, a.actor] };
    case 'updateActor':
      return { ...p, actors: p.actors.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) };
    case 'deleteActor': {
      // Removing an actor takes them out of every scene and frees cameras focused on them.
      const scrub = (i: Item): Item =>
        i.camera?.twoShot?.includes(a.id)
          ? { ...i, camera: { ...i.camera, twoShot: undefined } }
          : i.camera?.focusActorId === a.id
          ? { ...i, camera: { ...i.camera, focusActorId: undefined } }
          : i.light?.aimActorId === a.id
            ? { ...i, light: { ...i.light, aimActorId: undefined } }
            : i.lookAtActorId === a.id
              ? { ...i, lookAtActorId: undefined }
              : i;
      return {
        ...p,
        actors: p.actors.filter((x) => x.id !== a.id),
        scenes: p.scenes.map((s) => ({
          ...s,
          setItems: s.setItems.filter((i) => i.actorId !== a.id).map(scrub),
          items: s.items.filter((i) => i.actorId !== a.id).map(scrub),
        })),
      };
    }
    case 'setProject':
      return { ...p, ...a.patch };
    default:
      return p;
  }
}

export function reducer(h: History, action: Action): History {
  if (action.type === 'undo') {
    const prev = h.past[h.past.length - 1];
    return prev ? { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] } : h;
  }
  if (action.type === 'redo') {
    const [next, ...rest] = h.future;
    return next ? { past: [...h.past, h.present], present: next, future: rest } : h;
  }
  if (action.type === 'load') return { past: [], present: action.project, future: [] };
  const present = edit(h.present, action);
  if (present === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future: [] };
}

/**
 * The scene as it looks mid-gesture (dragging, turning, scaling): the live changes laid over it
 * and worked through like a finished edit (attached things follow, lights and cameras keep
 * facing their targets), so the plan shows now what letting go will give.
 */
export function liveScene(s: SceneDoc, live: ReadonlyMap<string, Partial<Item>>): SceneDoc {
  if (!live.size) return s;
  const patch = (list: Item[]) => list.map((i) => (live.has(i.id) ? { ...i, ...live.get(i.id) } : i));
  return focusScene(settleAttachments({ ...s, setItems: patch(s.setItems), items: patch(s.items) }, new Set(live.keys())));
}
