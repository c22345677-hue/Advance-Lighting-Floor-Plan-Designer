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
  /** When set, the light always turns to face this person (project actor id). */
  aimActorId?: string;
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
  /** Walls: a chain of corners relative to `pos` (a room when closed). */
  wall?: { points: Vec2[]; closed: boolean; thicknessCm?: number };
  /** Doors and windows: the wall segment they sit in, the distance (cm) of their centre from the
   *  segment's first corner, and which side they open to. They follow the wall; their width never changes. */
  inWall?: { wallId: string; seg: number; offsetCm: number; flip?: boolean };
  /** Frames: the fabric stretched on it (see library/fabrics.ts). */
  grip?: { fabric?: string };
  /** People placed as cast: points at the project's actor list (name, colour, gender live there). */
  actorId?: string;
  /** People: the cast member they look at in this scene (they turn to face them, like a camera's focus). */
  lookAtActorId?: string;
  /** Templates only: the cast role a template person becomes (stripped when placed). */
  castRole?: CastRole;
  camera?: CameraProps;
  path?: { points: Vec2[]; style: PathStyle };
}

export interface CameraProps {
  sensor?: string;
  focalMm?: number;
  /** When set, the camera always turns to face this actor (project actor id). */
  focusActorId?: string;
  /** Zoom lens: the range it can use (focalMm is then where it's set). Missing = prime. */
  zoom?: { minMm: number; maxMm: number };
  /** Two shot: frames both these actors, zooming (and backing away if it must). Wins over focusActorId. */
  twoShot?: [string, string];
}

export type Gender = 'male' | 'female';

/**
 * What a person on the plan is called. Only a name: every role behaves the same (colour,
 * gender, kept across scenes, cameras can focus on them). Narrative projects use actors,
 * doc projects interviewees and interviewers.
 */
export type CastRole = 'actor' | 'interviewee' | 'interviewer';

/** Cast member, shared by every scene of a project. */
export interface Actor {
  id: string;
  name: string;
  color: string;
  gender: Gender;
  /** Missing = 'actor' (projects saved before roles existed). */
  role?: CastRole;
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
