// Draws the shadows (see model/shadows.ts) under everything on the plan. While something is
// dragged or turned, the canvas passes live positions in, so shadows follow without waiting
// for the drop; only this layer redraws.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Group, Line } from 'react-konva';
import { sceneShadows, type LightSource } from '../model/shadows';
import type { Item, Vec2 } from '../model/types';

export type LivePatch = { pos?: Vec2; rot?: number };
/** Set live changes for some items, or `null` to clear them all. */
export type ShadowLive = (id: string | null, patch?: LivePatch) => void;

export function ShadowLayer({ items, extra = [], liveRef }: { items: Item[]; extra?: LightSource[]; liveRef: MutableRefObject<ShadowLive | null> }) {
  const [live, setLive] = useState<Record<string, LivePatch>>({});
  const pending = useRef<Record<string, LivePatch> | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    liveRef.current = (id, patch) => {
      if (id === null) {
        pending.current = null;
        cancelAnimationFrame(frame.current);
        setLive({});
        return;
      }
      pending.current = { ...(pending.current ?? live), [id]: { ...(pending.current?.[id] ?? live[id]), ...patch } };
      // At most one redraw per frame.
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => pending.current && setLive(pending.current));
    };
    return () => {
      liveRef.current = null;
      cancelAnimationFrame(frame.current);
    };
  }, [liveRef, live]);

  // New saved positions replace live ones.
  useEffect(() => setLive({}), [items]);

  const { sources, shadows } = useMemo(() => {
    const ids = Object.keys(live);
    const now = ids.length
      ? items.map((i) => (live[i.id] ? { ...i, pos: live[i.id]!.pos ?? i.pos, rotationDeg: live[i.id]!.rot ?? i.rotationDeg } : i))
      : items;
    return sceneShadows(now, extra);
  }, [items, live, extra]);

  return (
    <>
      {sources.map((s) => {
        const mine = shadows.filter((sh) => sh.lightId === s.lightId);
        if (!mine.length) return null;
        return (
          <Group
            key={`${s.lightId}-shadows`}
            listening={false}
            // Shadows only exist where the light reaches: inside its beam.
            clipFunc={(ctx) => {
              ctx.beginPath();
              if (s.clip) {
                s.clip.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
                ctx.closePath();
              } else if (s.beamDeg >= 360) ctx.arc(s.apex.x, s.apex.y, s.throwCm, 0, Math.PI * 2);
              else {
                const mid = ((s.rotationDeg - 90) * Math.PI) / 180;
                const half = (s.beamDeg * Math.PI) / 360;
                ctx.moveTo(s.apex.x, s.apex.y);
                ctx.arc(s.apex.x, s.apex.y, s.throwCm, mid - half, mid + half);
                ctx.closePath();
              }
            }}
          >
            {mine.map((sh, k) => (
              <Line key={k} points={sh.points.flatMap((p) => [p.x, p.y])} closed fill="#000" opacity={sh.opacity} perfectDrawEnabled={false} />
            ))}
          </Group>
        );
      })}
    </>
  );
}
