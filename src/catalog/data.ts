import amaran from '../../catalog/fixtures/amaran.json';
import aputure from '../../catalog/fixtures/aputure.json';
import godox from '../../catalog/fixtures/godox.json';
import nanlite from '../../catalog/fixtures/nanlite.json';
import nanlux from '../../catalog/fixtures/nanlux.json';
import modifiers from '../../catalog/modifiers/modifiers.json';
import type { Fixture, Modifier } from './schema';

export const FIXTURES = [...aputure, ...amaran, ...godox, ...nanlite, ...nanlux] as Fixture[];
export const MODIFIERS = modifiers as Modifier[];
