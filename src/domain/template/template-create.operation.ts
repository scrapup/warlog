/**
 * `template_create` (WL-10): a reusable set of tasks with `{variable}` placeholders.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, TITLE } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TemplateCreateHandler } from './template-create.handler.ts';
import { TEMPLATE_TASKS } from './template-fields.ts';

/** Input schema. */
export const TEMPLATE_CREATE_INPUT = z.object({
  name: TITLE.describe('Template name (unique)'),
  description: DESCRIPTION.describe('Template description'),
  tasks: TEMPLATE_TASKS.describe('Task definitions; {variable} placeholders are filled by template_apply'),
});

/** Parsed input. */
export type TemplateCreateInput = z.infer<typeof TEMPLATE_CREATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `template_create` operation.
 */
export function templateCreateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'template_create',
    group: 'template',
    action: 'create',
    kind: 'command',
    input: TEMPLATE_CREATE_INPUT,
    description: 'Create a reusable task template (stored in the global root, shared by every repository). Titles and descriptions may contain {variable} placeholders.',
    examples: [{ name: 'rt-cycle', tasks: [{ title: 'RT-01 {feature} create/get', priority: 'high' }, { title: 'RT-02 {feature} list' }] }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TemplateCreateHandler(writers),
  };
}
