/**
 * Writes a typed variable.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { recordVarActivity } from './var-activity.ts';
import { targetOf } from './var-scope.ts';
import { assertType, inferType } from './var-type-validator.ts';
import { assertMatchesSchema, assertRestrictedSchema } from './restricted-schema-validator.ts';
import type { VarContent, VarRecord, VarRepositoryFactory } from './var.repository.ts';
import type { VarSetInput } from './var-set.operation.ts';

/**
 * Tells whether a write changes the declared type of an existing variable; that needs `force` (WL-26).
 * @param input - Caller input.
 * @param current - Current live record.
 * @returns `true` for a (forced) type change.
 * @throws {WarlogError} `VALIDATION` when the type changes without `force`.
 */
function changesType(input: VarSetInput, current: VarRecord | undefined): boolean {
  const changes = current !== undefined && input.type !== undefined && input.type !== current.type;
  if (changes && !input.force) {
    throw new WarlogError('VALIDATION', `changing the type of ${input.name} from ${current.type} to ${String(input.type)} needs force`, { field: 'type', current: current.type });
  }
  return changes;
}

/**
 * Computes the new content of a variable from its current state (WL-26).
 * @param input - Caller input.
 * @param current - Current live record.
 * @returns The content to store.
 * @throws {WarlogError} `VALIDATION` when the type changes without `force`, or the value does not match its type or schema.
 */
function contentFor(input: VarSetInput, current: VarRecord | undefined): VarContent {
  const typeChanges = changesType(input, current);
  const type = input.type ?? current?.type ?? inferType(input.value);
  assertType(type, input.value);
  const schema = input.schema ?? (typeChanges ? undefined : current?.schema);
  if (schema !== undefined) {
    assertMatchesSchema(schema, input.value);
  }
  return { type, value: input.value, schema };
}

/** Handles `var_set`. */
export class VarSetHandler implements OperationHandler<VarSetInput> {
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
   * Stores the variable.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ name, scope, project_id?, type, value, rev }`.
   * @throws {WarlogError} `VALIDATION`; `NO_REPO_CONTEXT`; `INVALID_FILE` when the current file is malformed.
   */
  async handle(input: VarSetInput, context: OperationContext): Promise<OperationResult> {
    const location = targetOf(context, input.scope, input.name, input.project_id);
    if (input.schema !== undefined) {
      assertRestrictedSchema(input.schema);
    }
    let existed = false;
    const repository = this.vars({ roots: context.roots, clock: context.clock, machine: context.machine });
    const record = await repository.write(location, (current) => {
      existed = current !== undefined;
      return contentFor(input, current);
    });
    await context.index.refresh(await repository.pathOf(location));
    recordVarActivity(context, location, existed ? 'updated' : 'created', `Variable '${input.name}' ${existed ? 'updated' : 'created'} at ${input.scope} scope`);
    return { kind: 'object', value: { name: record.name, scope: input.scope, ...(location.projectId === undefined ? {} : { project_id: location.projectId }), type: record.type, value: record.value, rev: record.rev } };
  }
}
