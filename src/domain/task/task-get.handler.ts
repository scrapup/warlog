/**
 * Reads a task and everything attached to it.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { requireInView } from '../shared/lookup.ts';
import { byCreation, entityRow, omit, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { dependentsOf, idsIn, subtasksOf, taskBrief } from './task-graph.ts';
import type { TaskGetInput } from './task-get.operation.ts';

/**
 * Subtasks of a task with their dependency details (`depends_on` as briefs, `blocked`).
 * @param task - Task.
 * @returns Rows in manual order.
 */
export function subtaskRows(task: IndexedEntity): Row[] {
  const subtasks = subtasksOf(task);
  const byId = new Map(subtasks.map((s) => [s.id, s] as const));
  return subtasks.map((s) => {
    const deps = (s.depends_on ?? []).map((d) => byId.get(d)).filter((d) => d !== undefined);
    const rest = omit({ ...s }, 'depends_on');
    return deps.length === 0
      ? { ...rest }
      : { ...rest, depends_on: deps.map((d) => ({ id: d.id, title: d.title, status: d.status })), blocked: deps.some((d) => d.status !== 'done') };
  });
}

/**
 * Notes related to an entity, newest first.
 * @param view - View.
 * @param type - Related entity type.
 * @param id - Related entity id.
 * @returns Note rows.
 */
export function relatedNotes(view: StoreView, type: string, id: string): Row[] {
  return view
    .ofType('note')
    .filter((n) => !n.deleted && n.record.data['related_entity_type'] === type && n.record.data['related_entity_id'] === id)
    .sort((a, b) => byCreation(b, a))
    .map((n) => entityRow(n.record, 'content'));
}

/** Handles `task_get`. */
export class TaskGetHandler implements OperationHandler<TaskGetInput> {
  /**
   * Returns the task with its attachments.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The task.
   * @throws {WarlogError} `NOT_FOUND`.
   */
  async handle(input: TaskGetInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const task = requireInView(view, 'task', input.id);
    const epic = view.get(String(task.record.data['epic_id']));
    const comments = view
      .childrenOf(task.id)
      .filter((c) => c.type === 'comment' && !c.deleted)
      .sort(byCreation)
      .map((c) => entityRow(c.record, 'content'));
    return {
      kind: 'object',
      value: {
        ...entityRow(task.record),
        ...(epic?.type === 'epic' ? { epic_name: text(epic, 'name') } : {}),
        subtasks: subtaskRows(task),
        notes: relatedNotes(view, 'task', task.id),
        comments,
        depends_on: idsIn(task, 'depends_on').map((d) => taskBrief(view, d)),
        dependents: dependentsOf(view, task.id).map((d) => taskBrief(view, d.id)),
      },
    };
  }
}
