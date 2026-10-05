/**
 * `story_get` (WL-12): one story with its tasks.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import { StoryGetHandler } from './story-get.handler.ts';

/** Input schema. */
export const STORY_GET_INPUT = z.object({ id: idField('Story ID') });

/** Parsed input. */
export type StoryGetInput = z.infer<typeof STORY_GET_INPUT>;

/**
 * Builds the definition.
 * @returns The `story_get` operation.
 */
export function storyGetOperation(): OperationDefinition {
  return {
    name: 'story_get',
    group: 'story',
    action: 'get',
    kind: 'query',
    input: STORY_GET_INPUT,
    description: 'Get a story with its narrative and a summary of its tasks.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C3' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new StoryGetHandler(),
  };
}
