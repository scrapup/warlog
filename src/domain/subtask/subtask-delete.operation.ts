/**
 * `subtask_delete` (WL-10): removes subtasks from their tasks.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { SubtaskDeleteHandler } from './subtask-delete.handler.ts';

/** Input schema. */
export const SUBTASK_DELETE_INPUT = z.object({
  ids: idListField('Subtask IDs to delete').min(1),
});

/** Parsed input. */
export type SubtaskDeleteInput = z.infer<typeof SUBTASK_DELETE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `subtask_delete` operation.
 */
export function subtaskDeleteOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'subtask_delete',
    group: 'subtask',
    action: 'delete',
    kind: 'command',
    input: SUBTASK_DELETE_INPUT,
    description: 'Delete subtasks (removed from the task file; links from their siblings are dropped). The previous content stays in version control.',
    examples: [{ ids: ['01J9Z8Q4N6V2M3K5H7G8F9D0C6'] }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new SubtaskDeleteHandler(writers),
  };
}
