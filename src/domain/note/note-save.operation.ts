/**
 * `note_save` (WL-10): creates a note, or updates it when `id` is given (upsert).
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { NOTE_RELATED_TYPES, NOTE_TYPES, TAGS, TITLE, enumWithDocumentedDefault, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { NoteSaveHandler } from './note-save.handler.ts';

/** Input schema. */
export const NOTE_SAVE_INPUT = z.object({
  id: idField('Note ID (provide to update, omit to create)').optional(),
  title: TITLE.describe('Note title'),
  content: z.string().max(200_000).describe('Note content (Markdown)'),
  note_type: enumWithDocumentedDefault(NOTE_TYPES, 'general').describe('Note type (default general on creation; unchanged on update when omitted)'),
  related_entity_type: z.enum(NOTE_RELATED_TYPES).optional().describe('Related entity type'),
  related_entity_id: idField('Related entity ID').optional(),
  tags: TAGS,
});

/** Parsed input. */
export type NoteSaveInput = z.infer<typeof NOTE_SAVE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `note_save` operation.
 */
export function noteSaveOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'note_save',
    group: 'note',
    action: 'save',
    kind: 'command',
    input: NOTE_SAVE_INPUT,
    description:
      'Create a note (decision, context, progress, …) or update it when id is given. A note related to a project, epic or task is stored in that project.',
    examples: [{ title: 'Branching strategy', content: 'trunk-based; base main', note_type: 'decision', related_entity_type: 'project', related_entity_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C1' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new NoteSaveHandler(writers),
  };
}
