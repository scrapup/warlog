/**
 * `task_get` (WL-10): a task with subtasks, notes, comments, dependencies and dependents.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import { TaskGetHandler } from './task-get.handler.ts';

/** Input schema. */
export const TASK_GET_INPUT = z.object({ id: idField('Task ID') });

/** Parsed input. */
export type TaskGetInput = z.infer<typeof TASK_GET_INPUT>;

/**
 * Builds the definition.
 * @returns The `task_get` operation.
 */
export function taskGetOperation(): OperationDefinition {
  return {
    name: 'task_get',
    group: 'task',
    action: 'get',
    kind: 'query',
    input: TASK_GET_INPUT,
    description: 'Get a task with its subtasks, notes, comments, dependencies (depends_on) and dependents.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TaskGetHandler(),
  };
}
