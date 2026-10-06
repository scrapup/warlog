/**
 * `task_restore` (WL-08, WL-10): brings back a removed task.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TaskRestoreHandler } from './task-restore.handler.ts';

/** Input schema. */
export const TASK_RESTORE_INPUT = z.object({ id: idField('Task ID') });

/** Parsed input. */
export type TaskRestoreInput = z.infer<typeof TASK_RESTORE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `task_restore` operation.
 */
export function taskRestoreOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'task_restore',
    group: 'task',
    action: 'restore',
    kind: 'command',
    input: TASK_RESTORE_INPUT,
    description: 'Restore a removed task.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new TaskRestoreHandler(writers),
  };
}
