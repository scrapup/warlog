/**
 * `subtask_create` (WL-10): adds checklist items to a task.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { TITLE, idField, idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { SubtaskCreateHandler } from './subtask-create.handler.ts';

/** Input schema. */
export const SUBTASK_CREATE_INPUT = z.object({
  task_id: idField('Parent task ID'),
  titles: z.array(TITLE).min(1).max(200).describe('Subtask titles (always an array)'),
  depends_on: idListField('Sibling subtask IDs every new subtask waits on').optional(),
});

/** Parsed input. */
export type SubtaskCreateInput = z.infer<typeof SUBTASK_CREATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `subtask_create` operation.
 */
export function subtaskCreateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'subtask_create',
    group: 'subtask',
    action: 'create',
    kind: 'command',
    input: SUBTASK_CREATE_INPUT,
    description: 'Add one or more subtasks (checklist items) to a task, appended after the existing ones.',
    examples: [{ task_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', titles: ['RT-01 create/get', 'RT-02 list'] }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new SubtaskCreateHandler(writers),
  };
}
