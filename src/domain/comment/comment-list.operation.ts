/**
 * `comment_list` (WL-10): comments of a task, oldest first.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import { CommentListHandler } from './comment-list.handler.ts';

/** Input schema. */
export const COMMENT_LIST_INPUT = z.object({
  task_id: idField('Task ID'),
  include_deleted: z.boolean().default(false).describe('Include removed comments'),
});

/** Parsed input. */
export type CommentListInput = z.infer<typeof COMMENT_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `comment_list` operation.
 */
export function commentListOperation(): OperationDefinition {
  return {
    name: 'comment_list',
    group: 'comment',
    action: 'list',
    kind: 'query',
    input: COMMENT_LIST_INPUT,
    description: 'List the comments of a task, oldest first (with their content).',
    examples: [{ task_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new CommentListHandler(),
  };
}
