/**
 * `task_reorder` (WL-10): sets the manual order of an epic's tasks.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField, idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TaskReorderHandler } from './task-reorder.handler.ts';

/** Input schema. */
export const TASK_REORDER_INPUT = z.object({
  epic_id: idField('Parent epic'),
  ordered_ids: idListField('Task IDs, in order'),
});

/** Parsed input. */
export type TaskReorderInput = z.infer<typeof TASK_REORDER_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `task_reorder` operation.
 */
export function taskReorderOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'task_reorder',
    group: 'task',
    action: 'reorder',
    kind: 'command',
    input: TASK_REORDER_INPUT,
    description: "Set the manual order of an epic's tasks. Tasks left out keep their relative order after the listed ones. task_list follows this order by default.",
    examples: [{ epic_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2', ordered_ids: ['01J9Z8Q4N6V2M3K5H7G8F9D0C5', '01J9Z8Q4N6V2M3K5H7G8F9D0C4'] }],
    defaultFormat: 'table',
    load: 'full',
    handler: new TaskReorderHandler(writers),
  };
}
