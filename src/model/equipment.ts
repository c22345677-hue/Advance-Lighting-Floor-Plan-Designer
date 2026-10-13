// Equipment list (PLAN.md §2.8–2.10): what a project needs, built from the plan.
//
// Per scene, every placed item is counted, plus optional accessory rules (stingers, sandbags,
// stands…). Gear is reused between scenes, so the project quantity is the MOST any one scene
// needs, not the sum. Kits and hand-added lines come on top, once per project. Users can
// override a quantity or mark a line as owned.
import { fabricById } from '../library/fabrics';
import { libraryItem } from '../library/items';
import { itemFixture, modifierById, powerTotals, standById, standCheck } from './gear';
import type { GearKind, GearList } from './gearList';
import { sceneItems, type Project, type SceneDoc } from './project';
import type { Item } from './types';

export type Dept = 'lighting' | 'grip' | 'electric' | 'camera' | 'expendables' | 'art';

export const DEPTS: { id: Dept; label: string }[] = [
  { id: 'lighting', label: 'Lighting' },
  { id: 'grip', label: 'Grip' },
  { id: 'electric', label: 'Electric' },
  { id: 'camera', label: 'Camera' },
  { id: 'expendables', label: 'Expendables' },
  { id: 'art', label: 'Art / set' },
];

/** What a line is, independent of how many. */
export interface LineInfo {
  key: string;
  dept: Dept;
  name: string;
  /** Short extra info, e.g. "Aputure" or "stand-in: pick the real light". */
  detail?: string;
  /** Weight of one unit, kg (head + external power supply for lights). Null = unknown. */
  unitKg: number | null;
  /** Catalogue reference, for gear-list checks. */
  gear?: { kind: GearKind; id: string };
  /** Not rented (walls, doors…); left out of rental exports by default. */
  notRented?: boolean;
}

// ---- Generic stock (rules, kits and generic grip items share these lines) ------------------

const STOCK = {
  sandbag: { name: 'Sandbag', dept: 'grip' },
  'c-stand': { name: 'C-stand', dept: 'grip' },
  'combo-stand': { name: 'Combo stand', dept: 'grip' },
  'high-roller': { name: 'High roller stand', dept: 'grip' },
  'light-stand': { name: 'Light stand (not chosen yet)', dept: 'grip' },
  'apple-box-set': { name: 'Apple box set', dept: 'grip' },
  ladder: { name: 'Ladder', dept: 'grip' },
  'stinger-10m': { name: 'Stinger 10 m', dept: 'electric' },
  'power-strip': { name: 'Power strip', dept: 'electric' },
  'distro-32a': { name: 'Distro 32 A', dept: 'electric' },
  'distro-63a': { name: 'Distro 63 A', dept: 'electric' },
  'gaffer-tape': { name: 'Gaffer tape (roll)', dept: 'expendables' },
  'black-wrap': { name: 'Black wrap (roll)', dept: 'expendables' },
} as const satisfies Record<string, { name: string; dept: Dept }>;

export type StockId = keyof typeof STOCK;

const stock = (id: StockId): LineInfo => ({ key: `stock:${id}`, dept: STOCK[id].dept, name: STOCK[id].name, unitKg: null });

/** Generic library items that are plain stock. */
const LIBRARY_STOCK: Record<string, StockId> = {
  'generic.grip.sandbag': 'sandbag',
  'generic.grip.c-stand': 'c-stand',
};

// ---- Kits ----------------------------------------------------------------------------------

export interface Kit {
  id: string;
  name: string;
  contents: [StockId, number][];
}

export const KITS: Kit[] = [
  {
    id: 'small',
    name: 'Small production',
    contents: [
      ['sandbag', 10],
      ['stinger-10m', 6],
      ['power-strip', 2],
      ['apple-box-set', 1],
      ['c-stand', 4],
      ['gaffer-tape', 4],
    ],
  },
  {
    id: 'medium',
    name: 'Medium production',
    contents: [
      ['sandbag', 30],
      ['stinger-10m', 15],
      ['power-strip', 6],
      ['distro-32a', 2],
      ['apple-box-set', 2],
      ['c-stand', 12],
      ['gaffer-tape', 8],
      ['black-wrap', 2],
    ],
  },
  {
    id: 'large',
    name: 'Large production',
    contents: [
      ['sandbag', 60],
      ['stinger-10m', 30],
      ['power-strip', 10],
      ['distro-32a', 4],
      ['distro-63a', 1],
      ['apple-box-set', 4],
      ['c-stand', 24],
      ['gaffer-tape', 16],
      ['black-wrap', 4],
      ['ladder', 2],
    ],
  },
];

