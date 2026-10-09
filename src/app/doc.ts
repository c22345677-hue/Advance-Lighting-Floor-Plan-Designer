import { normDeg } from '../model/geometry';
import { focusScene, newScene, type Project, type SceneDoc } from '../model/project';
import type { Actor, Item, Vec2 } from '../model/types';

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
  | { type: 'clear' }
  /** Add a template's items and remember the result as the scene's reset point. */
  | { type: 'applyTemplate'; setItems: Item[]; items: Item[] }
  /** Back to the template layout, or empty when the scene never had one. */
  | { type: 'reset' };

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

function editScene(s: SceneDoc, a: SceneAction): SceneDoc {
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
    case 'delete':
      return {
        ...s,
        // Doors and windows go with their wall.
        setItems: s.setItems.filter((i) => !a.ids.includes(i.id) && !(i.inWall && a.ids.includes(i.inWall.wallId))),
        items: s.items.filter((i) => !a.ids.includes(i.id)),
      };
    case 'clear':
      return { ...s, setItems: [], items: [] };
    case 'applyTemplate': {
      const setItems = [...s.setItems, ...a.setItems];
      const items = [...s.items, ...a.items];
      return { ...s, setItems, items, baseline: structuredClone({ setItems, items }) };
    }
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
        i.camera?.focusActorId === a.id
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
