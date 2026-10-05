/**
 * `note_list` (WL-10): notes with filters, newest first.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { NOTE_RELATED_TYPES, NOTE_TYPES, PROJECT_SCOPE, idField, limitField } from '../shared/fields.ts';
import { NoteListHandler } from './note-list.handler.ts';

/** Input schema. */
export const NOTE_LIST_INPUT = z.object({
  note_type: z.enum(NOTE_TYPES).optional().describe('Filter by note type'),
  related_entity_type: z.enum(NOTE_RELATED_TYPES).optional().describe('Filter by related entity type'),
  related_entity_id: idField('Filter by related entity').optional(),
  project_id: PROJECT_SCOPE,
  tag: z.string().max(64).optional().describe('Filter by a single tag'),
  limit: limitField(30),
});

/** Parsed input. */
export type NoteListInput = z.infer<typeof NOTE_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `note_list` operation.
 */
export function noteListOperation(): OperationDefinition {
  return {
    name: 'note_list',
    group: 'note',
    action: 'list',
    kind: 'query',
    input: NOTE_LIST_INPUT,
    description: 'List notes, newest first, with optional filters. Rows carry an excerpt; note content is returned by note_save, note_search hits and task_get.',
    examples: [{ note_type: 'decision', limit: 10 }],
    defaultFormat: 'table',
    load: 'full',
    handler: new NoteListHandler(),
  };
}
