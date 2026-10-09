// Starter library of generic items (PLAN.md §2.2). Real fixtures come from the catalogue;
// these cover everything else and act as stand-ins when the exact light doesn't matter.
import type { ItemKind } from '../model/types';

export type LibraryCategory = 'lights' | 'grip' | 'camera' | 'people' | 'set' | 'props';

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
  | 'person'
  | 'wall'
  | 'door'
  | 'window'
  | 'box'
  | 'round';

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
  I('camera', 'prop', 'camera.video-village', 'Video village', 'box', 150, 60),
  I('people', 'person', 'person', 'Actor', 'person', 48, 26),
  I('people', 'person', 'person.crew', 'Crew', 'person', 48, 26),
  I('set', 'set', 'set.wall', 'Wall 1 m', 'wall', 100, 15),
  I('set', 'set', 'set.door', 'Door', 'door', 90, 10),
  I('set', 'set', 'set.window', 'Window', 'window', 120, 15),
  I('set', 'set', 'set.green-screen', 'Green screen', 'wall', 400, 10),
  I('props', 'prop', 'prop.table', 'Table', 'box', 180, 90),
  I('props', 'prop', 'prop.chair', 'Chair', 'box', 50, 50),
  I('props', 'prop', 'prop.sofa', 'Sofa', 'box', 200, 90),
  I('props', 'prop', 'prop.bed', 'Bed', 'box', 160, 200),
  I('props', 'prop', 'prop.desk', 'Desk', 'box', 140, 70),
  I('props', 'prop', 'prop.plant', 'Plant', 'round', 50, 50),
  I('props', 'prop', 'prop.car', 'Car', 'box', 180, 450),
];

const BY_ID = new Map(LIBRARY.map((i) => [i.id, i]));

export const libraryItem = (id: string | undefined): LibraryItem | undefined => (id ? BY_ID.get(id) : undefined);

export const CATEGORY_LABELS: Record<LibraryCategory, string> = {
  lights: 'Lights',
  grip: 'Grip',
  camera: 'Camera',
  people: 'People',
  set: 'Set',
  props: 'Props',
};
