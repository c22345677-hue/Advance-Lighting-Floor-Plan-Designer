import { greenScreen } from './library/greenScreen';
import { interview } from './library/interview';
import { teleprompter } from './library/teleprompter';
import { carInterior, dialogue, dinnerTable, walkAndTalk } from './library/narrative';
import { tabletop } from './library/tabletop';
import { validateDefinition } from './options';
import type { TemplateDefinition } from './types';

// To add a template: create a file in ./library and list it here.
const TEMPLATES: TemplateDefinition[] = [interview, teleprompter, dialogue, dinnerTable, carInterior, walkAndTalk, greenScreen, tabletop];

const byId = new Map<string, TemplateDefinition>();
for (const t of TEMPLATES) {
  validateDefinition(t);
  if (byId.has(t.id)) throw new Error(`Duplicate template id "${t.id}"`);
  byId.set(t.id, t);
}

export const listTemplates = (): readonly TemplateDefinition[] => TEMPLATES;

export const getTemplate = (id: string): TemplateDefinition | undefined => byId.get(id);
