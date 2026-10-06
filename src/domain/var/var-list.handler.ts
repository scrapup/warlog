/**
 * Lists variables from the view.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedVar } from '../../core/ports/store-view.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import type { Row } from '../shared/rows.ts';
import { projectOf } from './var-scope.ts';
import { VAR_SCOPES } from './var.repository.ts';
import type { VarScope } from './var.repository.ts';
import type { VarListInput } from './var-list.operation.ts';

/**
 * Scope of an indexed variable.
 * @param v - Variable.
 * @returns `project`, `repo` or `global`.
 */
function scopeOf(v: IndexedVar): VarScope {
  return v.projectId !== undefined ? 'project' : v.scope;
}

/**
 * List row of a variable.
 * @param v - Variable.
 * @returns The row.
 */
function row(v: IndexedVar): Row {
  return {
    name: v.name,
    scope: scopeOf(v),
    ...(v.projectId === undefined ? {} : { project_id: v.projectId }),
    type: v.data['type'],
    value: v.data['value'],
    rev: v.data['rev'],
  };
}

/** Handles `var_list`. */
export class VarListHandler implements OperationHandler<VarListInput> {
  /**
   * Lists the variables.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows, by name (and scope specificity).
   * @throws {WarlogError} `VALIDATION` when `effective` is combined with `scope`.
   */
  async handle(input: VarListInput, context: OperationContext): Promise<OperationResult> {
    if (input.effective === true && input.scope !== undefined) {
      throw new WarlogError('VALIDATION', 'effective cannot be combined with scope', { field: 'scope' });
    }
    const live = (await context.index.full()).listVars((v) => v.data['deleted_at'] === undefined);
    const project = projectOf(context, input.project_id);
    const pool = input.effective === true ? live.filter((v) => scopeOf(v) !== 'project' || v.projectId === project) : live.filter((v) => input.scope === undefined || scopeOf(v) === input.scope);
    const scoped = input.effective !== true && input.project_id !== undefined ? pool.filter((v) => v.projectId === input.project_id) : pool;
    const ordered = [...scoped].sort((a, b) => compareCodeUnits(a.name, b.name) || VAR_SCOPES.indexOf(scopeOf(a)) - VAR_SCOPES.indexOf(scopeOf(b)) || compareCodeUnits(a.projectId ?? '', b.projectId ?? ''));
    const rows = input.effective === true ? ordered.filter((v, i) => i === 0 || ordered[i - 1]?.name !== v.name) : ordered;
    return { kind: 'list', rows: rows.map(row) };
  }
}
