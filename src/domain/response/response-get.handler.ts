/**
 * Reads one response with a point read.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { ResponseGetInput } from './response-get.operation.ts';

/** Handles `response_get`. */
export class ResponseGetHandler implements OperationHandler<ResponseGetInput> {
  /**
   * Returns the response.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The response.
   * @throws {WarlogError} `NOT_FOUND`.
   */
  async handle(input: ResponseGetInput, context: OperationContext): Promise<OperationResult> {
    const response = await requireEntity(context.index, 'response', input.id);
    return { kind: 'object', value: entityRow(response.record, 'content') };
  }
}
