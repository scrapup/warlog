/**
 * Deletes subtasks: every id is resolved first, then each task file is written once.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { subtasksOf } from '../task/task-graph.ts';
import type { SubtaskDeleteInput } from './subtask-delete.operation.ts';
import { holderOf, renumber } from './subtask-rules.ts';

/** Handles `subtask_delete`. */
export class SubtaskDeleteHandler implements OperationHandler<SubtaskDeleteInput> {
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
   * Removes the subtasks.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ deleted: [{ id, title, deleted: true }] }`.
   * @throws {WarlogError} `NOT_FOUND` for an unknown id (nothing written); `CONFLICT`.
   */
  async handle(input: SubtaskDeleteInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const ids = [...new Set(input.ids)];
    const byTask = new Map<string, IndexedEntity>();
    const deleted = ids.map((id) => {
      const { task, subtask } = holderOf(view, id);
      byTask.set(task.id, task);
      return { id, title: subtask.title, deleted: true };
    });
    const writer = this.writers(context);
    for (const task of byTask.values()) {
      const removed = new Set(ids);
      const kept = subtasksOf(task)
        .filter((s) => !removed.has(s.id))
        .map((s) => (s.depends_on === undefined ? s : { ...s, depends_on: s.depends_on.filter((d) => !removed.has(d)) }));
      const events = deleted.filter((d) => subtasksOf(task).some((s) => s.id === d.id)).map((d) => ({ action: 'deleted' as const, summary: `Subtask '${d.title}' deleted`, subject: { type: 'subtask', id: d.id } }));
      await writer.update(task, { patch: { subtasks: renumber(kept) } }, events);
    }
    return { kind: 'object', value: { deleted } };
  }
}
