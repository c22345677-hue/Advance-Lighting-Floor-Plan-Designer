// Frame fabrics (butterflies / overheads). Each fabric's family decides how it is drawn.
export type FabricKind = 'black' | 'diffusion' | 'bounce' | 'green' | 'blue';

export interface Fabric {
  id: string;
  name: string;
  kind: FabricKind;
}

export const FABRICS: Fabric[] = [
  { id: 'solid', name: 'Solid (black)', kind: 'black' },
  { id: 'duvetyne', name: 'Duvetyne', kind: 'black' },
  { id: 'full-grid', name: 'Full grid cloth', kind: 'diffusion' },
  { id: 'half-grid', name: '½ grid cloth', kind: 'diffusion' },
  { id: 'quarter-grid', name: '¼ grid cloth', kind: 'diffusion' },
  { id: 'light-grid', name: 'Light grid', kind: 'diffusion' },
  { id: 'silk', name: 'Silk', kind: 'diffusion' },
  { id: 'magic-cloth', name: 'Magic cloth', kind: 'diffusion' },
  { id: '216', name: '216 diffusion', kind: 'diffusion' },
  { id: '250', name: '250 diffusion', kind: 'diffusion' },
  { id: 'ultrabounce', name: 'Ultrabounce', kind: 'bounce' },
  { id: 'bleached-muslin', name: 'Bleached muslin', kind: 'bounce' },
  { id: 'unbleached-muslin', name: 'Unbleached muslin', kind: 'bounce' },
  { id: 'griffolyn', name: 'Griffolyn (white)', kind: 'bounce' },
  { id: 'silver-lame', name: 'Silver lamé', kind: 'bounce' },
  { id: 'green-screen', name: 'Green screen', kind: 'green' },
  { id: 'blue-screen', name: 'Blue screen', kind: 'blue' },
];

export const FABRIC_KIND_LABEL: Record<FabricKind, string> = {
  black: 'Black',
  diffusion: 'Diffusion',
  bounce: 'Bounce',
  green: 'Green screen',
  blue: 'Blue screen',
};

const BY_ID = new Map(FABRICS.map((f) => [f.id, f]));
export const fabricById = (id: string | undefined): Fabric | undefined => (id ? BY_ID.get(id) : undefined);

/**
 * How a fabric is drawn on the plan: black is black, diffusion a see-through light grey,
 * every bounce solid white, chroma screens in their key colour.
 */
export const FABRIC_FILL: Record<FabricKind, { fill: string; opacity: number }> = {
  black: { fill: '#0d0d0d', opacity: 1 },
  diffusion: { fill: '#e2e2e2', opacity: 0.45 },
  bounce: { fill: '#ffffff', opacity: 1 },
  green: { fill: '#1fae4b', opacity: 1 },
  blue: { fill: '#1f5fd6', opacity: 1 },
};

/** Frames (4×4 to 12×12) take a fabric. */
export const takesFabric = (catalogId: string | undefined): boolean => !!catalogId?.startsWith('generic.grip.frame-');
