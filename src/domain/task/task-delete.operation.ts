/**
 * `task_delete` (WL-08, WL-10): soft-removes a `todo` task nothing depends on.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TaskDeleteHandler } from './task-delete.handler.ts';

/** Input schema. */
export const TASK_DELETE_INPUT = z.object({
  id: idField('Task ID'),
  reason: z.string().max(2000).optional().describe('Why it is being removed (kept in the audit trail)'),
  deleted_by: z.string().max(200).optional().describe('Who removes it'),
});

/** Parsed input. */
export type TaskDeleteInput = z.infer<typeof TASK_DELETE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `task_delete` operation.
 */
export function taskDeleteOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'task_delete',
    group: 'task',
    action: 'delete',
    kind: 'command',
    input: TASK_DELETE_INPUT,
    description: 'Remove a todo task (soft: kept in the store; task_list include_deleted shows it, task_restore brings it back). Refused when other tasks depend on it.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', reason: 'created by mistake', deleted_by: 'agent' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TaskDeleteHandler(writers),
  };
}
