/**
 * `template_apply` (WL-10): creates a template's tasks in an epic, filling `{variable}`s.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TemplateApplyHandler } from './template-apply.handler.ts';

/** Input schema. */
export const TEMPLATE_APPLY_INPUT = z.object({
  template_id: idField('Template ID'),
  epic_id: idField('Epic receiving the tasks'),
  variables: z.record(z.string().min(1).max(64), z.string().max(10_000)).optional().describe('Values of the {variable} placeholders'),
});

/** Parsed input. */
export type TemplateApplyInput = z.infer<typeof TEMPLATE_APPLY_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `template_apply` operation.
 */
export function templateApplyOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'template_apply',
    group: 'template',
    action: 'apply',
    kind: 'command',
    input: TEMPLATE_APPLY_INPUT,
    description: 'Create the tasks of a template in an epic, replacing {variable} placeholders; placeholders without a value are left as is and listed in unresolved.',
    examples: [{ template_id: '01J9Z8Q4N6V2M3K5H7G8F9D0CA', epic_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2', variables: { feature: 'checkout' } }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TemplateApplyHandler(writers),
  };
}
