/**
 * Looks an item up by its external key.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { entityBrief } from '../link/node-label.ts';
import type { FindByExternalInput } from './find-by-external.operation.ts';
import { externalsOfEntity } from './external.schema.ts';

/** Handles `find_by_external`. */
export class FindByExternalHandler implements OperationHandler<FindByExternalInput> {
  /**
   * Returns the item.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ id, type, label, status?, project_id?, external }`.
   * @throws {WarlogError} `NOT_FOUND`.
   */
  async handle(input: FindByExternalInput, context: OperationContext): Promise<OperationResult> {
    const found = (await context.index.full()).byExternal(input.system, input.key);
    if (found === undefined || found.deleted) {
      throw new WarlogError('NOT_FOUND', `no item references ${input.system} ${input.key}`, { type: 'external', system: input.system, key: input.key });
    }
    return { kind: 'object', value: { ...entityBrief(found), ...(found.projectId === undefined ? {} : { project_id: found.projectId }), external: externalsOfEntity(found) } };
  }
}
