// Writes catalog/{fixtures,modifiers,stands}.csv for reviewing the catalogue in a spreadsheet.
import { writeFileSync } from 'node:fs';
import { bestBatteryOutputPct, isFullyWeatherSealed, isWeatherSealed, riggingPicks, sizeClass } from '../src/catalog/classify';
import { FIXTURES, MODIFIERS, STANDS } from '../src/catalog/data';
import { modifiersFor } from '../src/catalog/modifiers';

const picks = riggingPicks(FIXTURES);
const cols = [
  'Brand', 'Model', 'Type', 'Mount', 'Size class', 'Best for rigging', 'Power draw (W)', 'Head weight (kg)',
  'External PSU', 'PSU weight (kg)', 'Size L×W×H (cm)', 'Head cable (m)', 'Fixture IP', 'PSU IP',
  'Fixture weather sealed', 'Fully weather sealed', 'Batteries', 'Best battery output (%)', 'Fitting modifiers', 'Notes', 'Source',
];
const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const yn = (b: boolean) => (b ? 'yes' : '');
const size = (c: { l: number | null; w: number | null; h: number | null } | null) =>
  c ? [c.l, c.w, c.h].map((v) => v ?? '?').join(' × ') : null;
const save = (file: string, head: string[], body: unknown[][]) =>
  writeFileSync(file, '\ufeff' + [head, ...body].map((r) => r.map(esc).join(',')).join('\n') + '\n');
const rows = [...FIXTURES]
  .sort((a, b) => a.brand.localeCompare(b.brand) || (a.powerW ?? 0) - (b.powerW ?? 0))
  .map((f) => [
    f.brand, f.model, f.family, f.mount, sizeClass(f), yn(picks.has(f.id)), f.powerW, f.weightKg,
    f.psu.external ? 'yes' : 'no', f.psu.weightKg,
    size(f.sizeCm),
    f.headCableM, f.ipRating, f.psu.ipRating, yn(isWeatherSealed(f.ipRating)), yn(isFullyWeatherSealed(f)),
    f.batteries === null ? 'not stated' : f.batteries.length === 0 ? 'mains only'
      : f.batteries.map((b) => `${b.type}${b.maxOutputPct !== null ? ` (${b.maxOutputPct}%)` : ''}${b.note ? ` – ${b.note}` : ''}`).join('; '),
    bestBatteryOutputPct(f), modifiersFor(f, MODIFIERS).length || '', f.notes, f.sources.join('; '),
  ]);
save('catalog/fixtures.csv', cols, rows);
console.log(`wrote catalog/fixtures.csv (${rows.length} fixtures, ${picks.size} rigging picks)`);

const byId = new Map(FIXTURES.map((f) => [f.id, f.model]));
const mods = [...MODIFIERS]
  .sort((a, b) => a.brand.localeCompare(b.brand) || a.type.localeCompare(b.type) || a.model.localeCompare(b.model))
  .map((m) => [
    m.brand, m.model, m.type, m.weightKg, size(m.sizeCm), m.mounts.join('; '),
    m.fitsFixtureIds.map((id) => byId.get(id) ?? id).join('; '), m.notes, m.sources.join('; '),
  ]);
save('catalog/modifiers.csv', ['Brand', 'Model', 'Type', 'Weight (kg)', 'Size L×W×H (cm)', 'Mounts', 'Fits only', 'Notes', 'Source'], mods);
console.log(`wrote catalog/modifiers.csv (${mods.length} modifiers)`);

const stands = [...STANDS]
  .sort((a, b) => a.brand.localeCompare(b.brand) || a.type.localeCompare(b.type) || (a.maxHeightCm ?? 0) - (b.maxHeightCm ?? 0))
  .map((s) => [s.brand, s.model, s.type, s.weightKg, s.loadCapacityKg, s.minHeightCm, s.maxHeightCm, s.notes, s.sources.join('; ')]);
save('catalog/stands.csv', ['Brand', 'Model', 'Type', 'Weight (kg)', 'Load capacity (kg)', 'Closed height (cm)', 'Max height (cm)', 'Notes', 'Source'], stands);
console.log(`wrote catalog/stands.csv (${stands.length} stands)`);
