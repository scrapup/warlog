/**
 * Pure edits of a task's subtask list used by `subtask_update`.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { Subtask } from '../task/task-graph.ts';
import { siblingDependencies, siblingIds } from './subtask-rules.ts';

/** Fields of a subtask change. */
export interface SubtaskEdit {
  /** New title. */
  readonly title?: string | undefined;
  /** New status. */
  readonly status?: string | undefined;
  /** New position. */
  readonly sort_order?: number | undefined;
  /** New dependencies. */
  readonly depends_on?: readonly string[] | undefined;
  /** Siblings that must wait on this one. */
  readonly blocks?: readonly string[] | undefined;
}

/**
 * Applies a change to one subtask of a list.
 * @param siblings - Current subtasks.
 * @param id - Subtask changed.
 * @param edit - Change.
 * @param now - Change date (ISO 8601).
 * @returns The new list.
 * @throws {WarlogError} `VALIDATION` for a foreign sibling or a cycle.
 */
export function editSubtasks(siblings: readonly Subtask[], id: string, edit: SubtaskEdit, now: string): Subtask[] {
  const fields = Object.fromEntries((['title', 'status', 'sort_order'] as const).filter((f) => edit[f] !== undefined).map((f) => [f, edit[f]]));
  let list = siblings.map((s) => (s.id === id ? { ...s, ...fields, updated_at: now } : s));
  if (edit.depends_on !== undefined) {
    const deps = siblingDependencies(list, id, edit.depends_on);
    list = list.map((s) => (s.id === id ? withDeps(s, deps) : s));
  }
  if (edit.blocks !== undefined) {
    list = applyBlocks(list, id, edit.blocks);
  }
  return list;
}

/**
 * Makes exactly the listed siblings wait on a subtask.
 * @param list - Subtasks.
 * @param id - Subtask that blocks.
 * @param blocks - Siblings that must wait on it.
 * @returns The new list.
 * @throws {WarlogError} `VALIDATION` for a foreign sibling or a cycle.
 */
function applyBlocks(list: Subtask[], id: string, blocks: readonly string[]): Subtask[] {
  const targets = siblingIds(list, id, blocks);
  let next = list.map((s) => (!targets.includes(s.id) && (s.depends_on ?? []).includes(id) ? withDeps(s, (s.depends_on ?? []).filter((d) => d !== id)) : s));
  for (const target of targets) {
    const current = next.find((s) => s.id === target);
    const deps = siblingDependencies(next, target, [...(current?.depends_on ?? []), id]);
    next = next.map((s) => (s.id === target ? withDeps(s, deps) : s));
  }
  return next;
}

/**
 * Sets a subtask's dependencies (dropping the field when empty).
 * @param subtask - Subtask.
 * @param deps - Dependencies.
 * @returns The new subtask.
 */
function withDeps(subtask: Subtask, deps: readonly string[]): Subtask {
  const base = Object.fromEntries(Object.entries(subtask).filter(([k]) => k !== 'depends_on')) as unknown as Subtask;
  return deps.length > 0 ? { ...base, depends_on: [...deps] } : base;
}
