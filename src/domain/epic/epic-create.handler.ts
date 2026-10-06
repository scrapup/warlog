/**
 * Creates an epic (`projects/<project>/epics/<id>.md`).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity, resolveBranch } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { EpicCreateInput } from './epic-create.operation.ts';

/** Handles `epic_create`. */
export class EpicCreateHandler implements OperationHandler<EpicCreateInput> {
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
   * Creates the epic.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The epic.
   * @throws {WarlogError} `NOT_FOUND` for an unknown project; `NO_REPO_CONTEXT`.
   */
  async handle(input: EpicCreateInput, context: OperationContext): Promise<OperationResult> {
    const project = await requireEntity(context.index, 'project', input.project_id);
    const branch = await resolveBranch(context, input.branch);
    const id = context.ids.next();
    const fields = {
      project_id: project.id,
      name: input.name,
      status: input.status,
      priority: input.priority,
      ...(typeof branch === 'string' ? { branch } : {}),
      sort_order: 0,
      archived: false,
      tags: input.tags ?? [],
    };
    const suffix = typeof branch === 'string' ? ` on branch '${branch}'` : '';
    const record = await this.writers(context).create(
      { type: 'epic', id, scope: 'repo', projectId: project.id },
      fields,
      input.description ?? '',
      `Epic '${input.name}' created in project ${project.id}${suffix}`,
    );
    return { kind: 'object', value: entityRow(record) };
  }
}