// ---- Per-scene counting ----------------------------------------------------------------------

type Counts = Map<string, { info: LineInfo; qty: number }>;

function bump(c: Counts, info: LineInfo, n = 1) {
  const e = c.get(info.key);
  if (e) e.qty += n;
  else c.set(info.key, { info, qty: n });
}

const kgSum = (...v: (number | null | undefined)[]): number | null =>
  v.some((x) => x == null) ? null : Math.round(v.reduce<number>((a, b) => a + (b as number), 0) * 100) / 100;

/** Lights that sit on a table or set, not a stand: practicals, bulbs and pocket lights. */
function needsStand(item: Item): boolean {
  const f = itemFixture(item);
  if (f) return f.family !== 'bulb' && f.family !== 'pocket';
  return item.catalogId !== 'generic.light.practical';
}

/** Everything one scene needs. `rules` adds the accessory rules (stingers, sandbags, stands…). */
export function sceneCounts(scene: SceneDoc, rules = true): Counts {
  const c: Counts = new Map();
  for (const item of sceneItems(scene)) {
    if (item.kind === 'person' || item.kind === 'note') continue;
    const lib = libraryItem(item.catalogId);

    if (item.kind === 'light') {
      const f = itemFixture(item);
      if (f) {
        bump(c, {
          key: `fixture:${f.id}`,
          dept: 'lighting',
          name: `${f.brand} ${f.model}`,
          detail: f.psu.external ? 'incl. power supply' : undefined,
          unitKg: f.psu.external ? kgSum(f.weightKg, f.psu.weightKg) : f.weightKg,
          gear: { kind: 'fixture', id: f.id },
        });
      } else {
        bump(c, {
          key: `standin:${item.catalogId}`,
          dept: 'lighting',
          name: lib?.name ?? 'Light',
          detail: 'stand-in: pick the real light',
          unitKg: null,
        });
      }
      for (const id of item.light?.modifierIds ?? []) {
        const m = modifierById(id);
        if (m) bump(c, { key: `modifier:${m.id}`, dept: 'lighting', name: `${m.brand} ${m.model}`, unitKg: m.weightKg, gear: { kind: 'modifier', id: m.id } });
      }
      const s = standById(item.light?.standId);
      if (s) bump(c, { key: `stand:${s.id}`, dept: 'grip', name: `${s.brand} ${s.model}`, unitKg: s.weightKg, gear: { kind: 'stand', id: s.id } });
      if (rules) {
        bump(c, stock('stinger-10m'));
        if (needsStand(item)) {
          if (!s) bump(c, stock('light-stand'));
          bump(c, stock('sandbag'), 2);
        }
      }
      continue;
    }

    const stockId = item.catalogId ? LIBRARY_STOCK[item.catalogId] : undefined;
    if (stockId) {
      bump(c, stock(stockId));
      continue;
    }

    if (item.kind === 'grip' && lib) {
      bump(c, { key: `lib:${lib.id}`, dept: 'grip', name: lib.name, unitKg: null });
      const fabric = fabricById(item.grip?.fabric);
      if (fabric) {
        const size = lib.name.replace(/^Frame\s*/, '');
        bump(c, { key: `fabric:${lib.id}:${fabric.id}`, dept: 'grip', name: `${size} ${fabric.name}`, detail: 'frame fabric', unitKg: null });
      }
      if (rules) {
        const id = lib.id;
        if (id === 'generic.grip.frame-8x8' || id === 'generic.grip.frame-12x12') {
          bump(c, stock('high-roller'), 2);
          bump(c, stock('sandbag'), 4);
        } else if (id === 'generic.grip.frame-6x6') {
          bump(c, stock('combo-stand'), 2);
          bump(c, stock('sandbag'), 2);
        } else if (id === 'generic.grip.flag' || id === 'generic.grip.frame-4x4') {
          bump(c, stock('c-stand'));
          bump(c, stock('sandbag'));
        }
      }
      continue;
    }

    if (lib?.category === 'camera') {
      bump(c, { key: `lib:${lib.id}`, dept: 'camera', name: lib.name, unitKg: null });
      continue;
    }

    if (lib) {
      const chroma = lib.id === 'generic.set.green-screen';
      bump(c, {
        key: `lib:${lib.id}`,
        dept: chroma ? 'grip' : 'art',
        name: chroma ? 'Green screen backdrop' : lib.name,
        unitKg: null,
        notRented: !chroma && (lib.category === 'set' || lib.category === 'doors' || lib.category === 'windows'),
      });
    }
  }
  return c;
}

