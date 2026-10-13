import { describe, expect, it } from 'vitest';
import { newProject } from './project';
import { parseProjectFile, projectFileName, toProjectFile } from './projectFile';

describe('project files', () => {
  it('round-trips a project with its gear list under a new id', () => {
    const p = { ...newProject('Day 1: Kitchen'), gearListId: 'g1' };
    const text = toProjectFile(p, [{ id: 'g1', name: 'Truck', entries: [] }, { id: 'g2', name: 'Other', entries: [] }]);
    const r = parseProjectFile(text, 'fresh');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.id).toBe('fresh');
    expect(r.project.name).toBe('Day 1: Kitchen');
    expect(r.project.scenes).toEqual(p.scenes);
    expect(r.gearList?.name).toBe('Truck');
  });

  it('refuses other files and newer versions', () => {
    expect(parseProjectFile('not json', 'x').ok).toBe(false);
    expect(parseProjectFile('{"hello":1}', 'x').ok).toBe(false);
    const newer = JSON.stringify({ app: 'lighting-floor-plan-designer', version: 9, project: newProject() });
    expect(parseProjectFile(newer, 'x')).toMatchObject({ ok: false, error: expect.stringMatching(/newer/) });
  });

  it('makes a safe file name', () => {
    expect(projectFileName({ ...newProject('Day 1: Kitchen/Night') })).toBe('Day 1  Kitchen Night.floorplan.json');
  });
});
