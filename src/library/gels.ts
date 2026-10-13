// Rosco gels by name and number. Colour correction gels shift colour temperature by a mired
// amount; green/magenta corrections add a tint; colour effect gels filter the light to their
// colour. Swatches are on-screen approximations, not measured transmission.

export type GelGroup = 'cto' | 'ctb' | 'green' | 'colour';

export interface Gel {
  id: string;
  /** Rosco number as printed, e.g. "3407" (Cinegel) or "R02" (Roscolux). */
  number: string;
  name: string;
  group: GelGroup;
  /** Colour temperature shift in mireds (+ warmer, − cooler). */
  mired?: number;
  /** Swatch / filter colour, #rrggbb. */
  color: string;
}

export const GEL_GROUP_LABEL: Record<GelGroup, string> = {
  cto: 'Warming (CTO)',
  ctb: 'Cooling (CTB)',
  green: 'Green / magenta correction',
  colour: 'Colour effects (Roscolux)',
};

const G = (number: string, name: string, group: GelGroup, color: string, mired?: number): Gel => ({
  id: `rosco-${number.toLowerCase()}`,
  number,
  name,
  group,
  color,
  mired,
});

export const GELS: Gel[] = [
  G('3407', 'Full CTO', 'cto', '#ffb46b', 167),
  G('3408', '½ CTO', 'cto', '#ffcf99', 81),
  G('3409', '¼ CTO', 'cto', '#ffe2c0', 42),
  G('3410', '⅛ CTO', 'cto', '#fff0de', 20),
  G('3202', 'Full CTB', 'ctb', '#8fb4ff', -131),
  G('3203', '¾ CTB', 'ctb', '#a3c2ff', -100),
  G('3204', '½ CTB', 'ctb', '#bfd5ff', -68),
  G('3206', '⅓ CTB', 'ctb', '#cfdfff', -49),
  G('3208', '¼ CTB', 'ctb', '#dde8ff', -30),
  G('3216', '⅛ CTB', 'ctb', '#eef3ff', -12),
  G('3304', 'Tough Plusgreen', 'green', '#b9f0a5'),
  G('3315', '½ Plusgreen', 'green', '#d3f5c6'),
  G('3316', '¼ Plusgreen', 'green', '#e4f9dc'),
  G('3317', '⅛ Plusgreen', 'green', '#f1fcec'),
  G('3308', 'Tough Minusgreen', 'green', '#f5b3e3'),
  G('3313', '½ Minusgreen', 'green', '#f9cdec'),
  G('3314', '¼ Minusgreen', 'green', '#fbdff3'),
  G('3318', '⅛ Minusgreen', 'green', '#fdeff9'),
  G('R02', 'Bastard Amber', 'colour', '#ffc896'),
  G('R09', 'Pale Amber Gold', 'colour', '#ffc678'),
  G('R13', 'Straw Tint', 'colour', '#ffe0a0'),
  G('R21', 'Golden Amber', 'colour', '#ff9f3a'),
  G('R23', 'Orange', 'colour', '#ff7a1a'),
  G('R19', 'Fire', 'colour', '#ff4d1f'),
  G('R26', 'Light Red', 'colour', '#ff2b2b'),
  G('R27', 'Medium Red', 'colour', '#d9001b'),
  G('R33', 'No Color Pink', 'colour', '#ffc7cf'),
  G('R44', 'Middle Rose', 'colour', '#ff7fa8'),
  G('R46', 'Magenta', 'colour', '#e0007a'),
  G('R51', 'Surprise Pink', 'colour', '#e9b7e6'),
  G('R54', 'Special Lavender', 'colour', '#d7c2ff'),
  G('R59', 'Indigo', 'colour', '#4b2bd6'),
  G('R60', 'No Color Blue', 'colour', '#d3e4ff'),
  G('R62', 'Booster Blue', 'colour', '#b7d0ff'),
  G('R64', 'Light Steel Blue', 'colour', '#8cb6ff'),
  G('R68', 'Sky Blue', 'colour', '#4f8dff'),
  G('R74', 'Night Blue', 'colour', '#2f4bd6'),
  G('R80', 'Primary Blue', 'colour', '#1f5cff'),
  G('R89', 'Moss Green', 'colour', '#3ccf5a'),
  G('R90', 'Dark Yellow Green', 'colour', '#2d9b2d'),
  G('R91', 'Primary Green', 'colour', '#13a83a'),
  G('R95', 'Medium Blue Green', 'colour', '#16a8a0'),
];

const BY_ID = new Map(GELS.map((g) => [g.id, g]));
export const gelById = (id: string): Gel | undefined => BY_ID.get(id);
