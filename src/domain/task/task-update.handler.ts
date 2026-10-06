/**
 * Updates a task.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { applyTaskChange } from './task-change.ts';
import { TASK_UPDATE_FIELDS } from './task-update.operation.ts';
import type { TaskUpdateInput } from './task-update.operation.ts';

/** Handles `task_update`. */
export class TaskUpdateHandler implements OperationHandler<TaskUpdateInput> {
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
   * Applies the change.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The updated task.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` (nothing set, locked description, unfinished subtasks, cycle); `CONFLICT`.
   */
  async handle(input: TaskUpdateInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const task = requireInView(view, 'task', input.id);
    const fields = Object.fromEntries(TASK_UPDATE_FIELDS.filter((f) => input[f] !== undefined).map((f) => [f, input[f]]));
    if (Object.keys(fields).length === 0 && input.description === undefined && input.depends_on === undefined) {
      throw new WarlogError('VALIDATION', 'No fields to update', { fields: [...TASK_UPDATE_FIELDS, 'description', 'depends_on'] });
    }
    const record = await applyTaskChange(view, this.writers(context), task, { fields, description: input.description, dependsOn: input.depends_on, force: input.force });
    return { kind: 'object', value: entityRow(record) };
  }
}
