/**
 * Soft-deletes a template (WL-08).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { TemplateDeleteInput } from './template-delete.operation.ts';

/** Handles `template_delete`. */
export class TemplateDeleteHandler implements OperationHandler<TemplateDeleteInput> {
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
   * Deletes the template.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message }`.
   * @throws {WarlogError} `NOT_FOUND` (also for a deleted template); `CONFLICT`.
   */
  async handle(input: TemplateDeleteInput, context: OperationContext): Promise<OperationResult> {
    const template = await requireEntity(context.index, 'template', input.id);
    const name = text(template, 'name');
    if (!template.deleted) {
      await this.writers(context).softDelete(template, { by: '', reason: '' }, `Template '${name}' deleted`);
    }
    return { kind: 'object', value: { message: `Template '${name}' deleted` } };
  }
}
