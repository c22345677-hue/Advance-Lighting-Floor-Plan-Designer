// JPEG export: file names, the title strip, and saving into a chosen folder (where the browser
// lets a page pick one) or the Downloads folder.

export interface ExportOptions {
  /** The whole plan fitted in, or just what's on screen. */
  area: 'plan' | 'view';
  /** Standard (2×) or high (4×) resolution. */
  quality: 'standard' | 'high';
  /** Project, scene, date and a scale bar along the bottom. */
  title: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = { area: 'plan', quality: 'standard', title: true };

export const exportPixelRatio = (o: ExportOptions) => (o.quality === 'high' ? 4 : 2);

/** Today as YYYY-MM-DD (local time). */
export function isoDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A name safe on every file system: no slashes, colons and the like, no trailing dots. */
export const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');

/** "Project - Scene - 2026-10-27" (before the number). */
export function fileBase(project: string, scene: string, date = isoDate()): string {
  return [safeName(project) || 'Floor plan', safeName(scene), date].filter(Boolean).join(' - ');
}

export const fileName = (base: string, n: number) => `${base} - ${String(n).padStart(2, '0')}.jpg`;

/** The next free number for `base`, given the names already there (folder) or saved so far. */
export function nextNumber(base: string, taken: Iterable<string>): number {
  let max = 0;
  const pre = `${base} - `;
  for (const name of taken) {
    if (!name.startsWith(pre)) continue;
    const m = /^(\d+)\.jpe?g$/i.exec(name.slice(pre.length));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** Pick a round scale-bar length that draws between ~80 and ~240 px at `pxPerCm`. */
function scaleBar(pxPerCm: number): { cm: number; px: number } {
  for (const cm of [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (cm * pxPerCm >= 80) return { cm, px: cm * pxPerCm };
  return { cm: 5000, px: 5000 * pxPerCm };
}

/**
 * The plan as a JPEG: on the plan's own background, with the title strip along the bottom
 * when asked for. `pxPerCm` is the image's scale, for the scale bar.
 */
export async function composeJpeg(
  plan: HTMLCanvasElement,
  o: { title: string[] | null; pxPerCm: number; bg: string; ink: string; k: number },
): Promise<Blob> {
  const strip = o.title ? Math.round(44 * o.k) : 0;
  const c = document.createElement('canvas');
  c.width = plan.width;
  c.height = plan.height + strip;
  const g = c.getContext('2d')!;
  g.fillStyle = o.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(plan, 0, 0);
  if (o.title) {
    const y = plan.height;
    const pad = 14 * o.k;
    g.fillStyle = o.ink;
    g.globalAlpha = 0.08;
    g.fillRect(0, y, c.width, strip);
    g.globalAlpha = 1;
    g.textBaseline = 'middle';
    const mid = y + strip / 2;
    const [head, ...rest] = o.title;
    g.font = `600 ${15 * o.k}px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif`;
    g.fillText(head ?? '', pad, mid);
    let x = pad + g.measureText(head ?? '').width;
    g.font = `400 ${14 * o.k}px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif`;
    for (const t of rest) {
      const s = `  ·  ${t}`;
      g.fillText(s, x, mid);
      x += g.measureText(s).width;
    }
    // Scale bar at the right.
    const bar = scaleBar(o.pxPerCm);
    const label = bar.cm >= 100 ? `${bar.cm / 100} m` : `${bar.cm} cm`;
    const lw = g.measureText(label).width;
    const x1 = c.width - pad - lw - 8 * o.k;
    const x0 = x1 - bar.px;
    if (x0 > x + pad) {
      g.fillText(label, x1 + 8 * o.k, mid);
      g.fillRect(x0, mid - 1.5 * o.k, bar.px, 3 * o.k);
      g.fillRect(x0, mid - 6 * o.k, 2 * o.k, 12 * o.k);
      g.fillRect(x1 - 2 * o.k, mid - 6 * o.k, 2 * o.k, 12 * o.k);
    }
  }
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Could not make the image'))), 'image/jpeg', 0.92));
}

// ---- Where files go ------------------------------------------------------------------------

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  values?: () => AsyncIterable<FileSystemHandle>;
};

/** Can this browser save into a folder the user picks? (Desktop Chrome and Edge, not phones.) */
export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const DB = 'lfpd.export';
function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function kv<T>(key: string, value?: T | null): Promise<T | undefined> {
  const d = await db();
  return new Promise((ok, fail) => {
    const t = d.transaction('kv', value === undefined ? 'readonly' : 'readwrite');
    const s = t.objectStore('kv');
    const r = value === undefined ? s.get(key) : value === null ? s.delete(key) : s.put(value, key);
    r.onsuccess = () => ok(value === undefined ? (r.result as T) : undefined);
    r.onerror = () => fail(r.error);
  });
}

/** The folder chosen for exports, if any. */
export async function exportFolder(): Promise<DirHandle | null> {
  if (!canPickFolder()) return null;
  try {
    return ((await kv<DirHandle>('folder')) as DirHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Ask for a folder to save into; null if cancelled. */
export async function chooseExportFolder(): Promise<DirHandle | null> {
  try {
    const h = (await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite', id: 'lfpd-export' })) as DirHandle;
    await kv('folder', h);
    return h;
  } catch {
    return null;
  }
}

export const clearExportFolder = () => kv('folder', null).catch(() => undefined);

const COUNT_KEY = 'lfpd.exportNames.v1';
const savedNames = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(COUNT_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const rememberName = (name: string) => {
  try {
    localStorage.setItem(COUNT_KEY, JSON.stringify([...savedNames().slice(-500), name]));
  } catch {
    // Numbering just starts over without storage.
  }
};

/**
 * Save the image as `base - NN.jpg`, NN the next free number: into the chosen folder when there
 * is one (and it's still allowed), else to Downloads. Returns where it went.
 */
export async function saveJpeg(blob: Blob, base: string): Promise<{ name: string; folder: string | null }> {
  const dir = await exportFolder();
  if (dir) {
    let perm: PermissionState = (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (perm !== 'granted') perm = (await dir.requestPermission?.({ mode: 'readwrite' }).catch(() => 'denied' as const)) ?? 'denied';
    if (perm === 'granted') {
      const names: string[] = [];
      if (dir.values) for await (const h of dir.values()) names.push(h.name);
      const name = fileName(base, nextNumber(base, names));
      const f = await dir.getFileHandle(name, { create: true });
      const w = await f.createWritable();
      await w.write(blob);
      await w.close();
      return { name, folder: dir.name };
    }
  }
  const name = fileName(base, nextNumber(base, savedNames()));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  rememberName(name);
  return { name, folder: null };
}
