/**
 * `var_delete` (WL-08, WL-25): removes a variable from one scope (soft).
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { VarDeleteHandler } from './var-delete.handler.ts';
import { VAR_NAME, VAR_PROJECT, VAR_SCOPE } from './var.schema.ts';
import type { VarRepositoryFactory } from './var.repository.ts';

/** Input schema. */
export const VAR_DELETE_INPUT = z.object({
  name: VAR_NAME,
  scope: VAR_SCOPE,
  project_id: VAR_PROJECT,
});

/** Parsed input. */
export type VarDeleteInput = z.infer<typeof VAR_DELETE_INPUT>;

/**
 * Builds the definition.
 * @param vars - Variable repository factory.
 * @returns The `var_delete` operation.
 */
export function varDeleteOperation(vars: VarRepositoryFactory): OperationDefinition {
  return {
    name: 'var_delete',
    group: 'var',
    action: 'delete',
    kind: 'command',
    input: VAR_DELETE_INPUT,
    description: 'Delete a variable from one scope (soft: the file is kept, marked deleted). Reads then fall through to the next scope.',
    examples: [{ name: 'forge.parallel_executors', scope: 'repo' }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'name',
    handler: new VarDeleteHandler(vars),
  };
}
