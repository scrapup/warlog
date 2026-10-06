/**
 * Subtask rules (plan §3.3, WL-10): subtasks live in their task's file, depend only on siblings,
 * never form cycles, and cannot start or finish before the siblings they wait on unless forced.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { cleanDependencies, findCycle } from '../task/dependency-engine.ts';
import { subtasksOf } from '../task/task-graph.ts';
import type { Subtask } from '../task/task-graph.ts';

/** Statuses that need every awaited sibling done. */
const FORWARD = new Set(['in_progress', 'done']);

/** A subtask and the task holding it. */
export interface SubtaskHolder {
  /** Task. */
  readonly task: IndexedEntity;
  /** Subtask. */
  readonly subtask: Subtask;
}

/**
 * Finds the task holding a subtask.
 * @param view - View.
 * @param subtaskId - Subtask id.
 * @returns The task and the subtask.
 * @throws {WarlogError} `NOT_FOUND`.
 */
export function holderOf(view: StoreView, subtaskId: string): SubtaskHolder {
  for (const task of view.ofType('task')) {
    const subtask = subtasksOf(task).find((s) => s.id === subtaskId);
    if (subtask !== undefined) {
      return { task, subtask };
    }
  }
  throw new WarlogError('NOT_FOUND', `subtask ${subtaskId} not found`, { type: 'subtask', id: subtaskId });
}

/**
 * Validates a subtask's new dependency list against its siblings.
 * @param siblings - Subtasks of the task (with the new state).
 * @param id - Subtask id.
 * @param requested - Requested dependencies.
 * @returns The clean list.
 * @throws {WarlogError} `NOT_FOUND` for an unknown id; `VALIDATION` for a foreign subtask or a cycle.
 */
export function siblingDependencies(siblings: readonly Subtask[], id: string, requested: readonly string[]): string[] {
  const dependsOn = siblingIds(siblings, id, requested);
  const edges = new Map(siblings.map((s) => [s.id, s.depends_on ?? []] as const));
  const cycle = findCycle(edges, id, dependsOn);
  if (cycle !== undefined) {
    throw new WarlogError('VALIDATION', `That would make a circular subtask dependency: ${cycle.join(' → ')}.`, { cycle });
  }
  return dependsOn;
}

/**
 * Validates a list of sibling ids.
 * @param siblings - Subtasks of the task.
 * @param id - Subtask the list belongs to (removed from it).
 * @param requested - Requested ids.
 * @returns The clean list.
 * @throws {WarlogError} `VALIDATION` for an id that is not a sibling.
 */
export function siblingIds(siblings: readonly Subtask[], id: string, requested: readonly string[]): string[] {
  const ids = cleanDependencies(id, requested);
  const known = new Set(siblings.map((s) => s.id));
  const foreign = ids.filter((d) => !known.has(d));
  if (foreign.length > 0) {
    throw new WarlogError('VALIDATION', `Subtasks can only depend on siblings under the same task; ${foreign.join(', ')} are not siblings — use task_update depends_on for cross-task ordering.`, { foreign });
  }
  return ids;
}

/**
 * Checks that a subtask may move to a status.
 * @param siblings - Subtasks of the task.
 * @param subtask - Subtask.
 * @param next - Requested status.
 * @param force - Override.
 * @returns Ids of the unfinished siblings that were overridden (empty when none).
 * @throws {WarlogError} `VALIDATION` when it waits on unfinished siblings and `force` is not set.
 */
export function guardSubtaskStatus(siblings: readonly Subtask[], subtask: Subtask, next: string | undefined, force: boolean): string[] {
  if (next === undefined || !FORWARD.has(next)) {
    return [];
  }
  const waiting = (subtask.depends_on ?? []).filter((d) => siblings.find((s) => s.id === d)?.status !== 'done');
  if (waiting.length > 0 && !force) {
    const verb = next === 'done' ? 'completed' : 'started';
    throw new WarlogError('VALIDATION', `Subtask ${subtask.id} cannot be ${verb} — it waits on ${waiting.join(', ')}. Finish those first, or pass force: true to override deliberately (the override is logged).`, { waiting });
  }
  return waiting;
}

/**
 * Renumbers subtasks 1..N in the given order.
 * @param subtasks - Subtasks in order.
 * @returns The renumbered subtasks.
 */
export function renumber(subtasks: readonly Subtask[]): Subtask[] {
  return subtasks.map((s, i) => ({ ...s, sort_order: i + 1 }));
}
