/**
 * Reads a story and summarizes its tasks.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { byCreation, entityRow, sortOrder } from '../shared/rows.ts';
import type { StoryGetInput } from './story-get.operation.ts';

/** Task fields shown in a story summary. */
const TASK_FIELDS = ['id', 'code', 'title', 'status', 'priority'] as const;

/** Handles `story_get`. */
export class StoryGetHandler implements OperationHandler<StoryGetInput> {
  /**
   * Returns the story and its live tasks (manual order, then creation).
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The story with `tasks`.
   * @throws {WarlogError} `NOT_FOUND`.
   */
  async handle(input: StoryGetInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const story = requireInView(view, 'story', input.id);
    const tasks = view
      .childrenOf(story.id)
      .filter((t) => t.type === 'task' && !t.deleted && t.record.data['story_id'] === story.id)
      .sort((a, b) => sortOrder(a) - sortOrder(b) || byCreation(a, b))
      .map((t) => Object.fromEntries(TASK_FIELDS.filter((f) => t.record.data[f] !== undefined).map((f) => [f, t.record.data[f]])));
    return { kind: 'object', value: { ...entityRow(story.record), tasks } };
  }
}
