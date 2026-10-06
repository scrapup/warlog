/**
 * `template_update` (WL-10): edits a template in place; `tasks` replaces the whole list.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, TITLE, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TEMPLATE_TASKS } from './template-fields.ts';
import { TemplateUpdateHandler } from './template-update.handler.ts';

/** Input schema. */
export const TEMPLATE_UPDATE_INPUT = z.object({
  id: idField('Template ID'),
  name: TITLE.optional().describe('New name (unique)'),
  description: DESCRIPTION.describe('New description'),
  tasks: TEMPLATE_TASKS.optional().describe('New task definitions (replace the whole list)'),
});

/** Parsed input. */
export type TemplateUpdateInput = z.infer<typeof TEMPLATE_UPDATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `template_update` operation.
 */
export function templateUpdateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'template_update',
    group: 'template',
    action: 'update',
    kind: 'command',
    input: TEMPLATE_UPDATE_INPUT,
    description: 'Edit a template in place (its id is kept). Only the fields passed change; tasks replaces the whole list.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0CA', name: 'rt-cycle-v2' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TemplateUpdateHandler(writers),
  };
}
