/**
 * `subtask_reorder` (WL-10): sets the order of a task's subtasks.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField, idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { SubtaskReorderHandler } from './subtask-reorder.handler.ts';

/** Input schema. */
export const SUBTASK_REORDER_INPUT = z.object({
  task_id: idField('Parent task ID'),
  ordered_ids: idListField('Subtask IDs, in order'),
});

/** Parsed input. */
export type SubtaskReorderInput = z.infer<typeof SUBTASK_REORDER_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `subtask_reorder` operation.
 */
export function subtaskReorderOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'subtask_reorder',
    group: 'subtask',
    action: 'reorder',
    kind: 'command',
    input: SUBTASK_REORDER_INPUT,
    description: "Set the order of a task's subtasks; subtasks left out keep their relative order after the listed ones.",
    examples: [{ task_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', ordered_ids: ['01J9Z8Q4N6V2M3K5H7G8F9D0C7', '01J9Z8Q4N6V2M3K5H7G8F9D0C6'] }],
    defaultFormat: 'table',
    load: 'point',
    handler: new SubtaskReorderHandler(writers),
  };
}
