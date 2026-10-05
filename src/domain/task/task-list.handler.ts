/**
 * Lists tasks.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { isArchived } from '../epic/epic-list.handler.ts';
import { matchesBranch, resolveBranch, resolveProjectScope } from '../shared/lookup.ts';
import type { BranchFilter } from '../shared/lookup.ts';
import { listRow, omit, tagsOf, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { subtasksOf, unmetIn, idsIn } from './task-graph.ts';
import type { TaskListInput } from './task-list.operation.ts';
import { effectiveSort, taskComparator } from './task-order.ts';

/**
 * List row of a task: fields without body and subtasks, plus counts.
 * @param view - View.
 * @param task - Task.
 * @returns The row.
 */
export function taskRow(view: StoreView, task: IndexedEntity): Row {
  const row = omit(listRow(task), 'subtasks');
  const epic = view.get(text(task, 'epic_id'));
  const subtasks = subtasksOf(task);
  return {
    ...row,
    ...(epic?.type === 'epic' ? { epic_name: text(epic, 'name') } : {}),
    subtask_count: subtasks.length,
    subtask_done_count: subtasks.filter((s) => s.status === 'done').length,
    blocked_by_count: unmetIn(view, idsIn(task, 'depends_on')).length,
  };
}

/** Filters resolved from the input. */
interface TaskFilter {
  /** Input. */
  readonly input: TaskListInput;
  /** Project scope. */
  readonly projectId: string | undefined;
  /** Branch filter. */
  readonly branch: BranchFilter;
}

/**
 * Tells whether a task passes the field filters.
 * @param task - Task.
 * @param input - Input.
 * @returns `true` when kept.
 */
function matchesFields(task: IndexedEntity, input: TaskListInput): boolean {
  const checks: [unknown, string][] = [
    [input.epic_id, 'epic_id'],
    [input.story_id, 'story_id'],
    [input.status, 'status'],
    [input.priority, 'priority'],
    [input.assigned_to, 'assigned_to'],
  ];
  return checks.every(([wanted, field]) => wanted === undefined || text(task, field) === wanted) && (input.tag === undefined || tagsOf(task).includes(input.tag));
}

/**
 * Tells whether a task is listed.
 * @param view - View.
 * @param task - Task.
 * @param filter - Filters.
 * @returns `true` when kept.
 */
export function isListed(view: StoreView, task: IndexedEntity, filter: TaskFilter): boolean {
  const epic = view.get(text(task, 'epic_id'));
  return (
    (filter.projectId === undefined || task.projectId === filter.projectId) &&
    (filter.input.include_deleted || !task.deleted) &&
    (filter.input.include_archived || !isArchived(epic)) &&
    matchesBranch(epic, filter.branch) &&
    matchesFields(task, filter.input)
  );
}

/** Handles `task_list`. */
export class TaskListHandler implements OperationHandler<TaskListInput> {
  /**
   * Lists the tasks.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for an unknown project scope.
   */
  async handle(input: TaskListInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const filter: TaskFilter = { input, projectId: resolveProjectScope(context, view, input.project_id), branch: await resolveBranch(context, input.branch) };
    const tasks = view.ofType('task').filter((t) => isListed(view, t, filter));
    const sorted = tasks.sort(taskComparator(view, effectiveSort(input.sort_by, tasks)));
    return { kind: 'list', rows: sorted.slice(0, input.limit).map((t) => taskRow(view, t)) };
  }
}
