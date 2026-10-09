// Starter library of generic items (PLAN.md §2.2). Real fixtures come from the catalogue;
// these cover everything else and act as stand-ins when the exact light doesn't matter.
import type { ItemKind } from '../model/types';

export type LibraryCategory = 'lights' | 'grip' | 'camera' | 'people' | 'set' | 'doors' | 'windows' | 'props';

/** Icon family for drawing; lights reuse the catalogue's fixture families. */
export type Shape =
  | 'cob'
  | 'panel'
  | 'mat'
  | 'tube'
  | 'bulb'
  | 'fresnel'
  | 'inflatable'
  | 'spacelight'
  | 'flag'
  | 'frame'
  | 'polyboard'
  | 'stand'
  | 'sandbag'
  | 'camera'
  | 'dolly'
  | 'monitor'
  | 'video-village'
  | 'person'
  | 'wall'
  | 'door'
  | 'window'
  | 'box'
  | 'round'
  | 'walls'
  | 'prop';

export interface LibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  kind: ItemKind;
  shape: Shape;
  /** Footprint seen from above, cm: w across, d front to back. */
  sizeCm: { w: number; d: number };
  /** Lights: typical beam angle, used for the cone until a fixture is picked. */
  beamDeg?: number;
  /** Known to the app (templates use it) but not offered in the Add list. */
  unlisted?: boolean;
  /** Doors, windows and props: which drawing to use (see PlanCanvas). */
  style?: string;
}

const L = (id: string, name: string, shape: Shape, w: number, d: number, beamDeg: number): LibraryItem => ({
  id: `generic.light.${id}`,
  name,
  category: 'lights',
  kind: 'light',
  shape,
  sizeCm: { w, d },
  beamDeg,
});

const I = (
  category: LibraryCategory,
  kind: ItemKind,
  id: string,
  name: string,
  shape: Shape,
  w: number,
  d: number,
): LibraryItem => ({ id: `generic.${id}`, name, category, kind, shape, sizeCm: { w, d } });

const D = (style: string, name: string, w: number): LibraryItem => ({
  ...I('doors', 'set', `door.${style}`, name, 'door', w, 15),
  style,
});
const W = (style: string, name: string, w: number): LibraryItem => ({
  ...I('windows', 'set', `window.${style}`, name, 'window', w, 15),
  style,
});
const P = (id: string, name: string, style: string, w: number, d: number): LibraryItem => ({
  ...I('props', 'prop', `prop.${id}`, name, 'prop', w, d),
  style,
});

