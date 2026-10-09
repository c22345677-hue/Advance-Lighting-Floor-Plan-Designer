// Local persistence (this device only). Google Drive sync replaces this in Phase 5.
import type { GearList } from '../model/gearList';
import { newProject, newScene, type Project } from '../model/project';
import type { Item } from '../model/types';

export interface ProjectMeta {
  id: string;
  name: string;
  updated: number;
}

const INDEX = 'lfpd.projects.v1';
const LAST = 'lfpd.lastProject.v1';
const GEAR = 'lfpd.gearLists.v1';
const LEGACY_PLAN = 'lfpd.plan.v1';
const projectKey = (id: string) => `lfpd.project.${id}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the work isn't kept between visits.
  }
}

export const listProjects = (): ProjectMeta[] =>
  (read<ProjectMeta[]>(INDEX) ?? []).sort((a, b) => b.updated - a.updated);

export function loadProject(id: string): Project | null {
  const p = read<Project>(projectKey(id));
  return p && Array.isArray(p.scenes) && p.scenes.length > 0 && Array.isArray(p.actors) ? p : null;
}

export function saveProject(p: Project): void {
  write(projectKey(p.id), p);
  const index = listProjects().filter((m) => m.id !== p.id);
  write(INDEX, [{ id: p.id, name: p.name, updated: Date.now() }, ...index]);
  write(LAST, p.id);
}

export function deleteProject(id: string): void {
  try {
    localStorage.removeItem(projectKey(id));
  } catch {
    // ignore
  }
  write(
    INDEX,
    listProjects().filter((m) => m.id !== id),
  );
}

/** The project to open on start: the last one used, else the plan from the first test build. */
export function loadStartProject(): Project | null {
  const last = read<string>(LAST);
  const p = last ? loadProject(last) : null;
  if (p) return p;
  const first = listProjects()[0];
  const q = first ? loadProject(first.id) : null;
  if (q) return q;
  const legacy = read<{ setItems: Item[]; items: Item[] }>(LEGACY_PLAN);
  if (legacy && Array.isArray(legacy.items)) {
    const proj = newProject('My first plan');
    proj.scenes = [{ ...newScene('Scene 1'), setItems: legacy.setItems ?? [], items: legacy.items }];
    return proj;
  }
  return null;
}

export const loadGearLists = (): GearList[] => read<GearList[]>(GEAR) ?? [];
export const saveGearLists = (lists: GearList[]): void => write(GEAR, lists);
