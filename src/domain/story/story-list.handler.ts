/**
 * Lists stories.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { byEpicOrder, countStatus, isArchived } from '../epic/epic-list.handler.ts';
import { requireInView } from '../shared/lookup.ts';
import { listRow, percent, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import type { StoryListInput } from './story-list.operation.ts';

/**
 * Task counts of a story.
 * @param view - View.
 * @param story - Story.
 * @returns `task_count`, `done_count`, `completion_pct`.
 */
function storyCounts(view: StoreView, story: IndexedEntity): Row {
  const tasks = view.childrenOf(story.id).filter((t) => t.type === 'task' && !t.deleted && t.record.data['story_id'] === story.id);
  const done = countStatus(tasks, 'done');
  return { task_count: tasks.length, done_count: done, completion_pct: percent(done, tasks.length) };
}

/** Handles `story_list`. */
export class StoryListHandler implements OperationHandler<StoryListInput> {
  /**
   * Lists the stories.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   * @throws {WarlogError} `NOT_FOUND` for an unknown project.
   */
  async handle(input: StoryListInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    requireInView(view, 'project', input.project_id);
    const rows = view
      .list('story', input.project_id)
      .filter((s) => !s.deleted && (input.include_archived || !isArchived(s)))
      .filter((s) => input.epic_id === undefined || s.record.data['epic_id'] === input.epic_id)
      .filter((s) => input.status === undefined || text(s, 'status') === input.status)
      .filter((s) => input.priority === undefined || text(s, 'priority') === input.priority)
      .sort(byEpicOrder)
      .map((s) => listRow(s, storyCounts(view, s)));
    return { kind: 'list', rows };
  }
}
