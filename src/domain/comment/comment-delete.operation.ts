/**
 * `comment_delete` (WL-08, WL-10): soft-removes a comment.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { CommentDeleteHandler } from './comment-delete.handler.ts';

/** Input schema. */
export const COMMENT_DELETE_INPUT = z.object({
  id: idField('Comment ID'),
  reason: z.string().max(2000).optional().describe('Why it is being removed'),
  deleted_by: z.string().max(200).optional().describe('Who removes it'),
});

/** Parsed input. */
export type CommentDeleteInput = z.infer<typeof COMMENT_DELETE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `comment_delete` operation.
 */
export function commentDeleteOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'comment_delete',
    group: 'comment',
    action: 'delete',
    kind: 'command',
    input: COMMENT_DELETE_INPUT,
    description: 'Remove a comment (soft: kept for audit; comment_list include_deleted shows it, comment_restore brings it back).',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C9', reason: 'wrong task' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new CommentDeleteHandler(writers),
  };
}
