/**
 * `story_update` (WL-12): changes a story's fields.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, EPIC_STATUSES, PRIORITIES, TAGS, TITLE, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { StoryUpdateHandler } from './story-update.handler.ts';
import { STORY_CODE } from './story-rules.ts';

/** Input schema. */
export const STORY_UPDATE_INPUT = z.object({
  id: idField('Story ID'),
  epic_id: idField('Parent epic ID (same project)').optional(),
  title: TITLE.optional().describe('Story title'),
  code: STORY_CODE.optional().describe('Story code, unique in the project'),
  description: DESCRIPTION.describe('Story narrative'),
  status: z.enum(EPIC_STATUSES).optional().describe('Story status'),
  priority: z.enum(PRIORITIES).optional().describe('Priority'),
  sort_order: z.number().int().min(0).optional().describe('Manual position; lower sorts first'),
  tags: TAGS,
});

/** Parsed input. */
export type StoryUpdateInput = z.infer<typeof STORY_UPDATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `story_update` operation.
 */
export function storyUpdateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'story_update',
    group: 'story',
    action: 'update',
    kind: 'command',
    input: STORY_UPDATE_INPUT,
    description: 'Update a story (code stays unique in the project; epic must belong to the same project).',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C3', status: 'in_progress' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new StoryUpdateHandler(writers),
  };
}
