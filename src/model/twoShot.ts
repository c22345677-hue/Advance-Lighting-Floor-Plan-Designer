// Two shot: a camera framing two people. It aims between them and picks the focal length that
// fits both (within its zoom range); when even the widest end can't fit them, or the lens is a
// prime, it backs away along its line until they fit.
import { aimAt } from './geometry';
import { horizontalFovDeg, SUPER35_WIDTH_MM } from './lens';
import type { Vec2 } from './types';

/** Room kept beside each person (shoulders and a little air), cm. */
export const TWO_SHOT_PAD_CM = 45;
/** Extra headroom on top of the tightest fit. */
const MARGIN = 1.1;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** Signed difference between two bearings, -180..180. */
const diff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** Horizontal angle (degrees) a camera at `cam`, aimed between them, needs to see both people. */
export function twoShotFovDeg(cam: Vec2, a: Vec2, b: Vec2): number {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const aim = aimAt(cam, mid);
  let half = 0;
  for (const p of [a, b]) {
    const d = Math.hypot(p.x - cam.x, p.y - cam.y);
    if (d < 1) return 180;
    const pad = deg(Math.atan(TWO_SHOT_PAD_CM / d));
    half = Math.max(half, Math.abs(diff(aimAt(cam, p), aim)) + pad);
  }
  return Math.min(179, 2 * half * MARGIN);
}

/** Focal length (mm) whose horizontal angle of view is `fovDeg`. */
export const focalForFovDeg = (fovDeg: number, sensorWidthMm = SUPER35_WIDTH_MM) =>
  sensorWidthMm / (2 * Math.tan(rad(fovDeg) / 2));

export interface Lens {
  /** Prime: this focal length. Zoom: anywhere in [minMm, maxMm]. */
  focalMm: number;
  zoom?: { minMm: number; maxMm: number };
}

export interface TwoShotFit {
  pos: Vec2;
  rotationDeg: number;
  focalMm: number;
  /** The camera had to move back to fit both. */
  movedBack: boolean;
}

export function fitTwoShot(cam: Vec2, a: Vec2, b: Vec2, lens: Lens): TwoShotFit {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const need = twoShotFovDeg(cam, a, b);
  let focal = lens.focalMm;
  if (lens.zoom) {
    // As tight as the zoom allows while both still fit.
    focal = Math.min(lens.zoom.maxMm, Math.max(lens.zoom.minMm, Math.floor(focalForFovDeg(need))));
  }
  const fov = horizontalFovDeg(focal);
  let pos = cam;
  let movedBack = false;
  if (need > fov) {
    // Back away from the pair along the camera's current line until both fit.
    let dx = cam.x - mid.x;
    let dy = cam.y - mid.y;
    let len = Math.hypot(dx, dy);
    if (len < 1) [dx, dy, len] = [0, 1, 1];
    const at = (d: number) => ({ x: mid.x + (dx / len) * d, y: mid.y + (dy / len) * d });
    let lo = Math.max(len, 1);
    let hi = lo * 2;
    while (twoShotFovDeg(at(hi), a, b) > fov && hi < 1e6) hi *= 2;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (twoShotFovDeg(at(m), a, b) > fov) lo = m;
      else hi = m;
    }
    pos = at(Math.ceil(hi));
    movedBack = true;
  }
  return { pos, rotationDeg: aimAt(pos, mid), focalMm: focal, movedBack };
}
