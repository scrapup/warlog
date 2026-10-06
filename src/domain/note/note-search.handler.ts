/**
 * Searches notes literally (WL-47), newest first.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { text } from '../shared/rows.ts';
import { matchesAll, tokensOf } from '../shared/text-search.ts';
import type { NoteSearchInput } from './note-search.operation.ts';
import { newestFirst, noteRow } from './note-rows.ts';

/** Handles `note_search`. */
export class NoteSearchHandler implements OperationHandler<NoteSearchInput> {
  /**
   * Finds the notes containing every query word.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   */
  async handle(input: NoteSearchInput, context: OperationContext): Promise<OperationResult> {
    const tokens = tokensOf(input.query);
    const rows = (await context.index.full())
      .ofType('note')
      .filter((n) => !n.deleted && (input.note_type === undefined || text(n, 'note_type') === input.note_type))
      .filter((n) => matchesAll(tokens, `${text(n, 'title')}\n${n.record.body}`))
      .sort(newestFirst)
      .slice(0, input.limit)
      .map(noteRow);
    return { kind: 'list', rows };
  }
}
