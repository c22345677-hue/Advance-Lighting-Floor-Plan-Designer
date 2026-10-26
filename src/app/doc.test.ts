import { describe, expect, it } from 'vitest';
import { newProject } from '../model/project';
import { reducer, type History, type SceneAction } from './doc';
import type { Item } from '../model/types';

const chair = (id: string, x: number): Item => ({ id, kind: 'prop', catalogId: 'generic.prop.chair', pos: { x, y: 0 }, rotationDeg: 0 });

describe('groups', () => {
  const start = () => {
    const p = newProject();
    p.scenes[0]!.items = [chair('a', 0), chair('b', 100), chair('c', 200)];
    const h: History = { past: [], present: p, future: [] };
    return h;
  };
  const act = (h: History, action: SceneAction) => reducer(h, { type: 'scene', sceneId: h.present.scenes[0]!.id, action });

  it('nests: an item stays in its first group when it joins another', () => {
    let h = act(start(), { type: 'setGroup', slot: 1, ids: ['a', 'b'] });
    h = act(h, { type: 'setGroup', slot: 2, ids: ['a', 'b', 'c'] });
    const g = h.present.scenes[0]!.groups!;
    expect(g.find((x) => x.slot === 1)!.ids).toEqual(['a', 'b']);
    expect(g.find((x) => x.slot === 2)!.ids).toEqual(['a', 'b', 'c']);
  });

  it('keeps the name and colour of a remade group', () => {
    let h = act(start(), { type: 'setGroup', slot: 3, ids: ['a'] });
    h = act(h, { type: 'renameGroup', slot: 3, name: 'Key side' });
    h = act(h, { type: 'colorGroup', slot: 3, color: '#2fae55' });
    h = act(h, { type: 'setGroup', slot: 3, ids: ['a', 'c'] });
    expect(h.present.scenes[0]!.groups![0]).toEqual({ slot: 3, name: 'Key side', color: '#2fae55', ids: ['a', 'c'] });
  });
});
