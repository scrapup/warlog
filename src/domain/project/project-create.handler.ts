/**
 * Creates a project (`projects/<id>/project.md`).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { EntityRecord } from '../../core/storage/entity-ref.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { ProjectCreateInput } from './project-create.operation.ts';

/** Fields of a new project. */
export interface NewProject {
  /** Name. */
  readonly name: string;
  /** Description (body). */
  readonly description?: string | undefined;
  /** Status. */
  readonly status: string;
  /** Tags. */
  readonly tags?: readonly string[] | undefined;
}

/**
 * Writes a new project.
 * @param writers - Writer factory.
 * @param context - Call context.
 * @param project - Project fields.
 * @param summary - Activity summary.
 * @returns The stored record.
 * @throws {WarlogError} `NO_REPO_CONTEXT` outside a repository.
 */
export async function createProject(writers: WriterFactory, context: OperationContext, project: NewProject, summary: string): Promise<EntityRecord> {
  const id = context.ids.next();
  const fields = { name: project.name, status: project.status, tags: [...(project.tags ?? [])] };
  return writers(context).create({ type: 'project', id, scope: 'repo', projectId: id }, fields, project.description ?? '', summary);
}

/** Handles `project_create`. */
export class ProjectCreateHandler implements OperationHandler<ProjectCreateInput> {
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
   * Creates the project.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The project.
   * @throws {WarlogError} `NO_REPO_CONTEXT` outside a repository.
   */
  async handle(input: ProjectCreateInput, context: OperationContext): Promise<OperationResult> {
    const record = await createProject(this.writers, context, input, `Project '${input.name}' created`);
    return { kind: 'object', value: entityRow(record) };
  }
}
