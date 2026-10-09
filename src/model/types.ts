// Core document model. See PLAN.md §5.
//
// Coordinates are world-space centimetres: +x = right, +y = down (south when the plan is
// north-up). Rotations are degrees, clockwise, with 0 = facing up (-y).

export type Vec2 = { x: number; y: number };

export interface LightProps {
  unitId?: string; // fixture ID shown on the plan, e.g. "L1"
  cct?: number;
  gel?: string;
  diffusion?: string;
  /** Catalogue modifiers attached, in stacking order. */
  modifierIds?: string[];
  /** Catalogue stand the light sits on. */
  standId?: string;
  intensityPct?: number;
  beamDeg?: number;
  throwCm?: number;
  heightCm?: number;
  circuit?: string;
  dmx?: { universe: number; address: number };
}

export type ItemKind =
  | 'light'
  | 'modifier'
  | 'grip'
  | 'camera'
  | 'person'
  | 'set'
  | 'prop'
  | 'path'
  | 'note';

export type PathStyle = 'dolly' | 'steadicam' | 'crane' | 'blocking';

export interface Item {
  id: string;
  catalogId?: string;
  kind: ItemKind;
  pos: Vec2;
  rotationDeg: number;
  sizeCm?: { w: number; d: number };
  label?: string;
  locked?: boolean;
  hidden?: boolean;
  light?: LightProps;
  /** People placed as cast: points at the project's actor list (name, colour, gender live there). */
  actorId?: string;
  camera?: CameraProps;
  path?: { points: Vec2[]; style: PathStyle };
}

export interface CameraProps {
  sensor?: string;
  focalMm?: number;
  /** When set, the camera always turns to face this actor (project actor id). */
  focusActorId?: string;
}

export type Gender = 'male' | 'female';

/** Cast member, shared by every scene of a project. */
export interface Actor {
  id: string;
  name: string;
  color: string;
  gender: Gender;
}

export type StringAim =
  | { mode: 'parallel'; angleDeg: number }
  | { mode: 'target'; target: Vec2 }
  | { mode: 'normal'; flip: boolean };

// String tool: N identical items spaced evenly along a straight or curved line.
export interface ItemString {
  id: string;
  catalogId: string;
  count: number; // includes both endpoints
  spacingCm?: number; // if set, count follows spacing
  path: { start: Vec2; end: Vec2; handles: Vec2[] }; // handles = curve control points
  aim: StringAim;
  light?: LightProps; // shared settings for the whole string
  overrides?: Record<number, Partial<LightProps>>; // per-light tweaks, by index
}

export interface Shot {
  id: string;
  number: string;
  name: string;
  shootDate?: string;
  items: Item[];
  strings: ItemString[];
}

export interface Scene {
  id: string;
  number: string;
  name: string;
  shots: Shot[];
}
