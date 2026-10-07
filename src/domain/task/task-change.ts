/**
 * The task write rules shared by `task_update` and `task_batch_update` (WL-13): description lock,
 * completion guard (unfinished subtasks need `force`), dependency replacement with cycle check,
 * automatic block/unblock, and propagation to dependents when a task's doneness changes.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import type { EntityRecord } from '../../core/storage/entity-ref.ts';
import { changeEvents } from '../shared/changes.ts';
import { text } from '../shared/rows.ts';
import type { ActivityEvent, TrackerWriter } from '../shared/tracker-writer.ts';
import { cleanDependencies, decideStatus } from './dependency-engine.ts';
import type { StatusDecision } from './dependency-engine.ts';
import { assertAcyclic, dependentsOf, idsIn, subtasksOf, unmetIn } from './task-graph.ts';

/** Fields of a task change (all optional except `force`). */
export interface TaskChange {
  /** Front-matter fields to set. */
  readonly fields: Readonly<Record<string, unknown>>;
  /** New description (body). */
  readonly description?: string | undefined;
  /** New dependency list (replaces the current one). */
  readonly dependsOn?: readonly string[] | undefined;
  /** Proceed despite unfinished subtasks (logged). */
  readonly force: boolean;
}

/** Fields whose change is recorded in the activity log. */
const TRACKED = ['status', 'priority', 'assigned_to', 'title'];

/**
 * Activity record of an automatic transition.
 * @param title - Task title.
 * @param before - Status before.
 * @param decision - Decision.
 * @param unmet - Unmet dependency ids.
 * @returns The record, or none when nothing changed automatically.
 */
export function transitionEvents(title: string, before: string, decision: StatusDecision, unmet: readonly string[]): ActivityEvent[] {
  if (decision.transition === undefined) {
    return [];
  }
  const summary =
    decision.transition === 'auto_blocked' ? `Task '${title}' auto-blocked: depends on ${unmet.join(', ')}` : `Task '${title}' auto-unblocked: all dependencies met`;
  return [{ action: 'status_changed', summary, extra: { field: 'status', old_value: before, new_value: decision.status } }];
}

/**
 * Applies the completion guard.
 * @param task - Task.
 * @param nextStatus - Requested status.
 * @param force - Override.
 * @returns Records of a forced completion (empty otherwise).
 * @throws {WarlogError} `VALIDATION` when completing with unfinished subtasks without `force`.
 */
export function guardDone(task: IndexedEntity, nextStatus: unknown, force: boolean): ActivityEvent[] {
  if (nextStatus !== 'done') {
    return [];
  }
  const open = subtasksOf(task).filter((s) => s.status !== 'done');
  if (open.length === 0) {
    return [];
  }
  const listed = open.map((s) => `${s.id} '${s.title}' (${s.status})`).join(', ');
  if (!force) {
    throw new WarlogError('VALIDATION', `Task ${task.id} cannot be completed — ${open.length} subtask(s) are unfinished: ${listed}. Finish or delete them, or pass force: true to override deliberately (the override is logged).`, {
      unfinished: open.map((s) => s.id),
    });
  }
  return [{ action: 'updated', summary: `Task '${text(task, 'title')}' forced to done with ${open.length} unfinished subtask(s): ${open.map((s) => s.id).join(', ')}`, forced: true, extra: { field: 'status', old_value: text(task, 'status'), new_value: 'done' } }];
}

/**
 * Applies a change to one task and propagates its doneness to dependents.
 * @param view - Full view.
 * @param writer - Writer of the call.
 * @param task - Task as seen.
 * @param change - Change.
 * @returns The stored task.
 * @throws {WarlogError} `VALIDATION` (locked description, unfinished subtasks, cycle); `CONFLICT`.
 */
