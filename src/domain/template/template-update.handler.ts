/**
 * Updates a template.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { changeFrom } from '../shared/changes.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { assertNameFree } from './template-rules.ts';
import type { TemplateUpdateInput } from './template-update.operation.ts';

/** Handles `template_update`. */
export class TemplateUpdateHandler implements OperationHandler<TemplateUpdateInput> {
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
   * @returns The template.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` (nothing set, duplicate name); `CONFLICT`.
   */
  async handle(input: TemplateUpdateInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const template = requireInView(view, 'template', input.id);
    const change = changeFrom(input, { fields: ['name', 'tasks'], bodyField: 'description', tracked: [] });
    if (input.name !== undefined) {
      assertNameFree(view, input.name, template.id);
    }
    const changed = [...Object.keys(change.patch).map((k) => (k === 'tasks' ? `tasks (${String(input.tasks?.length)})` : k)), ...(change.body === undefined ? [] : ['description'])];
    const name = input.name ?? text(template, 'name');
    const record = await this.writers(context).update(template, change, [{ action: 'updated', summary: `Template '${name}' updated: ${changed.join(', ')}` }]);
    return { kind: 'object', value: entityRow(record) };
  }
}
