/**
 * Creates a template (`$WARLOG_DIR/templates/<id>.md`).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { TemplateCreateInput } from './template-create.operation.ts';
import { assertNameFree } from './template-rules.ts';

/** Handles `template_create`. */
export class TemplateCreateHandler implements OperationHandler<TemplateCreateInput> {
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
   * Creates the template.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The template.
   * @throws {WarlogError} `VALIDATION` for a duplicate name.
   */
  async handle(input: TemplateCreateInput, context: OperationContext): Promise<OperationResult> {
    assertNameFree(await context.index.full(), input.name);
    const record = await this.writers(context).create(
      { type: 'template', id: context.ids.next(), scope: 'global' },
      { name: input.name, tasks: input.tasks },
      input.description ?? '',
      `Template '${input.name}' created with ${input.tasks.length} task(s)`,
    );
    return { kind: 'object', value: entityRow(record) };
  }
}