// ---- Project list ----------------------------------------------------------------------------

/** User edits, saved with the project. */
export interface EquipmentState {
  /** Accessory rules on (default) or off. */
  rules?: boolean;
  /** Kit id → how many times it was added. */
  kits?: Record<string, number>;
  manual?: { id: string; dept: Dept; name: string; qty: number }[];
  overrides?: Record<string, { qty?: number; owned?: boolean }>;
}

export interface EquipmentLine extends LineInfo {
  /** From the plan: the most any one selected scene needs. */
  plan: number;
  /** Which scenes use it, and how many each. */
  scenes: { name: string; qty: number }[];
  /** From added kits. */
  kit: number;
  manual: boolean;
  /** Final quantity (an override replaces plan + kit). */
  qty: number;
  edited: boolean;
  owned: boolean;
}

export function buildEquipment(project: Project, sceneIds?: readonly string[]): EquipmentLine[] {
  const eq = project.equipment ?? {};
  const scenes = project.scenes.filter((s) => !sceneIds || sceneIds.includes(s.id));
  const lines = new Map<string, EquipmentLine>();
  const line = (info: LineInfo): EquipmentLine => {
    let l = lines.get(info.key);
    if (!l) {
      l = { ...info, plan: 0, scenes: [], kit: 0, manual: false, qty: 0, edited: false, owned: false };
      lines.set(info.key, l);
    }
    return l;
  };

  for (const s of scenes) {
    for (const { info, qty } of sceneCounts(s, eq.rules ?? true).values()) {
      const l = line(info);
      l.plan = Math.max(l.plan, qty);
      l.scenes.push({ name: s.name, qty });
    }
  }
  for (const kit of KITS) {
    const times = eq.kits?.[kit.id] ?? 0;
    for (const [id, n] of kit.contents) if (times > 0) line(stock(id)).kit += n * times;
  }
  for (const m of eq.manual ?? []) {
    const l = line({ key: `manual:${m.id}`, dept: m.dept, name: m.name, unitKg: null });
    l.manual = true;
    l.plan = m.qty;
  }

  const out = [...lines.values()];
  for (const l of out) {
    const o = eq.overrides?.[l.key];
    l.qty = o?.qty ?? l.plan + l.kit;
    l.edited = o?.qty != null;
    l.owned = !!o?.owned;
  }
  const order = new Map(DEPTS.map((d, i) => [d.id, i]));
  return out
    .filter((l) => l.qty > 0 || l.edited)
    .sort((a, b) => order.get(a.dept)! - order.get(b.dept)! || a.name.localeCompare(b.name));
}

// ---- Checks, totals, power -----------------------------------------------------------------

