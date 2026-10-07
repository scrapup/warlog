/**
 * Reorders the live tasks of an epic: positions 1..N, listed tasks first; only tasks whose
 * position changes are written.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { byCreation, sortOrder, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { taskRow } from './task-list.handler.ts';
import type { TaskReorderInput } from './task-reorder.operation.ts';

/** Handles `task_reorder`. */
export class TaskReorderHandler implements OperationHandler<TaskReorderInput> {
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
   * Writes the new positions.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The epic's tasks in their new order.
   * @throws {WarlogError} `NOT_FOUND` for an unknown epic; `VALIDATION` when the epic has no tasks or an id belongs elsewhere.
   */
  async handle(input: TaskReorderInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const epic = requireInView(view, 'epic', input.epic_id);
    const siblings = view
      .childrenOf(epic.id)
      .filter((t) => t.type === 'task' && !t.deleted && text(t, 'epic_id') === epic.id)
      .sort((a, b) => sortOrder(a) - sortOrder(b) || byCreation(a, b));
    if (siblings.length === 0) {
      throw new WarlogError('VALIDATION', `Epic ${epic.id} has no tasks`, { epic_id: epic.id });
    }
    const known = new Set(siblings.map((t) => t.id));
    const unknown = input.ordered_ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new WarlogError('VALIDATION', `Task(s) ${unknown.join(', ')} do not belong to epic ${epic.id}`, { unknown });
    }
    const listed = [...new Set(input.ordered_ids)];
    const inList = new Set(listed);
    const order = [...listed, ...siblings.map((t) => t.id).filter((id) => !inList.has(id))];
    const writer = this.writers(context);
    for (const [index, id] of order.entries()) {
      const task = requireInView(view, 'task', id);
      if (sortOrder(task) !== index + 1) {
        await writer.update(task, { patch: { sort_order: index + 1 } }, [{ action: 'updated', summary: `Task '${text(task, 'title')}' moved to position ${index + 1} in epic ${epic.id}`, extra: { field: 'sort_order', old_value: String(sortOrder(task)), new_value: String(index + 1) } }]);
      }
    }
    return { kind: 'list', rows: order.map((id) => taskRow(view, requireInView(view, 'task', id))) };
  }
}
