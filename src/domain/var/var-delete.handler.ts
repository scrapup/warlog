/**
 * Soft-deletes a variable of one scope.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { recordVarActivity } from './var-activity.ts';
import { targetOf } from './var-scope.ts';
import type { VarRepositoryFactory } from './var.repository.ts';
import type { VarDeleteInput } from './var-delete.operation.ts';

/** Handles `var_delete`. */
export class VarDeleteHandler implements OperationHandler<VarDeleteInput> {
  /** Variable repository factory. */
  private readonly vars: VarRepositoryFactory;

  /**
   * Creates the handler.
   * @param vars - Variable repository factory.
   */
  constructor(vars: VarRepositoryFactory) {
    this.vars = vars;
  }

  /**
   * Deletes the variable.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ name, scope, deleted: true }`.
   * @throws {WarlogError} `NOT_FOUND` when the scope has no such variable; `NO_REPO_CONTEXT`; `INVALID_FILE`.
   */
  async handle(input: VarDeleteInput, context: OperationContext): Promise<OperationResult> {
    const location = targetOf(context, input.scope, input.name, input.project_id);
    const repository = this.vars({ roots: context.roots, clock: context.clock, machine: context.machine });
    const removed = await repository.remove(location, '');
    if (removed === undefined) {
      throw new WarlogError('NOT_FOUND', `variable ${input.name} not found at ${input.scope} scope`, { type: 'var', name: input.name, scope: input.scope });
    }
    await context.index.refresh(await repository.pathOf(location));
    recordVarActivity(context, location, 'deleted', `Variable '${input.name}' deleted at ${input.scope} scope`);
    return { kind: 'object', value: { name: input.name, scope: input.scope, deleted: true } };
  }
}
