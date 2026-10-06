/**
 * `task_update` (WL-10, WL-13): changes a task; status changes propagate to dependents.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, FORCE, PRIORITIES, TAGS, TASK_STATUSES, TITLE, idField, idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { DUE_DATE, HOURS, SOURCE_REF, TASK_CODE } from './task-fields.ts';
import { TaskUpdateHandler } from './task-update.handler.ts';

/** Input schema. */
export const TASK_UPDATE_INPUT = z.object({
  id: idField('Task ID'),
  title: TITLE.optional().describe('Task title'),
  code: TASK_CODE.optional(),
  description: DESCRIPTION.describe('Task description (refused while locked)'),
  status: z.enum(TASK_STATUSES).optional().describe('Status'),
  priority: z.enum(PRIORITIES).optional().describe('Priority'),
  assigned_to: z.string().max(200).optional().describe('Assignee'),
  estimated_hours: HOURS.optional().describe('Estimated hours'),
  actual_hours: HOURS.optional().describe('Actual hours'),
  due_date: DUE_DATE.optional(),
  source_ref: SOURCE_REF.optional(),
  depends_on: idListField('Task IDs this task depends on (replaces existing)').optional(),
  sort_order: z.number().int().min(0).optional().describe('Manual position within the epic; lower sorts first. Use task_reorder instead of setting this by hand.'),
  tags: TAGS,
  force: FORCE,
});

/** Parsed input. */
export type TaskUpdateInput = z.infer<typeof TASK_UPDATE_INPUT>;

/** Input fields copied to the front matter. */
export const TASK_UPDATE_FIELDS = ['title', 'code', 'status', 'priority', 'assigned_to', 'estimated_hours', 'actual_hours', 'due_date', 'source_ref', 'sort_order', 'tags'] as const;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `task_update` operation.
 */
export function taskUpdateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'task_update',
    group: 'task',
    action: 'update',
    kind: 'command',
    input: TASK_UPDATE_INPUT,
    description:
      'Update a task. Completing it with unfinished subtasks needs force. Replacing depends_on re-evaluates its blocked state; finishing or reopening it re-evaluates its dependents.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', status: 'in_progress', assigned_to: 'agent' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TaskUpdateHandler(writers),
  };
}
