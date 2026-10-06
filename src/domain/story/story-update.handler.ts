/**
 * Updates a story.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { changeEvents, changeFrom } from '../shared/changes.ts';
import type { ChangeSpec } from '../shared/changes.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { assertCodeFree, epicInProject } from './story-rules.ts';
import type { StoryUpdateInput } from './story-update.operation.ts';

/** Field mapping of a story update. */
const SPEC: ChangeSpec = {
  fields: ['epic_id', 'title', 'code', 'status', 'priority', 'sort_order', 'tags'],
  bodyField: 'description',
  tracked: ['title', 'code', 'status', 'priority', 'epic_id'],
};

/** Handles `story_update`. */
export class StoryUpdateHandler implements OperationHandler<StoryUpdateInput> {
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
   * Applies the change.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The updated story.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` (nothing set, duplicate code, foreign epic); `CONFLICT`.
   */
  async handle(input: StoryUpdateInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const story = requireInView(view, 'story', input.id);
    const projectId = String(story.projectId);
    const change = changeFrom(input, SPEC);
    epicInProject(view, projectId, input.epic_id);
    assertCodeFree(view, projectId, input.code, story.id);
    const label = `story '${String(change.patch['title'] ?? text(story, 'title'))}'`;
    const record = await this.writers(context).update(story, change, changeEvents(label, story.record, change.patch, SPEC.tracked));
    return { kind: 'object', value: entityRow(record) };
  }
}
