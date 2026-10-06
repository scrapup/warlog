/**
 * Reads of the task graph from the view: dependencies, dependents, subtasks and their states.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { text } from '../shared/rows.ts';
import { findCycle, unmetDependencies } from './dependency-engine.ts';

/** A subtask embedded in its task file. */
export interface Subtask {
  /** Subtask id (ULID). */
  readonly id: string;
  /** Title. */
  readonly title: string;
  /** `todo`, `in_progress` or `done`. */
  readonly status: string;
  /** Sibling subtasks it waits on. */
  readonly depends_on?: readonly string[];
  /** Manual position (1-based). */
  readonly sort_order: number;
  /** Creation date (ISO 8601). */
  readonly created_at?: string;
  /** Last change date (ISO 8601). */
  readonly updated_at?: string;
}

/**
 * String list stored in a front-matter field.
 * @param entity - Entity.
 * @param field - Field name.
 * @returns The strings.
 */
export function idsIn(entity: IndexedEntity, field: string): string[] {
  const value = entity.record.data[field];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Subtasks of a task, in manual order.
 * @param task - Task.
 * @returns The subtasks.
 */
export function subtasksOf(task: IndexedEntity): Subtask[] {
  const value = task.record.data['subtasks'];
  const list = Array.isArray(value) ? value.filter((s: unknown): s is Subtask => typeof s === 'object' && s !== null && typeof Reflect.get(s, 'id') === 'string') : [];
  return [...list].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Status of a task in the view.
 * @param view - View.
 * @param id - Task id.
 * @returns The status, or `undefined` when the task is not in the view.
 */
export function taskStatus(view: StoreView, id: string): string | undefined {
  const task = view.get(id);
  return task?.type === 'task' ? text(task, 'status') : undefined;
}

/**
 * Unmet dependencies of a task.
 * @param view - View.
 * @param dependsOn - Dependency ids.
 * @returns The unmet ids.
 */
export function unmetIn(view: StoreView, dependsOn: readonly string[]): string[] {
  return unmetDependencies(dependsOn, (id) => taskStatus(view, id));
}

/**
 * Live tasks that depend on a task.
 * @param view - View.
 * @param id - Task id.
 * @returns The dependents, ordered by id.
 */
export function dependentsOf(view: StoreView, id: string): IndexedEntity[] {
  return view.backlinksOf(id).filter((e) => e.type === 'task' && !e.deleted && idsIn(e, 'depends_on').includes(id));
}

/**
 * Fails when a new dependency list would create a cycle.
 * @param view - View.
 * @param id - Task id.
 * @param dependsOn - New dependencies.
 * @throws {WarlogError} `VALIDATION` listing the cycle.
 */
export function assertAcyclic(view: StoreView, id: string, dependsOn: readonly string[]): void {
  const edges = new Map(view.ofType('task').map((t) => [t.id, idsIn(t, 'depends_on')] as const));
  const cycle = findCycle(edges, id, dependsOn);
  if (cycle !== undefined) {
    throw new WarlogError('VALIDATION', `That would make a circular task dependency: ${cycle.join(' → ')}. Nothing in a cycle can ever start.`, {
      field: 'depends_on',
      cycle,
    });
  }
}

/**
 * Short form of a related task.
 * @param view - View.
 * @param id - Task id.
 * @returns `{ id, title, status }` (`status: missing` when not in the view).
 */
export function taskBrief(view: StoreView, id: string): Record<string, unknown> {
  const task = view.get(id);
  return task?.type === 'task' ? { id, title: text(task, 'title'), status: text(task, 'status') } : { id, status: 'missing' };
}
