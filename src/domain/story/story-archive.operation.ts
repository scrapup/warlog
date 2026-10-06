/**
 * `story_archive` (WL-12): hides a story from listings, or brings it back.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { StoryArchiveHandler } from './story-archive.handler.ts';

/** Input schema. */
export const STORY_ARCHIVE_INPUT = z.object({
  id: idField('Story ID'),
  archived: z.boolean().default(true).describe('true to archive, false to unarchive'),
});

/** Parsed input. */
export type StoryArchiveInput = z.infer<typeof STORY_ARCHIVE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `story_archive` operation.
 */
export function storyArchiveOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'story_archive',
    group: 'story',
    action: 'archive',
    kind: 'command',
    input: STORY_ARCHIVE_INPUT,
    description: 'Archive a story (hidden from story_list unless include_archived) or unarchive it with archived: false.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C3' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new StoryArchiveHandler(writers),
  };
}
