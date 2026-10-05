/**
 * `template_delete` (WL-08, WL-10): removes a template (soft).
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TemplateDeleteHandler } from './template-delete.handler.ts';

/** Input schema. */
export const TEMPLATE_DELETE_INPUT = z.object({ id: idField('Template ID') });

/** Parsed input. */
export type TemplateDeleteInput = z.infer<typeof TEMPLATE_DELETE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `template_delete` operation.
 */
export function templateDeleteOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'template_delete',
    group: 'template',
    action: 'delete',
    kind: 'command',
    input: TEMPLATE_DELETE_INPUT,
    description: 'Delete a template (soft: the file is kept, marked deleted; its name becomes free).',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0CA' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new TemplateDeleteHandler(writers),
  };
}
