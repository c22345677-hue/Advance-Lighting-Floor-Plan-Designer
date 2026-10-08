import { greenScreen } from './library/greenScreen';
import { interview } from './library/interview';
import { pieceToCamera } from './library/pieceToCamera';
import { validateDefinition } from './options';
import type { TemplateDefinition } from './types';

// To add a template: create a file in ./library and list it here.
const TEMPLATES: TemplateDefinition[] = [interview, pieceToCamera, greenScreen];

const byId = new Map<string, TemplateDefinition>();
for (const t of TEMPLATES) {
  validateDefinition(t);
  if (byId.has(t.id)) throw new Error(`Duplicate template id "${t.id}"`);
  byId.set(t.id, t);
}

export const listTemplates = (): readonly TemplateDefinition[] => TEMPLATES;

export const getTemplate = (id: string): TemplateDefinition | undefined => byId.get(id);
