/**
 * Builds the project overview.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { isArchived } from '../epic/epic-list.handler.ts';
import { requireInView, resolveBranch, resolveProjectScope } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import { activityOf } from './activity-source.ts';
import { blockedTasks, dashboardEpics, dashboardStats, overdueTasks, recentActivity, recentNotes, storeWarnings } from './dashboard-sections.ts';
import { dashboardSummary } from './dashboard-summary.ts';
import type { TrackerDashboardInput } from './tracker-dashboard.operation.ts';
import { trackerScope } from './tracker-scope.ts';

/**
 * Counts of what the default view hides.
 * @param view - View.
 * @param projectId - Project.
 * @returns `archived_epic_count` and `removed_task_count`, when non-zero.
 */
function hiddenCounts(view: StoreView, projectId: string): Record<string, number> {
  const archived = view.list('epic', projectId).filter((e) => isArchived(e)).length;
  const removed = view.list('task', projectId).filter((t) => t.deleted).length;
  return { ...(archived > 0 ? { archived_epic_count: archived } : {}), ...(removed > 0 ? { removed_task_count: removed } : {}) };
}

/**
 * Labels of the hidden counts for the summary.
 * @param hidden - Hidden counts.
 * @returns Labels.
 */
function hiddenLabels(hidden: Record<string, number>): string[] {
  return [
    ...(hidden['archived_epic_count'] === undefined ? [] : [`${hidden['archived_epic_count']} archived epic(s)`]),
    ...(hidden['removed_task_count'] === undefined ? [] : [`${hidden['removed_task_count']} removed task(s)`]),
  ];
}

/** Handles `tracker_dashboard`. */
export class TrackerDashboardHandler implements OperationHandler<TrackerDashboardInput> {
  /** File system. */
  private readonly fs: FileSystem;

  /**
   * Creates the handler.
   * @param fs - File system.
   */
  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  /**
   * Builds the dashboard of the scoped project (or the first project when none is given).
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The overview, or `{ message, projects: [] }` on an empty store.
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for an unknown project scope.
   */
  async handle(input: TrackerDashboardInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const projects = view.ofType('project');
    const scoped = resolveProjectScope(context, view, input.project_id);
    const project: IndexedEntity | undefined = scoped === undefined ? projects[0] : requireInView(view, 'project', scoped);
    if (project === undefined) {
      return { kind: 'object', value: { message: 'No projects found. Use tracker_init or project_create to get started.', projects: [] } };
    }
    const branch = await resolveBranch(context, input.branch);
    const scope = trackerScope(view, { projectId: project.id, branch, includeHidden: input.include_archived });
    const stats = dashboardStats(scope);
    const epics = dashboardEpics(view, scope);
    const overdue = overdueTasks(view, scope, context.clock.now().toISOString().slice(0, 10));
    const hidden = hiddenCounts(view, project.id);
    const others = scoped === undefined ? projects.filter((p) => p.id !== project.id).map((p) => ({ id: p.id, name: text(p, 'name'), status: text(p, 'status') })) : [];
    const branchLabel = branch === undefined ? undefined : (branch ?? '(branch-agnostic)');
    const { records } = await activityOf(this.fs, context);
    const warnings = storeWarnings(view, context.warnings);
    return {
      kind: 'object',
      value: {
        summary: dashboardSummary({ projectName: text(project, 'name'), branchLabel, stats, epics, overdue: overdue.length, hidden: input.include_archived ? [] : hiddenLabels(hidden), others: others.length }),
        ...hidden,
        ...(others.length > 0 ? { other_projects: others } : {}),
        ...(Object.keys(warnings).length > 0 ? { store_warnings: warnings } : {}),
        project: entityRow(project.record),
        branch_scope: branchLabel ?? null,
        stats,
        epics,
        blocked_tasks: blockedTasks(view, scope),
        overdue_tasks: overdue,
        recent_activity: recentActivity(records, project.id),
        recent_notes: recentNotes(view, project.id),
      },
    };
  }
}
