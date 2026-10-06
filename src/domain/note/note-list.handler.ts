/**
 * Lists notes. A project scope keeps the project's notes and the notes related to nothing (as
 * the current tracker does).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { resolveProjectScope } from '../shared/lookup.ts';
import { tagsOf, text } from '../shared/rows.ts';
import type { NoteListInput } from './note-list.operation.ts';
import { newestFirst, noteRow } from './note-rows.ts';

/**
 * Tells whether a note passes the filters.
 * @param note - Note.
 * @param input - Input.
 * @param projectId - Project scope.
 * @returns `true` when kept.
 */
function isListed(note: IndexedEntity, input: NoteListInput, projectId: string | undefined): boolean {
  const checks: [unknown, string][] = [
    [input.note_type, 'note_type'],
    [input.related_entity_type, 'related_entity_type'],
    [input.related_entity_id, 'related_entity_id'],
  ];
  const inScope = projectId === undefined || note.projectId === projectId || text(note, 'related_entity_type') === '';
  return !note.deleted && inScope && checks.every(([wanted, field]) => wanted === undefined || text(note, field) === wanted) && (input.tag === undefined || tagsOf(note).includes(input.tag));
}

/** Handles `note_list`. */
export class NoteListHandler implements OperationHandler<NoteListInput> {
  /**
   * Lists the notes.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for an unknown project scope.
   */
  async handle(input: NoteListInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const projectId = resolveProjectScope(context, view, input.project_id);
    const rows = view
      .ofType('note')
      .filter((n) => isListed(n, input, projectId))
      .sort(newestFirst)
      .slice(0, input.limit)
      .map(noteRow);
    return { kind: 'list', rows };
  }
}
