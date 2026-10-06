/**
 * `var_list` (WL-25): variables of every scope, or the effective set.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { VarListHandler } from './var-list.handler.ts';
import { VAR_PROJECT, VAR_SCOPE } from './var.schema.ts';

/** Input schema. */
export const VAR_LIST_INPUT = z.object({
  scope: VAR_SCOPE.optional().describe('Only variables of this scope'),
  effective: z.boolean().optional().describe('One row per name: the value in effect (most specific scope) and where it comes from'),
  project_id: VAR_PROJECT,
});

/** Parsed input. */
export type VarListInput = z.infer<typeof VAR_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `var_list` operation.
 */
export function varListOperation(): OperationDefinition {
  return {
    name: 'var_list',
    group: 'var',
    action: 'list',
    kind: 'query',
    input: VAR_LIST_INPUT,
    description: 'List variables with type, value and scope. effective: true shows, per name, the value in effect and its origin (no deep merge across scopes).',
    examples: [{ effective: true }],
    defaultFormat: 'table',
    load: 'full',
    handler: new VarListHandler(),
  };
}
