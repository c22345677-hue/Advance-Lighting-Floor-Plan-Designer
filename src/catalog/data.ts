import amaran from '../../catalog/fixtures/amaran.json';
import aputure from '../../catalog/fixtures/aputure.json';
import godox from '../../catalog/fixtures/godox.json';
import nanlite from '../../catalog/fixtures/nanlite.json';
import nanlux from '../../catalog/fixtures/nanlux.json';
import modifiers from '../../catalog/modifiers/modifiers.json';
import standsAmaran from '../../catalog/stands/amaran.json';
import standsAputure from '../../catalog/stands/aputure.json';
import standsGodox from '../../catalog/stands/godox.json';
import standsKupo from '../../catalog/stands/kupo.json';
import standsManfrotto from '../../catalog/stands/manfrotto.json';
import standsMatthews from '../../catalog/stands/matthews.json';
import type { Fixture, Modifier, Stand } from './schema';

export const FIXTURES = [...aputure, ...amaran, ...godox, ...nanlite, ...nanlux] as Fixture[];
export const MODIFIERS = modifiers as Modifier[];
export const STANDS = [
  ...standsGodox,
  ...standsAputure,
  ...standsAmaran,
  ...standsMatthews,
  ...standsKupo,
  ...standsManfrotto,
] as Stand[];
