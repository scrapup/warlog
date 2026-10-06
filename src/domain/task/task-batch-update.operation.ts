/**
 * `task_batch_update` (WL-10, WL-13): sets status, priority or assignee on several tasks.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { FORCE, PRIORITIES, TASK_STATUSES, idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TaskBatchUpdateHandler } from './task-batch-update.handler.ts';

/** Input schema. */
export const TASK_BATCH_UPDATE_INPUT = z.object({
  ids: idListField('Task IDs to update').min(1),
  status: z.enum(TASK_STATUSES).optional().describe('New status'),
  priority: z.enum(PRIORITIES).optional().describe('New priority'),
  assigned_to: z.string().max(200).optional().describe('New assignee'),
  force: FORCE,
});

/** Parsed input. */
export type TaskBatchUpdateInput = z.infer<typeof TASK_BATCH_UPDATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `task_batch_update` operation.
 */
export function taskBatchUpdateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'task_batch_update',
    group: 'task',
    action: 'batch-update',
    kind: 'command',
    input: TASK_BATCH_UPDATE_INPUT,
    description: 'Update status, priority and/or assignee of several tasks. Every task is checked before any is written.',
    examples: [{ ids: ['01J9Z8Q4N6V2M3K5H7G8F9D0C4', '01J9Z8Q4N6V2M3K5H7G8F9D0C5'], status: 'done' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TaskBatchUpdateHandler(writers),
  };
}
