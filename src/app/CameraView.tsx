// Sketch of what a camera sees (see model/cameraView.ts), with gear in shot outlined in red.
import { cameraFrame, type FrameShape } from '../model/cameraView';
import { lightColor, rgbCss } from '../model/color';
import type { Actor, Item } from '../model/types';
import { displayLabel, itemName } from './PlanCanvas';

const W = 320;
const H = 180;

export function CameraView({ cam, items, actors }: { cam: Item; items: Item[]; actors: Actor[] }) {
  const label = (i: Item) => {
    const base = displayLabel(i, actors) || itemName(i);
    return i.light?.unitId ? `${i.light.unitId} ${itemName(i)}` : base;
  };
  const frame = cameraFrame(cam, items, label);
  const byId = new Map(items.map((i) => [i.id, i]));
  const fill = (s: FrameShape) => {
    const item = byId.get(s.id.split('#')[0]!);
    switch (s.kind) {
      case 'person':
        return actors.find((a) => a.id === item?.actorId)?.color ?? '#9aa0a7';
      case 'light':
        return item ? rgbCss(lightColor(item).rgb) : '#f5c04a';
      case 'stand':
        return '#b9bec4';
      case 'grip':
        return '#1c1e21';
      case 'camera':
        return '#3ec7b0';
      case 'wall':
        return '#5b6168';
      default:
        return '#80868d';
    }
  };
  const pt = ([x, y]: [number, number]) => `${((x + 1) / 2) * W},${((1 - y) / 2) * H}`;
  return (
    <div className="camera-view">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="What this camera sees">
        <rect width={W} height={H / 2} fill="#2a2e33" />
        <rect y={H / 2} width={W} height={H / 2} fill="#3b3f44" />
        {frame.shapes.map((s) => (
          <polygon
            key={s.id}
            points={s.points.map(pt).join(' ')}
            fill={fill(s)}
            stroke={s.gear ? '#e5484d' : s.kind === 'wall' ? '#3b3f44' : 'none'}
            strokeWidth={s.gear ? 1.5 : 1}
            opacity={s.kind === 'wall' ? 0.9 : 1}
          />
        ))}
      </svg>
      {frame.inShot.length > 0 ? (
        <p className="hint-text warn-text">In shot: {frame.inShot.map((g) => g.label).join(', ')}</p>
      ) : (
        <p className="hint-text">No gear in shot. Rough sketch from eye height for this lens.</p>
      )}
    </div>
  );
}
