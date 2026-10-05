/**
 * Lists the comments of a task. Comments are the task's conversation, so their content is part
 * of the listing (rendered as YAML by default).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { byCreation, entityRow } from '../shared/rows.ts';
import type { CommentListInput } from './comment-list.operation.ts';

/** Handles `comment_list`. */
export class CommentListHandler implements OperationHandler<CommentListInput> {
  /**
   * Lists the comments.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The comments.
   * @throws {WarlogError} `NOT_FOUND` for an unknown task.
   */
  async handle(input: CommentListInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const task = requireInView(view, 'task', input.task_id);
    const rows = view
      .childrenOf(task.id)
      .filter((c) => c.type === 'comment' && (input.include_deleted || !c.deleted))
      .sort(byCreation)
      .map((c) => entityRow(c.record, 'content'));
    return { kind: 'list', rows };
  }
}
