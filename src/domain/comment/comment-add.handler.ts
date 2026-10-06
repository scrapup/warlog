/**
 * Appends a comment (`projects/<p>/comments/<task>/<id>.md`); comment files are never rewritten
 * except to mark or clear their deletion.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { CommentAddInput } from './comment-add.operation.ts';

/** Handles `comment_add`. */
export class CommentAddHandler implements OperationHandler<CommentAddInput> {
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
   * Adds the comment.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The comment.
   * @throws {WarlogError} `NOT_FOUND` for an unknown task.
   */
  async handle(input: CommentAddInput, context: OperationContext): Promise<OperationResult> {
    const task = await requireEntity(context.index, 'task', input.task_id);
    const projectId = String(task.projectId);
    const by = input.author === undefined ? '' : ` by ${input.author}`;
    const record = await this.writers(context).create(
      { type: 'comment', id: context.ids.next(), scope: 'repo', projectId, taskId: task.id },
      { project_id: projectId, task_id: task.id, ...(input.author === undefined ? {} : { author: input.author }) },
      input.content,
      `Comment added to task '${text(task, 'title')}'${by}`,
    );
    return { kind: 'object', value: entityRow(record, 'content') };
  }
}
