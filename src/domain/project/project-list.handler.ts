/**
 * Lists projects with their counts.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { byCreation, listRow, percent, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import type { ProjectListInput } from './project-list.operation.ts';

/**
 * Counts of a project (live epics and tasks).
 * @param view - View.
 * @param project - Project.
 * @returns `epic_count`, `task_count`, `done_count`, `completion_pct`.
 */
export function projectCounts(view: StoreView, project: IndexedEntity): Row {
  const epics = view.list('epic', project.id).filter((e) => !e.deleted);
  const tasks = view.list('task', project.id).filter((t) => !t.deleted);
  const done = tasks.filter((t) => text(t, 'status') === 'done').length;
  return { epic_count: epics.length, task_count: tasks.length, done_count: done, completion_pct: percent(done, tasks.length) };
}

/** Handles `project_list`. */
export class ProjectListHandler implements OperationHandler<ProjectListInput> {
  /**
   * Lists the projects, newest first.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   */
  async handle(input: ProjectListInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const rows = view
      .ofType('project')
      .filter((p) => input.status === undefined || text(p, 'status') === input.status)
      .sort((a, b) => byCreation(b, a))
      .map((p) => listRow(p, projectCounts(view, p)));
    return { kind: 'list', rows };
  }
}
