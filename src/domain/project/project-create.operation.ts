/**
 * `project_create` (WL-10): creates an execution container in the repository store.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, PROJECT_STATUSES, TAGS, TITLE } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { ProjectCreateHandler } from './project-create.handler.ts';

/** Input schema. */
export const PROJECT_CREATE_INPUT = z.object({
  name: TITLE.describe('Project name'),
  description: DESCRIPTION.describe('Project description'),
  status: z.enum(PROJECT_STATUSES).default('active').describe('Project status'),
  tags: TAGS,
});

/** Parsed input. */
export type ProjectCreateInput = z.infer<typeof PROJECT_CREATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `project_create` operation.
 */
export function projectCreateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'project_create',
    group: 'project',
    action: 'create',
    kind: 'command',
    input: PROJECT_CREATE_INPUT,
    description: 'Create a project (top-level execution container) in the repository store.',
    examples: [{ name: 'checkout-revamp', description: 'Checkout flow rewrite', tags: ['q4'] }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new ProjectCreateHandler(writers),
  };
}
