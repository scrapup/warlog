/**
 * Creates a story (`projects/<project>/stories/<id>.md`).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { StoryCreateInput } from './story-create.operation.ts';
import { assertCodeFree, epicInProject } from './story-rules.ts';

/** Handles `story_create`. */
export class StoryCreateHandler implements OperationHandler<StoryCreateInput> {
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
   * Creates the story.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The story.
   * @throws {WarlogError} `NOT_FOUND` for an unknown project or epic; `VALIDATION` for a duplicate code or an epic of another project.
   */
  async handle(input: StoryCreateInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const project = requireInView(view, 'project', input.project_id);
    epicInProject(view, project.id, input.epic_id);
    assertCodeFree(view, project.id, input.code);
    const fields = {
      project_id: project.id,
      ...(input.epic_id === undefined ? {} : { epic_id: input.epic_id }),
      title: input.title,
      ...(input.code === undefined ? {} : { code: input.code }),
      status: input.status,
      priority: input.priority,
      sort_order: 0,
      archived: false,
      tags: input.tags ?? [],
    };
    const label = input.code === undefined ? `'${input.title}'` : `${input.code} '${input.title}'`;
    const record = await this.writers(context).create(
      { type: 'story', id: context.ids.next(), scope: 'repo', projectId: project.id },
      fields,
      input.description ?? '',
      `Story ${label} created`,
    );
    return { kind: 'object', value: entityRow(record) };
  }
}
