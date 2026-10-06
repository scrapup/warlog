/**
 * `task_create` (WL-10, WL-12, WL-13): creates a task under an epic and/or a story; unmet
 * dependencies block it automatically.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, PRIORITIES, TAGS, TASK_STATUSES, TITLE, idField, idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TaskCreateHandler } from './task-create.handler.ts';
import { DUE_DATE, HOURS, SOURCE_REF, TASK_CODE } from './task-fields.ts';

/** Input schema. */
export const TASK_CREATE_INPUT = z.object({
  epic_id: idField('Parent epic ID (optional when story_id is given)').optional(),
  story_id: idField('Parent story ID').optional(),
  title: TITLE.describe('Task title'),
  code: TASK_CODE.optional(),
  description: DESCRIPTION.describe('Task description'),
  status: z.enum(TASK_STATUSES).default('todo').describe('Initial status'),
  priority: z.enum(PRIORITIES).default('medium').describe('Priority'),
  assigned_to: z.string().max(200).optional().describe('Assignee name'),
  estimated_hours: HOURS.optional().describe('Estimated hours'),
  due_date: DUE_DATE.optional(),
  source_ref: SOURCE_REF.optional(),
  depends_on: idListField('Task IDs this task depends on').optional(),
  tags: TAGS,
});

/** Parsed input. */
export type TaskCreateInput = z.infer<typeof TASK_CREATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `task_create` operation.
 */
export function taskCreateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'task_create',
    group: 'task',
    action: 'create',
    kind: 'command',
    input: TASK_CREATE_INPUT,
    description:
      'Create a task under an epic and/or a story (epic_id or story_id required). Tasks with unfinished dependencies are blocked automatically and unblocked when they finish.',
    examples: [{ epic_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2', title: 'Validate card token', priority: 'high', depends_on: ['01J9Z8Q4N6V2M3K5H7G8F9D0C4'] }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TaskCreateHandler(writers),
  };
}
