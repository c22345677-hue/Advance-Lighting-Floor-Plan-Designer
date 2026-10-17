import { describe, expect, it } from 'vitest';
import { reducer, type History, type SceneAction } from '../app/doc';
import { assemblyOf, attachmentFor, canAttach, LIGHT_METER_ID, turnPatches } from './attach';
import { newProject, newScene } from './project';
import type { Item } from './types';

const light: Item = { id: 'L', kind: 'light', catalogId: 'generic.light.cob', pos: { x: 0, y: 0 }, rotationDeg: 0 };
const frame: Item = { id: 'F', kind: 'grip', catalogId: 'generic.grip.frame-4x4', pos: { x: 0, y: -100 }, rotationDeg: 0 };
const person: Item = { id: 'P', kind: 'person', catalogId: 'generic.person', pos: { x: 300, y: 0 }, rotationDeg: 0 };
const meter: Item = { id: 'M', kind: 'prop', catalogId: LIGHT_METER_ID, pos: { x: 300, y: -40 }, rotationDeg: 0 };

function start(items: Item[]): History {
  const p = newProject('t');
  p.scenes = [{ ...newScene('S'), items }];
  return { past: [], present: p, future: [] };
}
const sceneOf = (h: History) => h.present.scenes[0]!;
const scene = (h: History, action: SceneAction) => reducer(h, { type: 'scene', sceneId: sceneOf(h).id, action });
const get = (h: History, id: string) => sceneOf(h).items.find((i) => i.id === id)!;

describe('attachments', () => {
  it('an attached frame moves and turns with its light', () => {
    let h = start([light, frame]);
    h = scene(h, { type: 'update', id: 'F', patch: { attachedTo: attachmentFor(frame, light) } });
    h = scene(h, { type: 'move', id: 'L', pos: { x: 200, y: 50 } });
    expect(get(h, 'F').pos).toEqual({ x: 200, y: -50 });
    // Turning the light 90° swings the frame round to its right.
    h = scene(h, { type: 'rotate', id: 'L', rotationDeg: 90 });
    expect(get(h, 'F').pos.x).toBeCloseTo(300);
    expect(get(h, 'F').pos.y).toBeCloseTo(50);
    expect(get(h, 'F').rotationDeg).toBeCloseTo(90);
  });

  it('turning an attached item turns the whole group around the root', () => {
    const all = [light, { ...frame, attachedTo: attachmentFor(frame, light) }];
    expect(turnPatches(all[1]!, 45, all)).toEqual([{ id: 'L', patch: { rotationDeg: 45 } }]);
    expect(assemblyOf(all[1]!, all).map((i) => i.id)).toEqual(['L', 'F']);
  });

  it('a light meter orbits its person, and follows when the person turns', () => {
    let h = start([person, meter]);
    h = scene(h, { type: 'update', id: 'M', patch: { attachedTo: attachmentFor(meter, person) } });
    const m = get(h, 'M');
    const patches = turnPatches(m, 90, sceneOf(h).items);
    expect(patches[0]!.id).toBe('M');
    h = scene(h, { type: 'updateMany', patches });
    // 40 cm in front became 40 cm to the person's right.
    expect(get(h, 'M').pos.x).toBeCloseTo(340);
    expect(get(h, 'M').pos.y).toBeCloseTo(0);
    expect(get(h, 'P').rotationDeg).toBe(0);
    h = scene(h, { type: 'rotate', id: 'P', rotationDeg: 90 });
    expect(get(h, 'M').pos.x).toBeCloseTo(300);
    expect(get(h, 'M').pos.y).toBeCloseTo(40);
  });

  it('moving an attached item by hand keeps it attached at its new place; deleting the parent detaches', () => {
    let h = start([light, frame]);
    h = scene(h, { type: 'update', id: 'F', patch: { attachedTo: attachmentFor(frame, light) } });
    h = scene(h, { type: 'move', id: 'F', pos: { x: 0, y: -150 } });
    expect(get(h, 'F').attachedTo!.offset).toEqual({ x: 0, y: -150 });
    h = scene(h, { type: 'delete', ids: ['L'] });
    expect(get(h, 'F').attachedTo).toBeUndefined();
    expect(get(h, 'F').pos).toEqual({ x: 0, y: -150 });
  });

  it('no loops, and doors, windows and walls are never hung on things', () => {
    const f = { ...frame, attachedTo: attachmentFor(frame, light) };
    expect(canAttach(light, f, [light, f])).toBe(false);
    expect(canAttach(f, light, [light, f])).toBe(true);
    const door: Item = { id: 'D', kind: 'set', catalogId: 'generic.door.single', pos: { x: 0, y: 0 }, rotationDeg: 0, inWall: { wallId: 'W', seg: 0, offsetCm: 50 } };
    expect(canAttach(door, light, [light, door])).toBe(false);
  });
});

describe('templates', () => {
  it('a template replaces what is on the plan, it never goes on top', () => {
    let h = start([light, frame]);
    h = scene(h, { type: 'applyTemplate', setItems: [], items: [person] });
    expect(sceneOf(h).items.map((i) => i.id)).toEqual(['P']);
    h = scene(h, { type: 'applyTemplate', setItems: [], items: [meter] });
    expect(sceneOf(h).items.map((i) => i.id)).toEqual(['M']);
    // Reset goes back to the last template; undo to the one before.
    h = scene(h, { type: 'reset' });
    expect(sceneOf(h).items.map((i) => i.id)).toEqual(['M']);
  });
});
