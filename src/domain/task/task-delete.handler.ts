/**
 * Soft-deletes a task (WL-08): only `todo` tasks (started work has history worth keeping) and
 * only when no live task depends on it (it would wait forever).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { TaskDeleteInput } from './task-delete.operation.ts';
import { dependentsOf } from './task-graph.ts';

/** Handles `task_delete`. */
export class TaskDeleteHandler implements OperationHandler<TaskDeleteInput> {
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
   * Removes the task.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, task }`.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` when not `todo` or depended on; `CONFLICT`.
   */
  async handle(input: TaskDeleteInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const task = requireInView(view, 'task', input.id);
    if (task.deleted) {
      return { kind: 'object', value: { message: `Task ${task.id} was already removed.`, task: entityRow(task.record) } };
    }
    const status = text(task, 'status');
    if (status !== 'todo') {
      throw new WarlogError('VALIDATION', `Task ${task.id} is '${status}', not 'todo', so it cannot be removed — work that has started has history worth keeping. Close it by setting status to done, or move it back to todo first if it was created by mistake.`, { status });
    }
    const dependents = dependentsOf(view, task.id);
    if (dependents.length > 0) {
      throw new WarlogError('VALIDATION', `Task ${task.id} cannot be removed — ${dependents.map((d) => `${d.id} '${text(d, 'title')}'`).join(', ')} depend on it and would stay blocked forever. Clear those dependencies first.`, {
        dependents: dependents.map((d) => d.id),
      });
    }
    const by = input.deleted_by ?? '';
    const reason = input.reason ?? '';
    const summary = `Task '${text(task, 'title')}' removed${by === '' ? '' : ` by ${by}`}${reason === '' ? '' : `: ${reason}`}`;
    const record = await this.writers(context).softDelete(task, { by, reason }, summary);
    return { kind: 'object', value: { message: `Task ${task.id} removed. The file is kept — pass include_deleted to task_list to see it, or task_restore to bring it back.`, task: entityRow(record) } };
  }
}
