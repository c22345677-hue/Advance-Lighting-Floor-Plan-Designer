import type { Item, ItemString } from '../model/types';

// ---- Option definitions -------------------------------------------------------------

export interface NumberOption {
  type: 'number';
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number; // default 1
  unit?: string; // display only, e.g. "cm"
}

export interface SelectOption {
  type: 'select';
  key: string;
  label: string;
  default: string;
  choices: { value: string; label: string }[];
}

export interface BooleanOption {
  type: 'boolean';
  key: string;
  label: string;
  default: boolean;
}

export type ScalarOption = NumberOption | SelectOption | BooleanOption;

/**
 * A group of options repeated once per element, sized by an earlier number option.
 * E.g. `countFrom: 'cameras'` gives every camera its own settings.
 */
export interface RepeatOption {
  type: 'repeat';
  key: string;
  label: string;
  countFrom: string;
  itemLabel: string; // "{n}" is replaced with the 1-based index, e.g. "Camera {n}"
  options: ScalarOption[];
}

export type OptionDef = ScalarOption | RepeatOption;

// ---- Option values ------------------------------------------------------------------

export type ScalarValue = number | string | boolean;
export type ScalarValues = Record<string, ScalarValue>;
export type TemplateValues = Record<string, ScalarValue | ScalarValues[]>;

// ---- Template output ----------------------------------------------------------------

/** Items as a template creates them: local coordinates around (0, 0), no IDs yet. */
export type DraftItem = Omit<Item, 'id'>;
export type DraftString = Omit<ItemString, 'id'>;

export interface DraftShot {
  name: string;
  items: DraftItem[];
  strings?: DraftString[];
}

export interface TemplateDraft {
  /** Shared set-layer items (walls, furniture, screens). */
  setItems?: DraftItem[];
  /** One entry per setup the template creates. */
  shots: DraftShot[];
}

// ---- Template -----------------------------------------------------------------------

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  /** Production types it is offered for (picked first in the Templates panel). */
  kinds: ('narrative' | 'doc')[];
  /** True until its real layout has been defined; the UI can label it "draft". */
  placeholder?: boolean;
  options: OptionDef[];
  build(options: OptionReader): TemplateDraft;
}

/** Typed access to resolved option values inside `build()`. */
export interface OptionReader {
  number(key: string): number;
  select(key: string): string;
  boolean(key: string): boolean;
  repeat(key: string): OptionReader[];
}