export const LIBRARY: LibraryItem[] = [
  L('cob', 'COB + reflector', 'cob', 30, 45, 55),
  L('led-panel', 'LED panel 1×1', 'panel', 30, 30, 110),
  L('led-panel-2x1', 'LED panel 2×1', 'panel', 60, 30, 110),
  L('fresnel', 'Fresnel', 'fresnel', 35, 45, 30),
  L('hmi-par', 'HMI PAR', 'fresnel', 45, 55, 20),
  L('tube', 'LED tube 120 cm', 'tube', 120, 5, 120),
  L('mat', 'LED mat 2×4', 'mat', 120, 60, 120),
  L('practical', 'Practical lamp', 'bulb', 30, 30, 360),
  L('balloon', 'Balloon light', 'inflatable', 100, 100, 360),
  L('spacelight', 'Spacelight', 'spacelight', 60, 60, 160),
  I('grip', 'grip', 'grip.flag', 'Flag 24×36', 'flag', 90, 4),
  I('grip', 'grip', 'grip.frame-4x4', 'Frame 4×4', 'frame', 120, 4),
  I('grip', 'grip', 'grip.frame-6x6', 'Frame 6×6', 'frame', 180, 4),
  I('grip', 'grip', 'grip.frame-8x8', 'Frame 8×8', 'frame', 240, 4),
  I('grip', 'grip', 'grip.frame-12x12', 'Frame 12×12', 'frame', 360, 4),
  I('grip', 'grip', 'grip.vflat', 'V-flat', 'frame', 120, 8),
  I('grip', 'grip', 'grip.polyboard', 'Polyboard', 'polyboard', 120, 5),
  I('grip', 'grip', 'grip.c-stand', 'C-stand', 'stand', 70, 70),
  I('grip', 'grip', 'grip.sandbag', 'Sandbag', 'sandbag', 40, 20),
  I('camera', 'camera', 'camera', 'Camera', 'camera', 26, 34),
  I('camera', 'set', 'camera.dolly', 'Dolly', 'dolly', 70, 120),
  I('camera', 'prop', 'camera.monitor', 'Monitor', 'monitor', 60, 20),
  // One element: a large monitor with two people watching it.
  I('camera', 'prop', 'camera.video-village', 'Video village', 'video-village', 190, 150),
  I('people', 'person', 'person', 'Actor', 'person', 75, 40),
  I('people', 'person', 'person.crew', 'Crew', 'person', 75, 40),
  // Walls are drawn with the Draw walls tool; these older single pieces stay for saved plans.
  { ...I('set', 'set', 'set.wall', 'Wall 1 m', 'wall', 100, 15), unlisted: true },
  { ...I('set', 'set', 'set.door', 'Door', 'door', 90, 10), unlisted: true, style: 'single' },
  { ...I('set', 'set', 'set.window', 'Window', 'window', 120, 15), unlisted: true, style: 'standard' },
  { ...I('set', 'set', 'set.walls', 'Walls', 'walls', 0, 15), unlisted: true },
  // Doors and windows snap into walls; width is resizable.
  D('single', 'Single door', 90),
  D('double', 'Double door', 160),
  D('sliding', 'Sliding door', 160),
  D('pocket', 'Pocket door', 90),
  D('bifold', 'Bi-fold door', 120),
  D('barn', 'Barn door', 110),
  D('garage', 'Garage door', 250),
  W('standard', 'Window', 120),
  W('casement', 'Casement window', 60),
  W('double-casement', 'Double casement', 120),
  W('sliding', 'Sliding window', 150),
  W('picture', 'Picture window', 180),
  W('bay', 'Bay window', 240),
  W('floor-to-ceiling', 'Floor-to-ceiling', 300),
  // Green screen comes from the Green screen template or a frame's fabric, not the Set list.
  { ...I('set', 'set', 'set.green-screen', 'Green screen', 'wall', 400, 10), unlisted: true },
  P('table', 'Dining table', 'table', 180, 90),
  P('round-table', 'Round table', 'round-table', 120, 120),
  P('coffee-table', 'Coffee table', 'table', 110, 60),
  P('desk', 'Desk', 'desk', 140, 70),
  P('chair', 'Chair', 'chair', 50, 50),
  P('office-chair', 'Office chair', 'office-chair', 60, 60),
  P('armchair', 'Armchair', 'armchair', 85, 85),
  P('sofa', 'Sofa', 'sofa', 200, 90),
  P('stool', 'Stool', 'stool', 40, 40),
  P('bench', 'Bench', 'bench', 150, 40),
  P('bed', 'Double bed', 'bed', 160, 200),
  P('single-bed', 'Single bed', 'bed', 90, 200),
  P('nightstand', 'Nightstand', 'cabinet', 45, 40),
  P('wardrobe', 'Wardrobe', 'cabinet', 120, 60),
  P('dresser', 'Dresser', 'cabinet', 100, 50),
  P('bookshelf', 'Bookshelf', 'shelf', 90, 35),
  P('tv', 'TV on stand', 'tv', 140, 45),
  P('counter', 'Kitchen counter', 'counter', 240, 60),
  P('fridge', 'Fridge', 'fridge', 70, 70),
  P('rug', 'Rug', 'rug', 200, 300),
  P('plant', 'Plant', 'plant', 50, 50),
  P('tree', 'Tree', 'tree', 250, 250),
  P('car', 'Car', 'car', 180, 450),
  P('piano', 'Piano', 'piano', 150, 60),
];

const BY_ID = new Map(LIBRARY.map((i) => [i.id, i]));

export const libraryItem = (id: string | undefined): LibraryItem | undefined => (id ? BY_ID.get(id) : undefined);

export const CATEGORY_LABELS: Record<LibraryCategory, string> = {
  lights: 'Lights',
  grip: 'Grip',
  camera: 'Camera',
  people: 'People',
  set: 'Set',
  doors: 'Doors',
  windows: 'Windows',
  props: 'Props',
};

/** Doors and windows sit in walls and can be resized along the wall. */
export const isOpening = (catalogId: string | undefined): boolean => {
  const c = libraryItem(catalogId)?.category;
  return c === 'doors' || c === 'windows' || catalogId === 'generic.set.door' || catalogId === 'generic.set.window';
};
