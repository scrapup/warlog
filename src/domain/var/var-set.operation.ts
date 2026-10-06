/**
 * `var_set` (WL-25..WL-28, WL-09): writes a typed variable.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { FORCE } from '../shared/fields.ts';
import { VarSetHandler } from './var-set.handler.ts';
import { VAR_NAME, VAR_PROJECT, VAR_SCOPE, VAR_VALUE } from './var.schema.ts';
import { VAR_TYPES } from './var-type-validator.ts';
import type { VarRepositoryFactory } from './var.repository.ts';

/** Input schema. */
export const VAR_SET_INPUT = z.object({
  name: VAR_NAME,
  value: VAR_VALUE,
  type: z.enum(VAR_TYPES).optional().describe('Declared type (default: the current type, or inferred from the value for a new variable)'),
  scope: VAR_SCOPE,
  project_id: VAR_PROJECT,
  schema: z.record(z.string(), z.unknown()).optional().describe('Restricted JSON Schema (type, properties, required, items, enum, const, minimum, maximum, minLength, maxLength, minItems, maxItems, additionalProperties)'),
  force: FORCE,
});

/** Parsed input. */
export type VarSetInput = z.infer<typeof VAR_SET_INPUT>;

/**
 * Builds the definition.
 * @param vars - Variable repository factory.
 * @returns The `var_set` operation.
 */
export function varSetOperation(vars: VarRepositoryFactory): OperationDefinition {
  return {
    name: 'var_set',
    group: 'var',
    action: 'set',
    kind: 'command',
    input: VAR_SET_INPUT,
    description:
      'Set a typed variable at global, repository or project scope. The value must match its type (and schema) exactly — nothing is coerced; changing the type of an existing variable needs force. Values that look like secrets are rejected.',
    examples: [{ name: 'forge.parallel_executors', value: true, scope: 'repo' }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'name',
    handler: new VarSetHandler(vars),
  };
}
