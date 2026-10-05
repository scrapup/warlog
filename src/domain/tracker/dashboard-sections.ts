/**
 * Sections of `tracker_dashboard`: stats, attention lists, recent activity and notes, store
 * warnings (WL-43) and the one-paragraph summary.
 */
import type { ActivityRecord } from '../../core/index/activity-reader.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { countStatus, epicCounts } from '../epic/epic-list.handler.ts';
import { listRow, percent, priorityRank, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import type { TrackerScope } from './tracker-scope.ts';

/**
 * Sum of a numeric field.
 * @param tasks - Tasks.
 * @param field - Field.
 * @returns The sum.
 */
function sum(tasks: readonly IndexedEntity[], field: string): number {
  return tasks.reduce((n, t) => n + (typeof t.record.data[field] === 'number' ? Number(t.record.data[field]) : 0), 0);
}

/**
 * Task and epic counts of a scope.
 * @param scope - Scope.
 * @returns The stats.
 */
export function dashboardStats(scope: TrackerScope): Row {
  const { tasks } = scope;
  const done = countStatus(tasks, 'done');
  return {
    total_epics: scope.epics.length,
    total_tasks: tasks.length,
    tasks_done: done,
    tasks_in_progress: countStatus(tasks, 'in_progress'),
    tasks_blocked: countStatus(tasks, 'blocked'),
    tasks_todo: countStatus(tasks, 'todo'),
    tasks_review: countStatus(tasks, 'review'),
    total_estimated_hours: sum(tasks, 'estimated_hours'),
    total_actual_hours: sum(tasks, 'actual_hours'),
    completion_pct: percent(done, tasks.length),
  };
}

/**
 * Epic rows with counts.
 * @param view - View.
 * @param scope - Scope.
 * @returns Rows.
 */
export function dashboardEpics(view: StoreView, scope: TrackerScope): Row[] {
  return scope.epics.map((e) => listRow(e, epicCounts(view, e)));
}

/**
 * Brief of a task with its epic name.
 * @param view - View.
 * @param task - Task.
 * @param fields - Task fields to keep.
 * @returns The brief.
 */
function brief(view: StoreView, task: IndexedEntity, fields: readonly string[]): Row {
  const epic = view.get(text(task, 'epic_id'));
  return {
    id: task.id,
    ...Object.fromEntries(fields.map((f) => [f, task.record.data[f]])),
    ...(epic?.type === 'epic' ? { epic_name: text(epic, 'name') } : {}),
  };
}

/**
 * Blocked tasks, highest priority first.
 * @param view - View.
 * @param scope - Scope.
 * @returns Briefs.
 */
export function blockedTasks(view: StoreView, scope: TrackerScope): Row[] {
  return scope.tasks
    .filter((t) => !t.deleted && text(t, 'status') === 'blocked')
    .sort((a, b) => priorityRank(a) - priorityRank(b))
    .map((t) => brief(view, t, ['title', 'priority']));
}

/**
 * Unfinished tasks past their due date, earliest first.
 * @param view - View.
 * @param scope - Scope.
 * @param today - Current date (`yyyy-mm-dd`).
 * @returns Briefs.
 */
export function overdueTasks(view: StoreView, scope: TrackerScope, today: string): Row[] {
  return scope.tasks
    .filter((t) => !t.deleted && text(t, 'status') !== 'done' && text(t, 'due_date') !== '' && text(t, 'due_date') < today)
    .sort((a, b) => (text(a, 'due_date') < text(b, 'due_date') ? -1 : 1))
    .map((t) => brief(view, t, ['title', 'due_date', 'priority']));
}

/**
 * The ten most recent activity records of a project.
 * @param records - Records, oldest first.
 * @param projectId - Project.
 * @returns Rows, newest first.
 */
export function recentActivity(records: readonly ActivityRecord[], projectId: string): Row[] {
  return records
    .filter((r) => r['project_id'] === projectId)
    .slice(-10)
    .reverse()
    .map((r) => ({ summary: r['summary'], action: r['action'], entity_type: r['entity_type'], entity_id: r['entity_id'], ts: r['ts'], machine: r['machine'] }));
}

/**
 * The five most recent notes of a project and the unrelated ones.
 * @param view - View.
 * @param projectId - Project.
 * @returns Rows, newest first.
 */
export function recentNotes(view: StoreView, projectId: string): Row[] {
  return view
    .ofType('note')
    .filter((n) => !n.deleted && (n.projectId === projectId || text(n, 'related_entity_type') === ''))
    .reverse()
    .slice(0, 5)
    .map((n) => ({ id: n.id, title: text(n, 'title'), note_type: text(n, 'note_type'), created_at: n.record.data['created_at'] }));
}

/**
 * Store problems that hide data from the view (WL-43) and the scope of the store.
 * @param view - View.
 * @param warnings - Warning codes of the call (`repo.local_scope`, …).
 * @returns Non-zero counts and flags; empty when the store is clean.
 */
export function storeWarnings(view: StoreView, warnings: readonly string[]): Row {
  const conflicts = view.excluded.conflictCopies().length;
  const invalid = view.excluded.invalidFiles().length;
  return {
    ...(conflicts > 0 ? { conflict_copies: conflicts } : {}),
    ...(invalid > 0 ? { invalid_files: invalid } : {}),
    ...(warnings.includes('repo.local_scope') ? { local_scope: true } : {}),
    ...(conflicts + invalid > 0 ? { hint: 'run doctor to list the excluded files' } : {}),
  };
}
