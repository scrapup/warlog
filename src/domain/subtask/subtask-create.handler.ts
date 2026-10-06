/**
 * Appends subtasks to a task file (one write; the task `rev` is bumped, WL-42).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { subtasksOf } from '../task/task-graph.ts';
import type { Subtask } from '../task/task-graph.ts';
import type { SubtaskCreateInput } from './subtask-create.operation.ts';
import { siblingDependencies } from './subtask-rules.ts';

/** Handles `subtask_create`. */
export class SubtaskCreateHandler implements OperationHandler<SubtaskCreateInput> {
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
   * Adds the subtasks.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ task_id, subtasks }` (the new ones).
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` for a foreign dependency; `CONFLICT`.
   */
  async handle(input: SubtaskCreateInput, context: OperationContext): Promise<OperationResult> {
    const task = await requireEntity(context.index, 'task', input.task_id);
    const existing = subtasksOf(task);
    const now = context.clock.now().toISOString();
    const start = existing.reduce((max, s) => Math.max(max, s.sort_order), 0);
    const created: Subtask[] = input.titles.map((title, i) => ({ id: context.ids.next(), title, status: 'todo', sort_order: start + i + 1, created_at: now, updated_at: now }));
    const withDeps = created.map((s) => {
      const dependsOn = input.depends_on === undefined ? [] : siblingDependencies([...existing, ...created], s.id, input.depends_on);
      return dependsOn.length > 0 ? { ...s, depends_on: dependsOn } : s;
    });
    await this.writers(context).update(
      task,
      { patch: { subtasks: [...existing, ...withDeps] } },
      withDeps.map((s) => ({ action: 'created', summary: `Subtask '${s.title}' created`, subject: { type: 'subtask', id: s.id } })),
    );
    return { kind: 'object', value: { task_id: task.id, subtasks: withDeps } };
  }
}
