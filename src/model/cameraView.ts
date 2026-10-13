// What a camera sees: everything in the scene projected into a 16:9 frame from the camera's
// position, direction and lens (camera at eye height). Rough block shapes, nearest drawn last,
// plus a list of gear that's in shot.
import { libraryItem } from '../library/items';
import { itemLook } from './gear';
import { DEFAULT_LENS_MM, horizontalFovDeg } from './lens';
import { lightSource } from './shadows';
import type { Item, Vec2 } from './types';
import { wallSegments } from './walls';

export const CAMERA_HEIGHT_CM = 150;
const NEAR_CM = 20;
const WALL_HEIGHT_CM = 300;

export type ShapeKind = 'person' | 'light' | 'stand' | 'grip' | 'prop' | 'camera' | 'wall';

export interface FrameShape {
  id: string;
  kind: ShapeKind;
  /** Polygon in frame coordinates: x −1…1 left→right, y −1…1 bottom→top (may run past the edges). */
  points: [number, number][];
  /** Distance from the camera, cm (for drawing order). */
  depth: number;
  color?: string;
  /** Gear that shouldn't be in shot. */
  gear: boolean;
  label?: string;
}

export interface Frame {
  aspect: number;
  shapes: FrameShape[];
  /** Gear visible in the frame. */
  inShot: { id: string; label: string }[];
}

const PROP_H: Record<string, number> = { table: 75, 'round-table': 75, desk: 75, chair: 90, 'office-chair': 100, armchair: 90, sofa: 85, stool: 65, bench: 45, bed: 60, cabinet: 120, shelf: 200, tv: 120, counter: 90, fridge: 180, plant: 120, tree: 400, car: 150, piano: 110, rug: 1 };

/** Camera-space coordinates of a floor point: forward distance and sideways offset (right +). */
function toCam(cam: Item, p: Vec2): { z: number; x: number } {
  const r = (cam.rotationDeg * Math.PI) / 180;
  const f = { x: Math.sin(r), y: -Math.cos(r) };
  const right = { x: Math.cos(r), y: Math.sin(r) };
  const d = { x: p.x - cam.pos.x, y: p.y - cam.pos.y };
  return { z: d.x * f.x + d.y * f.y, x: d.x * right.x + d.y * right.y };
}

export function cameraFrame(cam: Item, items: readonly Item[], labelOf: (i: Item) => string = (i) => i.label ?? libraryItem(i.catalogId)?.name ?? i.kind): Frame {
  const aspect = 16 / 9;
  const hf = (horizontalFovDeg(cam.camera?.focalMm ?? DEFAULT_LENS_MM) * Math.PI) / 360; // half, radians
  const tx = Math.tan(hf);
  const ty = tx / aspect;
  const proj = (x: number, z: number, h: number): [number, number] => [x / z / tx, (h - CAMERA_HEIGHT_CM) / z / ty];
  const shapes: FrameShape[] = [];

  /** An upright box standing on the floor, centred at `p`, `w` wide, from `h0` to `h1` cm. */
  const box = (i: Item, kind: ShapeKind, p: Vec2, w: number, h0: number, h1: number, gear: boolean, color?: string, idSuffix = '') => {
    const c = toCam(cam, p);
    if (c.z < NEAR_CM) return;
    const l = proj(c.x - w / 2, c.z, h0);
    const r = proj(c.x + w / 2, c.z, h1);
    shapes.push({ id: i.id + idSuffix, kind, points: [[l[0], l[1]], [r[0], l[1]], [r[0], r[1]], [l[0], r[1]]], depth: c.z, color, gear, label: labelOf(i) });
  };

  for (const i of items) {
    if (i.hidden || i.id === cam.id || i.kind === 'note') continue;
    const look = itemLook(i);
    if (i.wall) {
      wallSegments(i).forEach(([a, b], k) => {
        let ca = toCam(cam, a);
        let cb = toCam(cam, b);
        if (ca.z < NEAR_CM && cb.z < NEAR_CM) return;
        // Clip the wall where it passes behind the camera.
        const clip = (p: typeof ca, q: typeof ca) => {
          const t = (NEAR_CM - p.z) / (q.z - p.z);
          return { z: NEAR_CM, x: p.x + (q.x - p.x) * t };
        };
        if (ca.z < NEAR_CM) ca = clip(ca, cb);
        if (cb.z < NEAR_CM) cb = clip(cb, ca);
        const p1 = proj(ca.x, ca.z, 0);
        const p2 = proj(cb.x, cb.z, 0);
        const p3 = proj(cb.x, cb.z, WALL_HEIGHT_CM);
        const p4 = proj(ca.x, ca.z, WALL_HEIGHT_CM);
        shapes.push({ id: `${i.id}#${k}`, kind: 'wall', points: [p1, p2, p3, p4], depth: (ca.z + cb.z) / 2 + 1e4, gear: false });
      });
      continue;
    }
    if (i.kind === 'person') {
      box(i, 'person', i.pos, 50, 0, 150, i.catalogId === 'generic.person.crew', undefined, '');
      box(i, 'person', i.pos, 24, 150, 175, i.catalogId === 'generic.person.crew', undefined, '#head');
    } else if (i.kind === 'light') {
      const h = lightSource(i, items)?.heightCm ?? 200;
      box(i, 'stand', i.pos, 6, 0, h, true, undefined, '#stand');
      box(i, 'light', i.pos, Math.min(look.w, 120), h - 20, h + 15, true);
    } else if (i.kind === 'grip') {
      if (look.shape === 'stand' || look.shape === 'sandbag') box(i, 'stand', i.pos, look.shape === 'stand' ? 10 : 40, 0, look.shape === 'stand' ? 160 : 15, true);
      else box(i, 'grip', i.pos, look.w, look.shape === 'flag' ? 120 : 30, look.shape === 'flag' ? 180 : 30 + look.w, true);
    } else if (i.kind === 'camera') {
      box(i, 'camera', i.pos, 30, 0, 150, true);
    } else if (look.shape === 'prop') {
      const h = PROP_H[libraryItem(i.catalogId)?.style ?? ''] ?? 90;
      if (h > 2) box(i, 'prop', i.pos, Math.max(look.w, look.d) * 0.8, 0, h, false);
    } else if (look.shape === 'video-village' || look.shape === 'monitor' || look.shape === 'dolly') {
      box(i, 'camera', i.pos, look.w * 0.8, 0, 150, true);
    } else if (i.kind === 'set' && (look.shape === 'wall' || look.shape === 'box')) {
      box(i, 'wall', i.pos, look.w, 0, WALL_HEIGHT_CM, false);
    }
  }
  shapes.sort((a, b) => b.depth - a.depth);
  // In frame when its outline overlaps the picture.
  const visible = (s: FrameShape) => {
    const xs = s.points.map((p) => p[0]);
    const ys = s.points.map((p) => p[1]);
    return Math.min(...xs) <= 1 && Math.max(...xs) >= -1 && Math.min(...ys) <= 1 && Math.max(...ys) >= -1;
  };
  const seen = new Map<string, string>();
  for (const s of shapes) if (s.gear && visible(s)) seen.set(s.id.split('#')[0]!, s.label ?? '');
  return { aspect, shapes, inShot: [...seen].map(([id, label]) => ({ id, label })) };
}
