/**
 * `subtask_update` (WL-10): changes a subtask; `depends_on`/`blocks` replace its sibling links.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { FORCE, SUBTASK_STATUSES, TITLE, idField, idListField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { SubtaskUpdateHandler } from './subtask-update.handler.ts';

/** Input schema. */
export const SUBTASK_UPDATE_INPUT = z.object({
  id: idField('Subtask ID'),
  title: TITLE.optional().describe('Title'),
  status: z.enum(SUBTASK_STATUSES).optional().describe('Status'),
  sort_order: z.number().int().min(0).optional().describe('Position among siblings'),
  depends_on: idListField('Sibling subtasks this one waits on (replaces the set)').optional(),
  blocks: idListField('Sibling subtasks that wait on this one (replaces the set)').optional(),
  force: FORCE,
});

/** Parsed input. */
export type SubtaskUpdateInput = z.infer<typeof SUBTASK_UPDATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `subtask_update` operation.
 */
export function subtaskUpdateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'subtask_update',
    group: 'subtask',
    action: 'update',
    kind: 'command',
    input: SUBTASK_UPDATE_INPUT,
    description: 'Update a subtask. Starting or finishing it before the siblings it waits on needs force. depends_on and blocks replace its sibling links.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C6', status: 'done' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new SubtaskUpdateHandler(writers),
  };
}
