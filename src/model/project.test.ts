import { describe, expect, it } from 'vitest';
import { reducer, type History } from '../app/doc';
import { availability, gearUsage, setQty, type GearList } from './gearList';
import { applyCameraFocus, modeOf, newActor, newProject } from './project';
import type { Item } from './types';

const item = (id: string, extra: Partial<Item>): Item => ({ id, kind: 'prop', pos: { x: 0, y: 0 }, rotationDeg: 0, ...extra });

describe('camera focus', () => {
  it('turns a focused camera to face its actor', () => {
    const actor = item('a', { kind: 'person', actorId: 'act1', pos: { x: 100, y: 0 } });
    const cam = item('c', { kind: 'camera', camera: { focusActorId: 'act1' } });
    const [, c] = applyCameraFocus([actor, cam]);
    expect(c!.rotationDeg).toBeCloseTo(90); // actor is to the right
  });

  it('leaves cameras alone when nothing changes', () => {
    const items = [item('c', { kind: 'camera' })];
    expect(applyCameraFocus(items)).toBe(items);
  });

  it('follows the actor when the actor moves (through the reducer)', () => {
    const p = newProject();
    const sceneId = p.scenes[0]!.id;
    const actor = newActor([]);
    let h: History = { past: [], present: p, future: [] };
    h = reducer(h, { type: 'addActor', actor });
    h = reducer(h, {
      type: 'scene',
      sceneId,
      action: {
        type: 'add',
        setItems: [],
        items: [
          item('tok', { kind: 'person', actorId: actor.id, pos: { x: 0, y: -100 } }),
          item('cam', { kind: 'camera', camera: { focusActorId: actor.id } }),
        ],
      },
    });
    const cam = () => h.present.scenes[0]!.items.find((i) => i.id === 'cam')!;
    expect(cam().rotationDeg).toBeCloseTo(0);
    h = reducer(h, { type: 'scene', sceneId, action: { type: 'move', id: 'tok', pos: { x: 0, y: 100 } } });
    expect(cam().rotationDeg).toBeCloseTo(180);
  });
});

it('turns a light aimed at an actor to face them', () => {
  const actor = item('a', { kind: 'person', actorId: 'act1', pos: { x: 0, y: 100 } });
  const lamp = item('l', { kind: 'light', light: { aimActorId: 'act1' } });
  expect(applyCameraFocus([actor, lamp])[1]!.rotationDeg).toBeCloseTo(180); // actor is below
});

describe('project', () => {
  it('keeps actors across scenes and removes them everywhere on delete', () => {
    const p = newProject();
    const actor = newActor([]);
    let h: History = { past: [], present: p, future: [] };
    h = reducer(h, { type: 'addActor', actor });
    h = reducer(h, { type: 'addScene' });
    expect(h.present.scenes).toHaveLength(2);
    expect(h.present.scenes[1]!.name).toBe('Scene 2');
    for (const s of h.present.scenes) {
      h = reducer(h, {
        type: 'scene',
        sceneId: s.id,
        action: { type: 'add', setItems: [], items: [item(`t-${s.id}`, { kind: 'person', actorId: actor.id })] },
      });
    }
    h = reducer(h, { type: 'deleteActor', id: actor.id });
    expect(h.present.actors).toHaveLength(0);
    expect(h.present.scenes.every((s) => s.items.length === 0)).toBe(true);
  });

  it('resets a scene to its template layout, or to empty without one', () => {
    const p = newProject();
    const sceneId = p.scenes[0]!.id;
    let h: History = { past: [], present: p, future: [] };
    const scene = () => h.present.scenes[0]!;
    h = reducer(h, { type: 'scene', sceneId, action: { type: 'add', setItems: [], items: [item('x', {})] } });
    h = reducer(h, { type: 'scene', sceneId, action: { type: 'reset' } });
    expect(scene().items).toHaveLength(0);
    h = reducer(h, { type: 'scene', sceneId, action: { type: 'applyTemplate', setItems: [], items: [item('t', { pos: { x: 0, y: 0 } })] } });
    h = reducer(h, { type: 'scene', sceneId, action: { type: 'move', id: 't', pos: { x: 99, y: 0 } } });
    h = reducer(h, { type: 'scene', sceneId, action: { type: 'add', setItems: [], items: [item('extra', {})] } });
    h = reducer(h, { type: 'scene', sceneId, action: { type: 'reset' } });
    expect(scene().items.map((i) => [i.id, i.pos.x])).toEqual([['t', 0]]);
    h = reducer(h, { type: 'undo' });
    expect(scene().items).toHaveLength(2);
  });

  it('never deletes the last scene', () => {
    const p = newProject();
    const h = reducer({ past: [], present: p, future: [] }, { type: 'deleteScene', id: p.scenes[0]!.id });
    expect(h.present.scenes).toHaveLength(1);
  });

  it('sorts items into edit modes', () => {
    expect(modeOf(item('l', { kind: 'light' }))).toBe('lights');
    expect(modeOf(item('g', { kind: 'grip' }))).toBe('grip');
    expect(modeOf(item('c', { kind: 'camera' }))).toBe('camera');
    expect(modeOf(item('d', { kind: 'set', catalogId: 'generic.camera.dolly' }))).toBe('camera');
    expect(modeOf(item('p', { kind: 'person' }))).toBe('scene');
    expect(modeOf(item('w', { kind: 'set', catalogId: 'generic.set.wall' }))).toBe('scene');
  });
});

describe('cast roles', () => {
  it('names new people by role and counts each role separately', () => {
    const a = newActor([]);
    expect(a).toMatchObject({ name: 'Actor 1', role: 'actor' });
    const ee = newActor([a], { role: 'interviewee' });
    expect(ee.name).toBe('Interviewee 1');
    expect(newActor([a, ee], { role: 'interviewee' }).name).toBe('Interviewee 2');
    expect(newActor([a, ee], { role: 'interviewer', gender: 'female' })).toMatchObject({ name: 'Interviewer 1', gender: 'female' });
  });
});

describe('gear list', () => {
  it('counts what a scene uses against the list', () => {
    let list: GearList = { id: 'g', name: 'Job', entries: [] };
    list = setQty(list, 'fixture', 'aputure.ls-600d-pro', 2);
    list = setQty(list, 'modifier', 'aputure.light-dome-iii', 1);
    const items = [
      item('1', { kind: 'light', catalogId: 'aputure.ls-600d-pro', light: { modifierIds: ['aputure.light-dome-iii'] } }),
      item('2', { kind: 'light', catalogId: 'aputure.ls-600d-pro' }),
      item('3', { kind: 'light', catalogId: 'generic.light.cob' }),
    ];
    const u = gearUsage(items);
    expect(availability(list, u, 'fixture', 'aputure.ls-600d-pro')).toEqual({ qty: 2, used: 2, left: 0 });
    expect(availability(list, u, 'modifier', 'aputure.light-dome-iii')).toEqual({ qty: 1, used: 1, left: 0 });
    expect(availability(list, u, 'stand', 'x')).toBeNull();
    expect(setQty(list, 'fixture', 'aputure.ls-600d-pro', 0).entries).toHaveLength(1);
  });
});
