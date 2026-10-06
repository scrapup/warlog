/**
 * `epic_list` (WL-10): epics of a project with task counts, in manual order.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { BRANCH_FILTER, EPIC_STATUSES, INCLUDE_ARCHIVED, PRIORITIES, idField } from '../shared/fields.ts';
import { EpicListHandler } from './epic-list.handler.ts';

/** Input schema. */
export const EPIC_LIST_INPUT = z.object({
  project_id: idField('Project ID'),
  status: z.enum(EPIC_STATUSES).optional().describe('Filter by status'),
  priority: z.enum(PRIORITIES).optional().describe('Filter by priority'),
  include_archived: INCLUDE_ARCHIVED,
  branch: BRANCH_FILTER,
});

/** Parsed input. */
export type EpicListInput = z.infer<typeof EPIC_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `epic_list` operation.
 */
export function epicListOperation(): OperationDefinition {
  return {
    name: 'epic_list',
    group: 'epic',
    action: 'list',
    kind: 'query',
    input: EPIC_LIST_INPUT,
    description: 'List epics of a project with task counts (task_count, done_count, blocked_count, completion_pct). Archived epics are hidden unless include_archived.',
    examples: [{ project_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C1', branch: 'current' }],
    defaultFormat: 'table',
    load: 'full',
    handler: new EpicListHandler(),
  };
}
