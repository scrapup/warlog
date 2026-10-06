/**
 * Archives or unarchives an epic; asking for the current state changes nothing.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { EpicArchiveInput } from './epic-archive.operation.ts';
import { epicTasks, isArchived } from './epic-list.handler.ts';

/** Handles `epic_archive`. */
export class EpicArchiveHandler implements OperationHandler<EpicArchiveInput> {
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
   * Sets the archived flag.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, epic }`.
   * @throws {WarlogError} `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: EpicArchiveInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const epic = requireInView(view, 'epic', input.id);
    if (isArchived(epic) === input.archived) {
      return { kind: 'object', value: { message: `Epic ${epic.id} is already ${input.archived ? 'archived' : 'active'}.`, epic: entityRow(epic.record) } };
    }
    const archivedAt = input.archived ? context.clock.now().toISOString() : undefined;
    const name = text(epic, 'name');
    const record = await this.writers(context).update(epic, { patch: { archived: input.archived, archived_at: archivedAt } }, [
      {
        action: 'updated',
        summary: `Epic '${name}' ${input.archived ? 'archived' : 'unarchived'}`,
        extra: { field: 'archived', old_value: String(!input.archived), new_value: String(input.archived) },
      },
    ]);
    const message = input.archived
      ? `Epic ${epic.id} archived. It and its ${epicTasks(view, epic).length} task(s) are hidden from listings; pass include_archived to see them.`
      : `Epic ${epic.id} is active again.`;
    return { kind: 'object', value: { message, epic: entityRow(record) } };
  }
}
