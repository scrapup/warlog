/**
 * Restores a soft-deleted note (WL-08).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { NoteRestoreInput } from './note-restore.operation.ts';

/** Handles `note_restore`. */
export class NoteRestoreHandler implements OperationHandler<NoteRestoreInput> {
  /** Writer factory. */
  private readonly writers: WriterFactory;

  /**
   * Creates the handler.
   * @param writers - Writer factory.
   */
  constructor(writers: WriterFactory) {
    this.writers = writers;
  }

  /**
   * Restores the note.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, note }`.
   * @throws {WarlogError} `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: NoteRestoreInput, context: OperationContext): Promise<OperationResult> {
    const note = await requireEntity(context.index, 'note', input.id);
    if (!note.deleted) {
      return { kind: 'object', value: { message: `Note ${note.id} is not deleted — nothing to restore.`, note: entityRow(note.record, 'content') } };
    }
    const record = await this.writers(context).restore(note, `Note '${text(note, 'title')}' restored`);
    return { kind: 'object', value: { message: `Note ${note.id} restored.`, note: entityRow(record, 'content') } };
  }
}
