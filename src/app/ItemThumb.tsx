// A small drawing of a library item, as it looks on the plan, for the add panel's tiles.
import { memo } from 'react';
import { Group, Layer, Stage } from 'react-konva';
import type { LibraryItem } from '../library/items';
import type { Item } from '../model/types';
import { ItemShape } from './PlanCanvas';
import type { CanvasColors } from './theme';

const SIZE = 44;

export const ItemThumb = memo(function ItemThumb({ entry, colors }: { entry: LibraryItem; colors: CanvasColors }) {
  const item: Item = { id: `thumb:${entry.id}`, kind: entry.kind, catalogId: entry.id, pos: { x: 0, y: 0 }, rotationDeg: 0, sizeCm: { ...entry.sizeCm } };
  // Fit the larger side, with room for parts that reach past the footprint (door swings, light barn doors).
  const scale = (SIZE * 0.72) / Math.max(entry.sizeCm.w, entry.sizeCm.d, 1);
  return (
    <span className="tile-thumb" aria-hidden="true">
      <Stage width={SIZE} height={SIZE} listening={false}>
        <Layer listening={false}>
          <Group x={SIZE / 2} y={SIZE / 2} scaleX={scale} scaleY={scale}>
            <ItemShape item={item} actors={[]} colors={colors} bodyOnly />
          </Group>
        </Layer>
      </Stage>
    </span>
  );
});
