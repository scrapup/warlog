/**
 * `var_get` (WL-25, WL-27, WL-39): the value of a variable and the scope it came from.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { VarGetHandler } from './var-get.handler.ts';
import { VAR_NAME, VAR_PROJECT, VAR_SCOPE } from './var.schema.ts';
import type { VarRepositoryFactory } from './var.repository.ts';

/** Input schema. */
export const VAR_GET_INPUT = z.object({
  name: VAR_NAME,
  path: z.string().min(1).max(256).optional().describe('Dotted path of a field inside an object or array value (e.g. limits.max, items.0)'),
  scope: VAR_SCOPE.optional().describe('Read only this scope (default: project, then repository, then global; the most specific wins)'),
  project_id: VAR_PROJECT,
});

/** Parsed input. */
export type VarGetInput = z.infer<typeof VAR_GET_INPUT>;

/**
 * Builds the definition.
 * @param vars - Variable repository factory.
 * @returns The `var_get` operation.
 */
export function varGetOperation(vars: VarRepositoryFactory): OperationDefinition {
  return {
    name: 'var_get',
    group: 'var',
    action: 'get',
    kind: 'query',
    input: VAR_GET_INPUT,
    description:
      'Get a variable: the value of the most specific scope (project, repository, global) with its type and scope. A scalar value is printed raw; use format yaml or json to see type and scope. path reads a field inside an object or array.',
    examples: [{ name: 'forge.parallel_executors' }, { name: 'limits', path: 'max' }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'name',
    handler: new VarGetHandler(vars),
  };
}
