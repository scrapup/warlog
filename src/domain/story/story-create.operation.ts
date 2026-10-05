/**
 * `story_create` (WL-12): creates a user story between an epic and its tasks.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, EPIC_STATUSES, PRIORITIES, TAGS, TITLE, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { StoryCreateHandler } from './story-create.handler.ts';
import { STORY_CODE } from './story-rules.ts';

/** Input schema. */
export const STORY_CREATE_INPUT = z.object({
  project_id: idField('Parent project ID'),
  epic_id: idField('Parent epic ID (same project)').optional(),
  title: TITLE.describe('Story title'),
  code: STORY_CODE.optional().describe('Story code, unique in the project (e.g. US-12)'),
  description: DESCRIPTION.describe('Story narrative'),
  status: z.enum(EPIC_STATUSES).default('planned').describe('Story status'),
  priority: z.enum(PRIORITIES).default('medium').describe('Priority'),
  tags: TAGS,
});

/** Parsed input. */
export type StoryCreateInput = z.infer<typeof STORY_CREATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `story_create` operation.
 */
export function storyCreateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'story_create',
    group: 'story',
    action: 'create',
    kind: 'command',
    input: STORY_CREATE_INPUT,
    description: 'Create a user story in a project, optionally under an epic. code (e.g. US-12) must be unique in the project.',
    examples: [{ project_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C1', epic_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2', title: 'Pay with a saved card', code: 'US-12' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new StoryCreateHandler(writers),
  };
}
