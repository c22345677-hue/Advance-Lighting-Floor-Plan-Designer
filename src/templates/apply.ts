import { add, normDeg, rotate } from '../model/geometry';
import type { Item, ItemString, Shot, StringAim, Vec2 } from '../model/types';
import { createReader, resolveOptions } from './options';
import type { DraftItem, DraftString, TemplateDefinition, TemplateValues } from './types';

export interface Placement {
  /** World position the template's (0, 0) lands on. */
  origin: Vec2;
  /** Clockwise rotation of the whole template, degrees. */
  rotationDeg?: number;
}

export interface ApplyOptions {
  /** Number given to the first created shot; later shots count up from it. Default 1. */
  firstShotNumber?: number;
  /** ID generator; defaults to crypto.randomUUID. */
  newId?: () => string;
}

export interface AppliedTemplate {
  templateId: string;
  values: TemplateValues;
  setItems: Item[];
  shots: Shot[];
}

/**
 * Build a template with the given (possibly partial) option values and place the result in
 * world space. Everything returned is plain, editable document data.
 */
export function applyTemplate(
  template: TemplateDefinition,
  input: Partial<TemplateValues>,
  placement: Placement,
  opts: ApplyOptions = {},
): AppliedTemplate {
  const values = resolveOptions(template.options, input);
  const draft = template.build(createReader(values));
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const firstShot = opts.firstShotNumber ?? 1;
  const deg = placement.rotationDeg ?? 0;
  const pt = (p: Vec2): Vec2 => add(placement.origin, rotate(p, deg));

  const placeItem = (d: DraftItem): Item => {
    const item: Item = structuredClone({ ...d, id: newId() });
    item.pos = pt(d.pos);
    item.rotationDeg = normDeg(d.rotationDeg + deg);
    if (item.path) item.path.points = item.path.points.map(pt);
    if (item.blocking) item.blocking.marks = item.blocking.marks.map(pt);
    return item;
  };

  const placeAim = (a: StringAim): StringAim => {
    switch (a.mode) {
      case 'parallel':
        return { mode: 'parallel', angleDeg: normDeg(a.angleDeg + deg) };
      case 'target':
        return { mode: 'target', target: pt(a.target) };
      case 'normal':
        return { ...a };
    }
  };

  const placeString = (d: DraftString): ItemString => {
    const s: ItemString = structuredClone({ ...d, id: newId() });
    s.path = {
      start: pt(d.path.start),
      end: pt(d.path.end),
      handles: d.path.handles.map(pt),
    };
    s.aim = placeAim(d.aim);
    return s;
  };

  return {
    templateId: template.id,
    values,
    setItems: (draft.setItems ?? []).map(placeItem),
    shots: draft.shots.map((s, i) => ({
      id: newId(),
      number: String(firstShot + i),
      name: s.name,
      items: s.items.map(placeItem),
      strings: (s.strings ?? []).map(placeString),
    })),
  };
}
