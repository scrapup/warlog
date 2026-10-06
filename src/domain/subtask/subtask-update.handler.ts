/**
 * Updates a subtask inside its task file (one write; concurrent edits of the same task end in
 * `CONFLICT`, WL-42).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { ActivityEvent } from '../shared/tracker-writer.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { subtasksOf } from '../task/task-graph.ts';
import type { Subtask } from '../task/task-graph.ts';
import { subtaskRows } from '../task/task-get.handler.ts';
import { editSubtasks } from './subtask-edit.ts';
import { guardSubtaskStatus, holderOf } from './subtask-rules.ts';
import type { SubtaskUpdateInput } from './subtask-update.operation.ts';

/**
 * Activity records of a subtask change.
 * @param before - Subtask before.
 * @param input - Change.
 * @param overridden - Siblings forced past.
 * @returns The records.
 */
function subtaskEvents(before: Subtask, input: SubtaskUpdateInput, overridden: readonly string[]): ActivityEvent[] {
  const subject = { type: 'subtask', id: before.id };
  const title = input.title ?? before.title;
  const events: ActivityEvent[] = [];
  if (input.status !== undefined && input.status !== before.status) {
    const suffix = overridden.length > 0 ? ` (forced past ${overridden.join(', ')})` : '';
    events.push({ action: 'status_changed', summary: `Subtask '${title}' status: ${before.status} -> ${input.status}${suffix}`, subject, forced: overridden.length > 0, extra: { field: 'status', old_value: before.status, new_value: input.status } });
  }
  if (input.depends_on !== undefined) {
    events.push({ action: 'updated', summary: `Subtask '${title}' now waits on [${input.depends_on.join(', ')}]`, subject, extra: { field: 'depends_on' } });
  }
  if (input.blocks !== undefined) {
    events.push({ action: 'updated', summary: `Subtask '${title}' now blocks [${input.blocks.join(', ')}]`, subject, extra: { field: 'blocks' } });
  }
  return events.length > 0 ? events : [{ action: 'updated', summary: `Subtask '${title}' updated`, subject }];
}

/** Handles `subtask_update`. */
export class SubtaskUpdateHandler implements OperationHandler<SubtaskUpdateInput> {
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
   * @returns The subtask (with `depends_on` briefs and `blocked` when it waits on siblings).
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` (nothing set, unfinished siblings, foreign sibling, cycle); `CONFLICT`.
   */
  async handle(input: SubtaskUpdateInput, context: OperationContext): Promise<OperationResult> {
    const { title, status, sort_order: sortOrder, depends_on: dependsOn, blocks } = input;
    if ([title, status, sortOrder, dependsOn, blocks].every((v) => v === undefined)) {
      throw new WarlogError('VALIDATION', 'No fields to update', { fields: ['title', 'status', 'sort_order', 'depends_on', 'blocks'] });
    }
    const { task, subtask } = holderOf(await context.index.full(), input.id);
    const siblings = subtasksOf(task);
    const overridden = guardSubtaskStatus(siblings, subtask, status, input.force);
    const list = editSubtasks(siblings, subtask.id, input, context.clock.now().toISOString());
    const record = await this.writers(context).update(task, { patch: { subtasks: list } }, subtaskEvents(subtask, input, overridden));
    const row = subtaskRows({ ...task, record }).find((s) => s['id'] === subtask.id);
    return { kind: 'object', value: { task_id: task.id, ...row } };
  }
}
