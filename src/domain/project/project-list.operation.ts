/**
 * `project_list` (WL-10): projects with epic/task counts and completion percentage.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { PROJECT_STATUSES } from '../shared/fields.ts';
import { ProjectListHandler } from './project-list.handler.ts';

/** Input schema. */
export const PROJECT_LIST_INPUT = z.object({
  status: z.enum(PROJECT_STATUSES).optional().describe('Filter by status'),
});

/** Parsed input. */
export type ProjectListInput = z.infer<typeof PROJECT_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `project_list` operation.
 */
export function projectListOperation(): OperationDefinition {
  return {
    name: 'project_list',
    group: 'project',
    action: 'list',
    kind: 'query',
    input: PROJECT_LIST_INPUT,
    description: 'List projects with epic/task counts and completion percentage, newest first. Optionally filter by status.',
    examples: [{ status: 'active' }],
    defaultFormat: 'table',
    load: 'full',
    handler: new ProjectListHandler(),
  };
}
