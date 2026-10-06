/**
 * Archives or unarchives a story; asking for the current state changes nothing.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { isArchived } from '../epic/epic-list.handler.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { StoryArchiveInput } from './story-archive.operation.ts';

/** Handles `story_archive`. */
export class StoryArchiveHandler implements OperationHandler<StoryArchiveInput> {
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
   * @returns `{ message, story }`.
   * @throws {WarlogError} `NOT_FOUND`; `CONFLICT`.
   */
  async handle(input: StoryArchiveInput, context: OperationContext): Promise<OperationResult> {
    const story = await requireEntity(context.index, 'story', input.id);
    const state = input.archived ? 'archived' : 'active';
    if (isArchived(story) === input.archived) {
      return { kind: 'object', value: { message: `Story ${story.id} is already ${state}.`, story: entityRow(story.record) } };
    }
    const record = await this.writers(context).update(story, { patch: { archived: input.archived } }, [
      {
        action: 'updated',
        summary: `Story '${text(story, 'title')}' ${input.archived ? 'archived' : 'unarchived'}`,
        extra: { field: 'archived', old_value: String(!input.archived), new_value: String(input.archived) },
      },
    ]);
    return { kind: 'object', value: { message: `Story ${story.id} is now ${state}.`, story: entityRow(record) } };
  }
}
