/**
 * `note_delete` (WL-08): Delete a note (soft: kept in the store and restorable with note_restore — a documented deviation from the current tracker's hard delete).
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { NoteDeleteHandler } from './note-delete.handler.ts';

/** Input schema. */
export const NOTE_DELETE_INPUT = z.object({ id: idField('Note ID') });

/** Parsed input. */
export type NoteDeleteInput = z.infer<typeof NOTE_DELETE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `note_delete` operation.
 */
export function noteDeleteOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'note_delete',
    group: 'note',
    action: 'delete',
    kind: 'command',
    input: NOTE_DELETE_INPUT,
    description: "Delete a note (soft: kept in the store and restorable with note_restore — a documented deviation from the current tracker's hard delete).",
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C8' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new NoteDeleteHandler(writers),
  };
}
