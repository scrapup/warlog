/**
 * Soft-deletes a comment (WL-08).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { CommentDeleteInput } from './comment-delete.operation.ts';

/** Handles `comment_delete`. */
export class CommentDeleteHandler implements OperationHandler<CommentDeleteInput> {
  /** Writer factory. */
  private readonly writers: WriterFactory;

  /**
   * Creates the handler.
   * @param writers - Writer factory.
   */
  constructor(writers: WriterFactory) {
    this.writers = writers;
  }

  /**
   * Removes the comment.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, comment }`.
   * @throws {WarlogError} `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: CommentDeleteInput, context: OperationContext): Promise<OperationResult> {
    const comment = await requireEntity(context.index, 'comment', input.id);
    if (comment.deleted) {
      return { kind: 'object', value: { message: `Comment ${comment.id} was already removed.`, comment: entityRow(comment.record, 'content') } };
    }
    const by = input.deleted_by ?? '';
    const reason = input.reason ?? '';
    const summary = `Comment ${comment.id} removed${by === '' ? '' : ` by ${by}`}${reason === '' ? '' : `: ${reason}`}`;
    const record = await this.writers(context).softDelete(comment, { by, reason }, summary);
    return {
      kind: 'object',
      value: { message: `Comment ${comment.id} removed. The file is retained for audit — pass include_deleted to comment_list to see it, or comment_restore to bring it back.`, comment: entityRow(record, 'content') },
    };
  }
}
