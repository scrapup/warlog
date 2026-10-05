/**
 * Restores a soft-deleted task (WL-08).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { TaskRestoreInput } from './task-restore.operation.ts';

/** Handles `task_restore`. */
export class TaskRestoreHandler implements OperationHandler<TaskRestoreInput> {
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
   * Restores the task.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, task }`.
   * @throws {WarlogError} `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: TaskRestoreInput, context: OperationContext): Promise<OperationResult> {
    const task = await requireEntity(context.index, 'task', input.id);
    if (!task.deleted) {
      return { kind: 'object', value: { message: `Task ${task.id} is not removed — nothing to restore.`, task: entityRow(task.record) } };
    }
    const record = await this.writers(context).restore(task, `Task '${text(task, 'title')}' restored`);
    return { kind: 'object', value: { message: `Task ${task.id} restored.`, task: entityRow(record) } };
  }
}
