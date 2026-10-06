/**
 * `story_list` (WL-12): stories of a project (or epic) with task counts.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { EPIC_STATUSES, PRIORITIES, idField } from '../shared/fields.ts';
import { StoryListHandler } from './story-list.handler.ts';

/** Input schema. */
export const STORY_LIST_INPUT = z.object({
  project_id: idField('Project ID'),
  epic_id: idField('Filter by epic').optional(),
  status: z.enum(EPIC_STATUSES).optional().describe('Filter by status'),
  priority: z.enum(PRIORITIES).optional().describe('Filter by priority'),
  include_archived: z.boolean().default(false).describe('Include archived stories'),
});

/** Parsed input. */
export type StoryListInput = z.infer<typeof STORY_LIST_INPUT>;


/**
 * Builds the definition.
 * @returns The `story_list` operation.
 */
export function storyListOperation(): OperationDefinition {
  return {
    name: 'story_list',
    group: 'story',
    action: 'list',
    kind: 'query',
    input: STORY_LIST_INPUT,
    description: 'List stories of a project (optionally of one epic) with task counts, in manual order.',
    examples: [{ project_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C1', epic_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2' }],
    defaultFormat: 'table',
    load: 'full',
    handler: new StoryListHandler(),
  };
}
