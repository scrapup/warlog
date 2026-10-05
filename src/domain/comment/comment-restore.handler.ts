/**
 * Restores a soft-deleted comment (WL-08).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { CommentRestoreInput } from './comment-restore.operation.ts';

/** Handles `comment_restore`. */
export class CommentRestoreHandler implements OperationHandler<CommentRestoreInput> {
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
   * Restores the comment.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, comment }`.
   * @throws {WarlogError} `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: CommentRestoreInput, context: OperationContext): Promise<OperationResult> {
    const comment = await requireEntity(context.index, 'comment', input.id);
    if (!comment.deleted) {
      return { kind: 'object', value: { message: `Comment ${comment.id} is not removed — nothing to restore.`, comment: entityRow(comment.record, 'content') } };
    }
    const record = await this.writers(context).restore(comment, `Comment ${comment.id} restored`);
    return { kind: 'object', value: { message: `Comment ${comment.id} restored.`, comment: entityRow(record, 'content') } };
  }
}
