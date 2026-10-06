/**
 * Resolves a variable project → repository → global with point reads only (plan §3.7).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { levelsOf, targetOf } from './var-scope.ts';
import { valueAtPath } from './var-path.ts';
import { describeType } from './var-type-validator.ts';
import type { VarLocation, VarRecord, VarRepositoryFactory } from './var.repository.ts';
import type { VarGetInput } from './var-get.operation.ts';

/**
 * Locations a read looks at.
 * @param context - Call context.
 * @param input - Input.
 * @returns Locations, most specific first.
 */
function locationsFor(context: OperationContext, input: VarGetInput): VarLocation[] {
  return input.scope === undefined ? levelsOf(context, input.name, input.project_id) : [targetOf(context, input.scope, input.name, input.project_id)];
}

/** Handles `var_get`. */
export class VarGetHandler implements OperationHandler<VarGetInput> {
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
   * Returns the winning value.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ value, type, scope, project_id?, path? }` (scalars also print raw).
   * @throws {WarlogError} `NOT_FOUND` when no scope has it or the path does not exist; `INVALID_FILE` for a malformed file or a value not matching its type; `NO_REPO_CONTEXT` for an explicit repository scope.
   */
  async handle(input: VarGetInput, context: OperationContext): Promise<OperationResult> {
    const repository = this.vars({ roots: context.roots, clock: context.clock, machine: context.machine });
    for (const location of locationsFor(context, input)) {
      const record = await repository.read(location);
      if (record !== undefined) {
        return this.present(record, location, input.path);
      }
    }
    throw new WarlogError('NOT_FOUND', `variable ${input.name} not found`, { type: 'var', name: input.name });
  }

  /**
   * Builds the result of a found variable.
   * @param record - Record.
   * @param location - Where it was found.
   * @param path - Path inside the value, when asked.
   * @returns The result.
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for a bad path.
   */
  private present(record: VarRecord, location: VarLocation, path: string | undefined): OperationResult {
    const value = path === undefined ? record.value : valueAtPath(record.value, path);
    const type = path === undefined ? record.type : describeType(value);
    const found = {
      value,
      type,
      scope: location.scope,
      ...(location.projectId === undefined ? {} : { project_id: location.projectId }),
      ...(path === undefined ? {} : { path }),
    };
    const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    return scalar ? { kind: 'object', value: found, raw: value } : { kind: 'object', value: found };
  }
}
