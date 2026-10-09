import { normDeg } from '../model/geometry';
import type { Item, Vec2 } from '../model/types';

/** The plan being edited. One setup for now; scenes and shots come with Phase 5. */
export interface PlanDoc {
  setItems: Item[];
  items: Item[];
}

export interface History {
  past: PlanDoc[];
  present: PlanDoc;
  future: PlanDoc[];
}

export type Action =
  | { type: 'add'; setItems: Item[]; items: Item[] }
  | { type: 'move'; id: string; pos: Vec2 }
  | { type: 'update'; id: string; patch: Partial<Omit<Item, 'id'>> }
  | { type: 'rotate'; id: string; rotationDeg: number }
  | { type: 'rotateBy'; ids: string[]; deg: number }
  | { type: 'delete'; ids: string[] }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

const mapItems = (doc: PlanDoc, fn: (i: Item) => Item): PlanDoc => ({
  setItems: doc.setItems.map(fn),
  items: doc.items.map(fn),
});

function edit(doc: PlanDoc, action: Action): PlanDoc {
  switch (action.type) {
    case 'add':
      return {
        setItems: [...doc.setItems, ...action.setItems],
        items: [...doc.items, ...action.items],
      };
    case 'move':
      return mapItems(doc, (i) => (i.id === action.id ? { ...i, pos: action.pos } : i));
    case 'update':
      return mapItems(doc, (i) => (i.id === action.id ? { ...i, ...action.patch } : i));
    case 'rotate':
      return mapItems(doc, (i) =>
        i.id === action.id ? { ...i, rotationDeg: normDeg(action.rotationDeg) } : i,
      );
    case 'rotateBy':
      return mapItems(doc, (i) =>
        action.ids.includes(i.id) ? { ...i, rotationDeg: normDeg(i.rotationDeg + action.deg) } : i,
      );
    case 'delete':
      return {
        setItems: doc.setItems.filter((i) => !action.ids.includes(i.id)),
        items: doc.items.filter((i) => !action.ids.includes(i.id)),
      };
    case 'clear':
      return { setItems: [], items: [] };
    default:
      return doc;
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
  const present = edit(h.present, action);
  if (present === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future: [] };
}

const STORAGE_KEY = 'lfpd.plan.v1';

export function loadDoc(): PlanDoc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as PlanDoc;
    return Array.isArray(doc.items) && Array.isArray(doc.setItems) ? doc : null;
  } catch {
    return null;
  }
}

export function saveDoc(doc: PlanDoc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Storage unavailable (private mode etc.): the plan just isn't kept between visits.
  }
}
