/**
 * `comment_restore` (WL-08, WL-10): brings back a removed comment.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { CommentRestoreHandler } from './comment-restore.handler.ts';

/** Input schema. */
export const COMMENT_RESTORE_INPUT = z.object({ id: idField('Comment ID') });

/** Parsed input. */
export type CommentRestoreInput = z.infer<typeof COMMENT_RESTORE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `comment_restore` operation.
 */
export function commentRestoreOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'comment_restore',
    group: 'comment',
    action: 'restore',
    kind: 'command',
    input: COMMENT_RESTORE_INPUT,
    description: 'Restore a removed comment.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C9' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new CommentRestoreHandler(writers),
  };
}
