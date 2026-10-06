/**
 * `task_list` (WL-10): tasks with filters, ordering and subtask/dependency counts.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { BRANCH_FILTER, INCLUDE_ARCHIVED, PRIORITIES, PROJECT_SCOPE, TASK_STATUSES, idField, limitField } from '../shared/fields.ts';
import { TaskListHandler } from './task-list.handler.ts';
import { TASK_SORTS } from './task-order.ts';

/** Input schema. */
export const TASK_LIST_INPUT = z.object({
  epic_id: idField('Filter by epic (omit for all tasks)').optional(),
  story_id: idField('Filter by story').optional(),
  project_id: PROJECT_SCOPE,
  status: z.enum(TASK_STATUSES).optional().describe('Filter by status'),
  priority: z.enum(PRIORITIES).optional().describe('Filter by priority'),
  assigned_to: z.string().max(200).optional().describe('Filter by assignee'),
  tag: z.string().max(64).optional().describe('Filter by tag'),
  branch: BRANCH_FILTER,
  include_archived: INCLUDE_ARCHIVED,
  include_deleted: z.boolean().default(false).describe('Include removed tasks.'),
  sort_by: z.enum(TASK_SORTS).optional().describe('priority (critical first), created (newest), due_date (earliest), status (actionable first), manual. Omit to follow task_reorder, falling back to priority.'),
  limit: limitField(50),
});

/** Parsed input. */
export type TaskListInput = z.infer<typeof TASK_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `task_list` operation.
 */
export function taskListOperation(): OperationDefinition {
  return {
    name: 'task_list',
    group: 'task',
    action: 'list',
    kind: 'query',
    input: TASK_LIST_INPUT,
    description:
      'List tasks; without epic_id, across all epics. Rows include subtask and dependency counts; descriptions are omitted (task_get for full). branch="current" restricts to the active git branch.',
    examples: [{ epic_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2', status: 'todo' }],
    defaultFormat: 'table',
    load: 'full',
    handler: new TaskListHandler(),
  };
}