export async function applyTaskChange(view: StoreView, writer: TrackerWriter, task: IndexedEntity, change: TaskChange): Promise<EntityRecord> {
  if (task.record.data['description_locked'] === true && change.description !== undefined) {
    throw new WarlogError('VALIDATION', `Task ${task.id}'s description is locked and was not changed. Record progress with comment_add instead, or unlock it with task_lock_description if the description itself is genuinely wrong.`, { field: 'description' });
  }
  const forced = guardDone(task, change.fields['status'], change.force);
  const patch: Record<string, unknown> = { ...change.fields };
  const title = String(patch['title'] ?? text(task, 'title'));
  const events = [...changeEvents(`Task '${title}'`, task.record, patch, TRACKED), ...forced];
  if (change.dependsOn !== undefined) {
    events.push(...replaceDependencies(view, task, patch, change.dependsOn, title));
  }
  const record = await writer.update(task, change.description === undefined ? { patch } : { patch, body: change.description }, events);
  if (change.fields['status'] !== undefined || (text(task, 'status') === 'done') !== (record.data['status'] === 'done')) {
    // Also when the status did not change: a failed propagation (a dependent changed concurrently)
    // leaves dependents stale, and repeating the call must repair them. Propagation skips
    // dependents that are already right, so a repeat writes nothing.
    await propagate(view, writer, task.id);
  }
  return record;
}

/**
 * Replaces a task's dependencies in a patch and re-evaluates its status.
 * @param view - View.
 * @param task - Task.
 * @param patch - Patch being built (mutated).
 * @param requested - Requested dependencies.
 * @param title - Task title.
 * @returns Activity records.
 * @throws {WarlogError} `VALIDATION` on a cycle.
 */
function replaceDependencies(view: StoreView, task: IndexedEntity, patch: Record<string, unknown>, requested: readonly string[], title: string): ActivityEvent[] {
  const dependsOn = cleanDependencies(task.id, requested);
  assertAcyclic(view, task.id, dependsOn);
  const unmet = unmetIn(view, dependsOn);
  const before = String(patch['status'] ?? text(task, 'status'));
  const decision = decideStatus(before, dependsOn.length, unmet.length, true);
  patch['depends_on'] = dependsOn;
  patch['blocked_by_deps'] = unmet.length > 0 ? unmet : undefined;
  patch['status'] = decision.status;
  const listed = dependsOn.length > 0 ? dependsOn.join(',') : '(none)';
  return [
    { action: 'updated', summary: `Task '${title}' dependencies updated: [${dependsOn.join(', ')}]`, extra: { field: 'depends_on', old_value: '', new_value: listed } },
    ...transitionEvents(title, before, decision, unmet),
  ];
}

/**
 * Re-evaluates the dependents of a task whose doneness changed (in either direction).
 * @param view - View (already showing the changed task).
 * @param writer - Writer of the call.
 * @param id - Changed task.
 * @returns When every dependent was evaluated.
 * @throws {WarlogError} `CONFLICT` when a dependent changed concurrently.
 */
export async function propagate(view: StoreView, writer: TrackerWriter, id: string): Promise<void> {
  for (const dependent of dependentsOf(view, id)) {
    await reevaluate(view, writer, dependent);
  }
}

/**
 * Re-evaluates one task against the state of its dependencies, writing only when its status or
 * its list of unmet dependencies is out of date.
 * @param view - View.
 * @param writer - Writer of the call.
 * @param task - Task as seen.
 * @returns When the task is up to date.
 * @throws {WarlogError} `CONFLICT` when the task changed concurrently.
 */
export async function reevaluate(view: StoreView, writer: TrackerWriter, task: IndexedEntity): Promise<void> {
  const dependsOn = idsIn(task, 'depends_on');
  const unmet = unmetIn(view, dependsOn);
  const before = text(task, 'status');
  const decision = decideStatus(before, dependsOn.length, unmet.length, false);
  if (decision.status === before && sameIds(idsIn(task, 'blocked_by_deps'), unmet)) {
    return;
  }
  await writer.update(task, { patch: { status: decision.status, blocked_by_deps: unmet.length > 0 ? unmet : undefined } }, transitionEvents(text(task, 'title'), before, decision, unmet));
}

/**
 * Compares two id lists.
 * @param a - First.
 * @param b - Second.
 * @returns `true` when equal in order.
 */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
