/**
 * Lists templates.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { TemplateListInput } from './template-list.operation.ts';
import { liveTemplates, templateRow } from './template-rules.ts';

/** Handles `template_list`. */
export class TemplateListHandler implements OperationHandler<TemplateListInput> {
  /**
   * Lists the live templates.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   */
  async handle(input: TemplateListInput, context: OperationContext): Promise<OperationResult> {
    return { kind: 'list', rows: liveTemplates(await context.index.full()).map((t) => templateRow(t, input.include_tasks === true)) };
  }
}
