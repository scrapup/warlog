/**
 * Updates a project.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { changeEvents, changeFrom } from '../shared/changes.ts';
import type { ChangeSpec } from '../shared/changes.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { ProjectUpdateInput } from './project-update.operation.ts';

/** Field mapping of a project update. */
const SPEC: ChangeSpec = { fields: ['name', 'status', 'tags'], bodyField: 'description', tracked: ['name', 'status'] };

/** Handles `project_update`. */
export class ProjectUpdateHandler implements OperationHandler<ProjectUpdateInput> {
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
   * @returns The updated project.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` when nothing is set; `CONFLICT`.
   */
  async handle(input: ProjectUpdateInput, context: OperationContext): Promise<OperationResult> {
    const project = await requireEntity(context.index, 'project', input.id);
    const change = changeFrom(input, SPEC);
    const events = changeEvents(`project '${String(change.patch['name'] ?? text(project, 'name'))}'`, project.record, change.patch, SPEC.tracked);
    const record = await this.writers(context).update(project, change, events);
    return { kind: 'object', value: entityRow(record) };
  }
}
