import { availability, type Availability, type GearKind, type GearList } from '../model/gearList';

/** The job gear list as the UI sees it: the list, whether picks are limited to it, and scene usage. */
export interface GearScope {
  list: GearList | null;
  limit: boolean;
  usage: Map<string, number>;
}

export const NO_GEAR: GearScope = { list: null, limit: false, usage: new Map() };

/** The active list when picks are limited to it, else null. */
export const limitingList = (g: GearScope): GearList | null => (g.limit ? g.list : null);

export const avail = (g: GearScope, kind: GearKind, id: string): Availability | null =>
  g.list ? availability(g.list, g.usage, kind, id) : null;
