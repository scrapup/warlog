/**
 * Reorders the subtasks of a task (positions 1..N, listed first).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { subtasksOf } from '../task/task-graph.ts';
import type { Subtask } from '../task/task-graph.ts';
import type { SubtaskReorderInput } from './subtask-reorder.operation.ts';
import { renumber } from './subtask-rules.ts';

/** Handles `subtask_reorder`. */
export class SubtaskReorderHandler implements OperationHandler<SubtaskReorderInput> {
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
   * Writes the new order.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The subtasks in their new order.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` when the task has no subtasks or an id belongs elsewhere; `CONFLICT`.
   */
  async handle(input: SubtaskReorderInput, context: OperationContext): Promise<OperationResult> {
    const task = await requireEntity(context.index, 'task', input.task_id);
    const siblings = subtasksOf(task);
    if (siblings.length === 0) {
      throw new WarlogError('VALIDATION', `Task ${task.id} has no subtasks`, { task_id: task.id });
    }
    const unknown = input.ordered_ids.filter((id) => !siblings.some((s) => s.id === id));
    if (unknown.length > 0) {
      throw new WarlogError('VALIDATION', `Subtask(s) ${unknown.join(', ')} do not belong to task ${task.id}`, { unknown });
    }
    const listed = [...new Set(input.ordered_ids)];
    const ordered = [...listed.map((id) => siblings.find((s) => s.id === id) as Subtask), ...siblings.filter((s) => !listed.includes(s.id))];
    const subtasks = renumber(ordered);
    await this.writers(context).update(task, { patch: { subtasks } }, [{ action: 'updated', summary: `Subtasks of task ${task.id} reordered`, extra: { field: 'subtasks.sort_order', new_value: subtasks.map((s) => s.id).join(',') } }]);
    return { kind: 'list', rows: subtasks.map((s) => ({ ...s })) };
  }
}
