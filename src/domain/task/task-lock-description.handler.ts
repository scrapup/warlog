/**
 * Locks or unlocks a task description; asking for the current state changes nothing.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { TaskLockDescriptionInput } from './task-lock-description.operation.ts';

/** Handles `task_lock_description`. */
export class TaskLockDescriptionHandler implements OperationHandler<TaskLockDescriptionInput> {
  /** Writer factory. */
  private readonly writers: WriterFactory;

  /**
   * Creates the handler.
   * @param writers - Writer factory.
   */
  constructor(writers: WriterFactory) {
    this.writers = writers;
  }

  /**
   * Sets the lock.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, task }`.
   * @throws {WarlogError} `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: TaskLockDescriptionInput, context: OperationContext): Promise<OperationResult> {
    const task = await requireEntity(context.index, 'task', input.id);
    const state = input.locked ? 'locked' : 'unlocked';
    if ((task.record.data['description_locked'] === true) === input.locked) {
      return { kind: 'object', value: { message: `Task ${task.id}'s description is already ${state}.`, task: entityRow(task.record) } };
    }
    const record = await this.writers(context).update(task, { patch: { description_locked: input.locked } }, [
      { action: 'updated', summary: `Task '${text(task, 'title')}' description ${state}`, extra: { field: 'description_locked', old_value: String(!input.locked), new_value: String(input.locked) } },
    ]);
    const message = input.locked
      ? `Task ${task.id}'s description is locked. task_update will refuse to change it; use comment_add to record progress.`
      : `Task ${task.id}'s description is unlocked.`;
    return { kind: 'object', value: { message, task: entityRow(record) } };
  }
}
