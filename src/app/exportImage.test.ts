import { describe, expect, it } from 'vitest';
import { fileBase, fileName, nextNumber, safeName } from './exportImage';

describe('export file names', () => {
  it('are project - scene - date - number', () => {
    const base = fileBase('Smith Ad', 'Wide', '2026-10-27');
    expect(fileName(base, 1)).toBe('Smith Ad - Wide - 2026-10-27 - 01.jpg');
    expect(fileBase('', 'Scene 1', '2026-10-27')).toBe('Floor plan - Scene 1 - 2026-10-27');
  });
  it('drop characters file systems refuse', () => {
    expect(safeName('a/b:c?  d.')).toBe('a-b-c- d');
  });
  it('number on from what is already there, for that name only', () => {
    const base = 'P - S - 2026-10-27';
    expect(nextNumber(base, [])).toBe(1);
    expect(nextNumber(base, [`${base} - 01.jpg`, `${base} - 07.jpg`, 'P - Other - 2026-10-27 - 09.jpg'])).toBe(8);
  });
});
