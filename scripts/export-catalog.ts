// Writes catalog/fixtures.csv for reviewing the catalogue in a spreadsheet.
import { writeFileSync } from 'node:fs';
import { bestBatteryOutputPct, isFullyWeatherSealed, isWeatherSealed, riggingPicks, sizeClass } from '../src/catalog/classify';
import { FIXTURES, MODIFIERS } from '../src/catalog/data';
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
const rows = [...FIXTURES]
  .sort((a, b) => a.brand.localeCompare(b.brand) || (a.powerW ?? 0) - (b.powerW ?? 0))
  .map((f) => [
    f.brand, f.model, f.family, f.mount, sizeClass(f), yn(picks.has(f.id)), f.powerW, f.weightKg,
    f.psu.external ? 'yes' : 'no', f.psu.weightKg,
    f.sizeCm ? [f.sizeCm.l, f.sizeCm.w, f.sizeCm.h].map((v) => v ?? '?').join(' × ') : null,
    f.headCableM, f.ipRating, f.psu.ipRating, yn(isWeatherSealed(f.ipRating)), yn(isFullyWeatherSealed(f)),
    f.batteries === null ? 'not stated' : f.batteries.length === 0 ? 'mains only'
      : f.batteries.map((b) => `${b.type}${b.maxOutputPct !== null ? ` (${b.maxOutputPct}%)` : ''}${b.note ? ` – ${b.note}` : ''}`).join('; '),
    bestBatteryOutputPct(f), modifiersFor(f, MODIFIERS).length || '', f.notes, f.sources.join('; '),
  ]);
writeFileSync('catalog/fixtures.csv', '﻿' + [cols, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n');
console.log(`wrote catalog/fixtures.csv (${rows.length} fixtures, ${picks.size} rigging picks)`);
