// Project files: a whole project (all scenes and the cast) plus the gear list it uses, as one
// JSON file that can be moved between devices by Drive, email or USB.
import type { GearList } from './gearList';
import type { Project } from './project';

export const PROJECT_FILE_EXT = '.floorplan.json';

interface ProjectFile {
  app: 'lighting-floor-plan-designer';
  version: 1;
  savedAt: string;
  project: Project;
  gearList?: GearList;
}

export function projectFileName(p: Project): string {
  const safe = (p.name || 'Untitled project').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'project';
  return `${safe}${PROJECT_FILE_EXT}`;
}

export function toProjectFile(project: Project, gearLists: readonly GearList[]): string {
  const file: ProjectFile = {
    app: 'lighting-floor-plan-designer',
    version: 1,
    savedAt: new Date().toISOString(),
    project,
    gearList: gearLists.find((l) => l.id === project.gearListId),
  };
  return JSON.stringify(file, null, 2);
}

export type OpenResult = { ok: true; project: Project; gearList?: GearList } | { ok: false; error: string };

/**
 * Reads a project file. The project gets a fresh id (`newId`) so opening a file never
 * overwrites a project already on this device.
 */
export function parseProjectFile(text: string, newId: string): OpenResult {
  let data: Partial<ProjectFile>;
  try {
    data = JSON.parse(text) as Partial<ProjectFile>;
  } catch {
    return { ok: false, error: "This file isn't a floor plan project." };
  }
  if (data?.app !== 'lighting-floor-plan-designer' || !data.project) return { ok: false, error: "This file isn't a floor plan project." };
  if (typeof data.version !== 'number' || data.version > 1) return { ok: false, error: 'This project was saved by a newer version of the app.' };
  const p = data.project;
  if (!Array.isArray(p.scenes) || p.scenes.length === 0 || !Array.isArray(p.actors)) return { ok: false, error: 'This project file is damaged.' };
  for (const s of p.scenes) if (!Array.isArray(s.items) || !Array.isArray(s.setItems)) return { ok: false, error: 'This project file is damaged.' };
  const gearList = data.gearList && Array.isArray(data.gearList.entries) ? data.gearList : undefined;
  return { ok: true, project: { ...p, id: newId }, gearList };
}
