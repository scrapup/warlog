/**
 * Soft-deletes a note (WL-08); the current tracker deleted notes for good — documented deviation.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { NoteDeleteInput } from './note-delete.operation.ts';

/** Handles `note_delete`. */
export class NoteDeleteHandler implements OperationHandler<NoteDeleteInput> {
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
   * Deletes the note.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ id, title, deleted: true }`.
   * @throws {WarlogError} `NOT_FOUND` (deleted notes included); `CONFLICT`.
   */
  async handle(input: NoteDeleteInput, context: OperationContext): Promise<OperationResult> {
    const note = await requireEntity(context.index, 'note', input.id);
    const title = text(note, 'title');
    if (!note.deleted) {
      await this.writers(context).softDelete(note, { by: '', reason: '' }, `Note '${title}' deleted`);
    }
    return { kind: 'object', value: { id: note.id, title, deleted: true } };
  }
}
