/**
 * `epic_archive` (WL-10): hides an epic and its tasks from listings, or brings it back.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { EpicArchiveHandler } from './epic-archive.handler.ts';

/** Input schema. */
export const EPIC_ARCHIVE_INPUT = z.object({
  id: idField('Epic ID'),
  archived: z.boolean().default(true).describe('true to archive, false to unarchive'),
});

/** Parsed input. */
export type EpicArchiveInput = z.infer<typeof EPIC_ARCHIVE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `epic_archive` operation.
 */
export function epicArchiveOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'epic_archive',
    group: 'epic',
    action: 'archive',
    kind: 'command',
    input: EPIC_ARCHIVE_INPUT,
    description: 'Archive an epic (it and its tasks are hidden from listings; pass include_archived to see them) or unarchive it with archived: false.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new EpicArchiveHandler(writers),
  };
}
