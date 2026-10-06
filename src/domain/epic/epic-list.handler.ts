/**
 * Lists the epics of a project.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { matchesBranch, requireInView, resolveBranch } from '../shared/lookup.ts';
import { byCreation, listRow, percent, sortOrder, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import type { EpicListInput } from './epic-list.operation.ts';

/**
 * Live tasks of an epic.
 * @param view - View.
 * @param epic - Epic.
 * @returns Its tasks that are not deleted.
 */
export function epicTasks(view: StoreView, epic: IndexedEntity): IndexedEntity[] {
  return view.childrenOf(epic.id).filter((t) => t.type === 'task' && !t.deleted && t.record.data['epic_id'] === epic.id);
}

/**
 * Counts tasks in a status.
 * @param tasks - Tasks.
 * @param status - Status.
 * @returns The count.
 */
export function countStatus(tasks: readonly IndexedEntity[], status: string): number {
  return tasks.filter((t) => text(t, 'status') === status).length;
}

/**
 * Task counts of an epic.
 * @param view - View.
 * @param epic - Epic.
 * @returns `task_count`, `done_count`, `blocked_count`, `completion_pct`.
 */
export function epicCounts(view: StoreView, epic: IndexedEntity): Row {
  const tasks = epicTasks(view, epic);
  const done = countStatus(tasks, 'done');
  return { task_count: tasks.length, done_count: done, blocked_count: countStatus(tasks, 'blocked'), completion_pct: percent(done, tasks.length) };
}

/**
 * Orders epics by manual position, then creation.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
export function byEpicOrder(a: IndexedEntity, b: IndexedEntity): number {
  return sortOrder(a) - sortOrder(b) || byCreation(a, b);
}

/**
 * Tells whether an epic is archived.
 * @param epic - Epic.
 * @returns `true` when archived.
 */
export function isArchived(epic: IndexedEntity | undefined): boolean {
  return epic?.record.data['archived'] === true;
}

/** Handles `epic_list`. */
export class EpicListHandler implements OperationHandler<EpicListInput> {
  /**
   * Lists the epics.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   * @throws {WarlogError} `NOT_FOUND` for an unknown project.
   */
  async handle(input: EpicListInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    requireInView(view, 'project', input.project_id);
    const branch = await resolveBranch(context, input.branch);
    const rows = view
      .list('epic', input.project_id)
      .filter((e) => !e.deleted)
      .filter((e) => input.status === undefined || text(e, 'status') === input.status)
      .filter((e) => input.priority === undefined || text(e, 'priority') === input.priority)
      .filter((e) => input.include_archived || !isArchived(e))
      .filter((e) => matchesBranch(e, branch))
      .sort(byEpicOrder)
      .map((e) => listRow(e, epicCounts(view, e)));
    return { kind: 'list', rows };
  }
}
