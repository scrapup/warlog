/**
 * `note_restore` (WL-08): Restore a deleted note.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { NoteRestoreHandler } from './note-restore.handler.ts';

/** Input schema. */
export const NOTE_RESTORE_INPUT = z.object({ id: idField('Note ID') });

/** Parsed input. */
export type NoteRestoreInput = z.infer<typeof NOTE_RESTORE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `note_restore` operation.
 */
export function noteRestoreOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'note_restore',
    group: 'note',
    action: 'restore',
    kind: 'command',
    input: NOTE_RESTORE_INPUT,
    description: 'Restore a deleted note.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C8' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new NoteRestoreHandler(writers),
  };
}
