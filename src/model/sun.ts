// Daylight through windows. A scene can have a sun: where it comes from (a bearing on the plan,
// 0 = from the top of the plan, clockwise), how high it is, or an overcast sky. Each window then
// either lets in a patch of direct sun, whose shadows are long and parallel when the sun is low,
// or (overcast, or the sun on the other side) acts as a big soft skylight.
import { libraryItem } from '../library/items';
import { displayKelvin, type RGB } from './color';
import { itemLook } from './gear';
import { aimAt } from './geometry';
import { darknessFor, hardnessFor, pointInPolygon, type LightSource } from './shadows';
import type { Item, Vec2 } from './types';
import { wallPoints } from './walls';

export interface Sun {
  on: boolean;
  /** Where the sun is, as a bearing on the plan (0 = top, clockwise), degrees. */
  azimuthDeg: number;
  /** Height above the horizon, degrees. */
  elevationDeg: number;
  overcast?: boolean;
}

export const SUN_PRESETS: { id: string; label: string; sun: Omit<Sun, 'on'> }[] = [
  { id: 'morning', label: 'Morning', sun: { azimuthDeg: 90, elevationDeg: 20 } },
  { id: 'noon', label: 'Midday', sun: { azimuthDeg: 180, elevationDeg: 60 } },
  { id: 'afternoon', label: 'Afternoon', sun: { azimuthDeg: 235, elevationDeg: 35 } },
  { id: 'golden', label: 'Golden hour', sun: { azimuthDeg: 270, elevationDeg: 8 } },
  { id: 'overcast', label: 'Overcast', sun: { azimuthDeg: 180, elevationDeg: 45, overcast: true } },
];

const WINDOW_TOP_CM = 210;
/** Direct sun through glass on a face, lux (rough). */
const DIRECT_LUX = 60000;
/** A window as a skylight: luminous intensity per metre of window width, cd (rough). */
const SKY_CD_PER_M = 1500;

/** Colour temperature of the sun: warm when low, white high up, cool skylight when overcast. */
export function sunKelvin(sun: Sun): number {
  if (sun.overcast) return 6500;
  return Math.round(Math.min(5600, 2500 + sun.elevationDeg * 75) / 50) * 50;
}
export const sunRgb = (sun: Sun): RGB => displayKelvin(sunKelvin(sun));

/** Direction sunlight travels across the plan (unit vector). */
export function sunTravel(sun: Sun): Vec2 {
  const r = (sun.azimuthDeg * Math.PI) / 180;
  return { x: -Math.sin(r), y: Math.cos(r) };
}

const isWindow = (i: Item) => libraryItem(i.catalogId)?.category === 'windows' || i.catalogId === 'generic.set.window';

export interface WindowLight {
  windowId: string;
  /** Direct sun: the lit patch on the floor. */
  patch?: Vec2[];
  /** Shadow source for this window's light. */
  source: LightSource;
  /** Unit vector pointing into the room. */
  inward: Vec2;
  center: Vec2;
  widthCm: number;
}

/** Which way is "into the room" for a window: towards the inside of a closed room, else away from the sun. */
function inwardOf(win: Item, items: readonly Item[], travel: Vec2): Vec2 {
  const r = (win.rotationDeg * Math.PI) / 180;
  // Doors and windows are drawn along x; their normal is ±y in their own frame.
  const n = { x: -Math.sin(r), y: Math.cos(r) };
  const wall = win.inWall ? items.find((i) => i.id === win.inWall!.wallId) : undefined;
  if (wall?.wall?.closed) {
    const test = { x: win.pos.x + n.x * 40, y: win.pos.y + n.y * 40 };
    return pointInPolygon(test, wallPoints(wall)) ? n : { x: -n.x, y: -n.y };
  }
  return n.x * travel.x + n.y * travel.y >= 0 ? n : { x: -n.x, y: -n.y };
}

export function windowLights(items: readonly Item[], sun: Sun | undefined): WindowLight[] {
  if (!sun?.on) return [];
  const travel = sunTravel(sun);
  const el = Math.max(2, Math.min(89, sun.elevationDeg));
  const out: WindowLight[] = [];
  for (const win of items) {
    if (win.hidden || !isWindow(win)) continue;
    const w = itemLook(win).w;
    const inward = inwardOf(win, items, travel);
    const along = { x: inward.y * -1, y: inward.x }; // window's own direction
    const e1 = { x: win.pos.x + (along.x * w) / 2, y: win.pos.y + (along.y * w) / 2 };
    const e2 = { x: win.pos.x - (along.x * w) / 2, y: win.pos.y - (along.y * w) / 2 };
    const facing = travel.x * inward.x + travel.y * inward.y;
    const base = {
      lightId: `sun:${win.id}`,
      apex: win.pos,
      minDistCm: 0,
      why: '',
    };
    if (!sun.overcast && facing > 0.1) {
      // Direct sun: a patch reaching as far as the top of the window throws it.
      const reach = Math.min(1500, WINDOW_TOP_CM / Math.tan((el * Math.PI) / 180));
      const patch = [e1, e2, { x: e2.x + travel.x * reach, y: e2.y + travel.y * reach }, { x: e1.x + travel.x * reach, y: e1.y + travel.y * reach }];
      // A far, high point source stands in for the sun: shadows come out parallel and h / tan(elevation) long.
      const far = 1e5;
      out.push({
        windowId: win.id,
        patch,
        inward,
        center: win.pos,
        widthCm: w,
        source: {
          ...base,
          pos: { x: win.pos.x - travel.x * far, y: win.pos.y - travel.y * far },
          rotationDeg: aimAt(win.pos, { x: win.pos.x + travel.x, y: win.pos.y + travel.y }),
          beamDeg: 1,
          throwCm: 1e5,
          heightCm: far * Math.tan((el * Math.PI) / 180),
          sizeCm: 1,
          darkness: 0.55,
          hardness: 'hard',
          clip: patch,
          ignore: win.inWall ? [`${win.inWall.wallId}#${win.inWall.seg}`] : [],
          why: 'direct sun',
        },
      });
    } else {
      // Skylight: the window glows like a big soft source into the room.
      out.push({
        windowId: win.id,
        inward,
        center: win.pos,
        widthCm: w,
        source: {
          ...base,
          pos: win.pos,
          rotationDeg: aimAt(win.pos, { x: win.pos.x + inward.x, y: win.pos.y + inward.y }),
          beamDeg: 150,
          throwCm: 600,
          heightCm: 150,
          sizeCm: w,
          darkness: darknessFor(w) * 0.6,
          hardness: hardnessFor(w),
          why: 'window skylight',
        },
      });
    }
  }
  return out;
}

/** Daylight on a face at `at`, lux: direct sun in a lit patch, plus window skylight. */
export function daylightLux(at: Vec2, lights: WindowLight[], blocked: (wl: WindowLight) => boolean = () => false): number {
  let lux = 0;
  for (const wl of lights) {
    if (wl.patch && pointInPolygon(at, wl.patch) && !blocked(wl)) lux += DIRECT_LUX;
    const d = Math.hypot(at.x - wl.center.x, at.y - wl.center.y) / 100;
    const into = ((at.x - wl.center.x) * wl.inward.x + (at.y - wl.center.y) * wl.inward.y) / 100;
    if (into <= 0.05) continue; // behind the window
    lux += ((SKY_CD_PER_M * (wl.widthCm / 100)) / Math.max(0.25, d * d)) * (into / Math.max(d, 0.01));
  }
  return lux;
}
