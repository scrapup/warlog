/**
 * Initializes the tracker of the repository store.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { createProject } from '../project/project-create.handler.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { TrackerInitInput } from './tracker-init.operation.ts';

/** Handles `tracker_init`. */
export class TrackerInitHandler implements OperationHandler<TrackerInitInput> {
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
   * Returns the first existing project or creates one.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, project }` or `{ message, projects: [] }`.
   * @throws {WarlogError} `NO_REPO_CONTEXT` outside a repository.
   */
  async handle(input: TrackerInitInput, context: OperationContext): Promise<OperationResult> {
    const [existing] = (await context.index.full()).ofType('project');
    if (existing !== undefined) {
      return { kind: 'object', value: { message: 'Tracker already initialized. Returning existing project.', project: entityRow(existing.record) } };
    }
    if (input.project_name === undefined) {
      return { kind: 'object', value: { message: 'Store is empty. Provide a project_name to create your first project.', projects: [] } };
    }
    const project = { name: input.project_name, description: input.project_description, status: 'active' };
    const record = await createProject(this.writers, context, project, `Project '${input.project_name}' initialized`);
    return { kind: 'object', value: { message: `Project '${input.project_name}' created. Use epic_create to start adding work.`, project: entityRow(record) } };
  }
}