export function equipmentWarnings(project: Project, lines: EquipmentLine[], gearList: GearList | null, sceneIds?: readonly string[]): string[] {
  const w: string[] = [];
  for (const s of project.scenes.filter((x) => !sceneIds || sceneIds.includes(x.id))) {
    for (const i of sceneItems(s)) {
      if (i.kind === 'light' && standCheck(i) === 'over') {
        w.push(`${s.name}: ${i.light?.unitId ?? 'a light'} is too heavy for its stand.`);
      }
    }
  }
  const standIns = lines.filter((l) => l.key.startsWith('standin:')).reduce((n, l) => n + l.qty, 0);
  if (standIns > 0) w.push(`${standIns} light${standIns > 1 ? 's are stand-ins' : ' is a stand-in'}: pick the real fixture to get power and weight.`);
  if (gearList) {
    for (const l of lines) {
      if (!l.gear || l.owned) continue;
      const have = gearList.entries.find((e) => e.kind === l.gear!.kind && e.id === l.gear!.id)?.qty ?? 0;
      if (have < l.qty) w.push(have === 0 ? `${l.name} is not on the gear list "${gearList.name}".` : `${l.name}: need ${l.qty}, gear list has ${have}.`);
    }
  }
  return w;
}

/** Known weight of the list (owned lines included: they still travel). */
export function totalWeight(lines: EquipmentLine[]): { kg: number; unknown: number } {
  let kg = 0;
  let unknown = 0;
  for (const l of lines) {
    if (l.unitKg == null) unknown += l.qty;
    else kg += l.unitKg * l.qty;
  }
  return { kg: Math.round(kg * 10) / 10, unknown };
}

/** Standard generator sizes, kVA. */
const GENERATORS_KVA = [2, 3, 5.5, 6.5, 10, 20, 30, 45, 60, 100, 150, 200];

export interface PowerPlan {
  peakW: number;
  peakScene: string | null;
  amps: number;
  /** Lights with no known draw in the peak scene. */
  unknown: number;
  /** Peak + 25 % headroom at power factor 0.8, rounded up to a standard size. */
  generatorKva: number | null;
}

export function powerPlan(project: Project, volts: number, sceneIds?: readonly string[]): PowerPlan {
  let best: PowerPlan = { peakW: 0, peakScene: null, amps: 0, unknown: 0, generatorKva: null };
  for (const s of project.scenes.filter((x) => !sceneIds || sceneIds.includes(x.id))) {
    const t = powerTotals(sceneItems(s), volts);
    if (t.watts > best.peakW || (best.peakScene === null && t.unknown > 0)) {
      best = { peakW: t.watts, peakScene: s.name, amps: t.amps, unknown: t.unknown, generatorKva: null };
    }
  }
  if (best.peakW > 0) {
    const kva = (best.peakW * 1.25) / 1000 / 0.8;
    best.generatorKva = GENERATORS_KVA.find((g) => g >= kva) ?? Math.ceil(kva);
  }
  return best;
}

// ---- Export ------------------------------------------------------------------------------------

export interface ExportOptions {
  /** Leave out lines marked owned (rental list). Default true. */
  rentalOnly?: boolean;
  /** Include art / set lines that aren't rented. Default false. */
  includeNotRented?: boolean;
}

export function exportLines(lines: EquipmentLine[], o: ExportOptions = {}): EquipmentLine[] {
  return lines.filter((l) => (!(o.rentalOnly ?? true) || !l.owned) && ((o.includeNotRented ?? false) || !l.notRented));
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function equipmentCsv(lines: EquipmentLine[], o: ExportOptions = {}): string {
  const dept = new Map(DEPTS.map((d) => [d.id, d.label]));
  const rows = exportLines(lines, o).map((l) => [
    dept.get(l.dept),
    l.qty,
    l.name,
    l.detail ?? '',
    l.unitKg ?? '',
    l.owned ? 'owned' : '',
    l.scenes.map((s) => `${s.name} ×${s.qty}`).join('; '),
  ]);
  const head = ['Department', 'Qty', 'Item', 'Details', 'Unit weight (kg)', 'Owned', 'Scenes'];
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function equipmentText(lines: EquipmentLine[], o: ExportOptions = {}): string {
  const out: string[] = [];
  for (const d of DEPTS) {
    const ls = exportLines(lines, o).filter((l) => l.dept === d.id);
    if (!ls.length) continue;
    out.push(d.label.toUpperCase());
    for (const l of ls) out.push(`${String(l.qty).padStart(3)} × ${l.name}${l.detail ? ` (${l.detail})` : ''}`);
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

