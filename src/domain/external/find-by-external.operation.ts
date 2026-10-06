/**
 * `find_by_external` (WL-23): finds the item holding a tracker key.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { FindByExternalHandler } from './find-by-external.handler.ts';
import { EXTERNAL_KEY, EXTERNAL_SYSTEM } from './external.schema.ts';

/** Input schema. */
export const FIND_BY_EXTERNAL_INPUT = z.object({
  system: EXTERNAL_SYSTEM,
  key: EXTERNAL_KEY,
});

/** Parsed input. */
export type FindByExternalInput = z.infer<typeof FIND_BY_EXTERNAL_INPUT>;

/**
 * Builds the definition.
 * @returns The `find_by_external` operation.
 */
export function findByExternalOperation(): OperationDefinition {
  return {
    name: 'find_by_external',
    group: 'external',
    action: 'find',
    kind: 'query',
    input: FIND_BY_EXTERNAL_INPUT,
    description: 'Find the epic, story or task that references a tracker item by its system and key.',
    examples: [{ system: 'jira', key: 'SQ-1234' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new FindByExternalHandler(),
  };
}
