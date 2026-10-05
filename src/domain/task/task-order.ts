/**
 * Orderings of task lists (same rules as the current tracker): an explicit `sort_by` is obeyed
 * literally; without it, a list follows the manual arrangement when any listed task was placed
 * by `task_reorder`, otherwise priority.
 */
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import { byCreation, priorityRank, sortOrder, statusRank, text } from '../shared/rows.ts';

/** Sort modes of `task_list`. */
export const TASK_SORTS = ['priority', 'created', 'due_date', 'status', 'manual'] as const;

/** A sort mode, plus the implicit `arranged`. */
export type TaskSort = (typeof TASK_SORTS)[number] | 'arranged';

/** Compares two tasks. */
type Compare = (a: IndexedEntity, b: IndexedEntity) => number;

/**
 * Compares by manual position, never-placed tasks (`0`) last.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
function placed(a: IndexedEntity, b: IndexedEntity): number {
  return unplaced(a) - unplaced(b) || bySortOrder(a, b);
}

/**
 * Whether a task was never placed.
 * @param t - Task.
 * @returns `1` when never placed, else `0`.
 */
function unplaced(t: IndexedEntity): number {
  return sortOrder(t) === 0 ? 1 : 0;
}

/**
 * Compares by manual position.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
function bySortOrder(a: IndexedEntity, b: IndexedEntity): number {
  return sortOrder(a) - sortOrder(b);
}

/**
 * Compares by priority.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
function byPriority(a: IndexedEntity, b: IndexedEntity): number {
  return priorityRank(a) - priorityRank(b);
}

/**
 * Compares by status.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
function byStatus(a: IndexedEntity, b: IndexedEntity): number {
  return statusRank(a) - statusRank(b);
}

/**
 * Compares newest first.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
function newestFirst(a: IndexedEntity, b: IndexedEntity): number {
  return byCreation(b, a);
}

/**
 * Position key of a task's epic.
 * @param view - View.
 * @param t - Task.
 * @returns `[epic sort_order, epic id]` (`[0, '']` without epic).
 */
function epicKey(view: StoreView, t: IndexedEntity): [number, string] {
  const epic = view.get(text(t, 'epic_id'));
  return epic === undefined ? [0, ''] : [sortOrder(epic), epic.id];
}

/**
 * Compares by due date, tasks without one last.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
function dueDate(a: IndexedEntity, b: IndexedEntity): number {
  const da = text(a, 'due_date');
  const db = text(b, 'due_date');
  return (da === '' ? 1 : 0) - (db === '' ? 1 : 0) || compareCodeUnits(da, db);
}

/**
 * Builds the comparator of a sort mode.
 * @param view - View (epic positions).
 * @param sort - Sort mode.
 * @returns The comparator.
 */
export function taskComparator(view: StoreView, sort: TaskSort): Compare {
  /**
   * Compares by epic position.
   * @param a - First.
   * @param b - Second.
   * @returns Comparison.
   */
  const byEpic: Compare = (a, b) => {
    const [ka, kb] = [epicKey(view, a), epicKey(view, b)];
    return ka[0] - kb[0] || compareCodeUnits(ka[1], kb[1]);
  };
  const orders: Record<TaskSort, Compare[]> = {
    priority: [byPriority, byStatus, bySortOrder, byCreation],
    status: [byStatus, byPriority, bySortOrder, byCreation],
    due_date: [dueDate, byPriority, byCreation],
    created: [newestFirst],
    manual: [byEpic, placed, byCreation],
    arranged: [byEpic, placed, byPriority, byStatus, byCreation],
  };
  const chain = orders[sort];
  return (a, b) => chain.reduce((result, compare) => result || compare(a, b), 0);
}

/**
 * The sort mode of a list.
 * @param explicit - `sort_by` parameter.
 * @param tasks - Listed tasks.
 * @returns The mode.
 */
export function effectiveSort(explicit: TaskSort | undefined, tasks: readonly IndexedEntity[]): TaskSort {
  return explicit ?? (tasks.some((t) => sortOrder(t) !== 0) ? 'arranged' : 'priority');
}
