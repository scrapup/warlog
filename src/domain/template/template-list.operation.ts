/**
 * `template_list` (WL-10): templates, newest first.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { TemplateListHandler } from './template-list.handler.ts';

/** Input schema. */
export const TEMPLATE_LIST_INPUT = z.object({
  include_tasks: z.boolean().optional().describe('Include the task definitions of each template'),
});

/** Parsed input. */
export type TemplateListInput = z.infer<typeof TEMPLATE_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `template_list` operation.
 */
export function templateListOperation(): OperationDefinition {
  return {
    name: 'template_list',
    group: 'template',
    action: 'list',
    kind: 'query',
    input: TEMPLATE_LIST_INPUT,
    description: 'List templates with their task count, newest first; include_tasks adds the task definitions.',
    examples: [{ include_tasks: true }],
    defaultFormat: 'table',
    load: 'full',
    handler: new TemplateListHandler(),
  };
}
