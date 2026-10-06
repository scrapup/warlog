/**
 * Updates several tasks: every id and completion guard is checked first, then the tasks are
 * written one by one (each write is atomic; a concurrent change stops the batch with `CONFLICT`).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { TaskBatchUpdateInput } from './task-batch-update.operation.ts';
import { applyTaskChange, guardDone } from './task-change.ts';

/** Fields a batch can set. */
const BATCH_FIELDS = ['status', 'priority', 'assigned_to'] as const;

/** Handles `task_batch_update`. */
export class TaskBatchUpdateHandler implements OperationHandler<TaskBatchUpdateInput> {
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
   * Applies the fields to every task.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ updated, tasks }`.
   * @throws {WarlogError} `VALIDATION` (no field, unfinished subtasks); `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: TaskBatchUpdateInput, context: OperationContext): Promise<OperationResult> {
    const fields = Object.fromEntries(BATCH_FIELDS.filter((f) => input[f] !== undefined).map((f) => [f, input[f]]));
    if (Object.keys(fields).length === 0) {
      throw new WarlogError('VALIDATION', 'Provide at least one field to update: status, priority, or assigned_to', { fields: [...BATCH_FIELDS] });
    }
    const view = await context.index.full();
    const ids = [...new Set(input.ids)];
    ids.forEach((id) => guardDone(requireInView(view, 'task', id), input.status, input.force));
    const writer = this.writers(context);
    const tasks = [];
    for (const id of ids) {
      tasks.push(entityRow(await applyTaskChange(view, writer, requireInView(view, 'task', id), { fields, force: input.force })));
    }
    return { kind: 'object', value: { updated: tasks.length, tasks } };
  }
}
