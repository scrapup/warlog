/**
 * `comment_add` (WL-10): appends a comment to a task.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { CommentAddHandler } from './comment-add.handler.ts';

/** Input schema. */
export const COMMENT_ADD_INPUT = z.object({
  task_id: idField('Task ID to comment on'),
  content: z.string().trim().min(1).max(100_000).describe('Comment text (Markdown)'),
  author: z.string().max(200).optional().describe('Comment author'),
});

/** Parsed input. */
export type CommentAddInput = z.infer<typeof COMMENT_ADD_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `comment_add` operation.
 */
export function commentAddOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'comment_add',
    group: 'comment',
    action: 'add',
    kind: 'command',
    input: COMMENT_ADD_INPUT,
    description: 'Add a comment to a task (append-only: comments are never edited; remove with comment_delete).',
    examples: [{ task_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', content: 'RT-02 green; starting RT-03', author: 'agent' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new CommentAddHandler(writers),
  };
}
