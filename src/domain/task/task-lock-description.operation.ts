/**
 * `task_lock_description` (WL-10): guards a task's description against rewrites.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TaskLockDescriptionHandler } from './task-lock-description.handler.ts';

/** Input schema. */
export const TASK_LOCK_DESCRIPTION_INPUT = z.object({
  id: idField('Task ID'),
  locked: z.boolean().default(true).describe('true to lock, false to unlock'),
});

/** Parsed input. */
export type TaskLockDescriptionInput = z.infer<typeof TASK_LOCK_DESCRIPTION_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `task_lock_description` operation.
 */
export function taskLockDescriptionOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'task_lock_description',
    group: 'task',
    action: 'lock-description',
    kind: 'command',
    input: TASK_LOCK_DESCRIPTION_INPUT,
    description: "Lock (or unlock with locked: false) a task's description: while locked, task_update refuses to change it; record progress with comment_add.",
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', locked: true }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new TaskLockDescriptionHandler(writers),
  };
}
