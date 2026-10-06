/**
 * `memory_list` (WL-15, WL-16): memories with filters, most specific scope first.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { limitField } from '../shared/fields.ts';
import { MEMORY_KINDS, MEMORY_SCOPES, MEMORY_STATUSES } from './memory.schema.ts';
import { MemoryListHandler } from './memory-list.handler.ts';

/** Input schema. */
export const MEMORY_LIST_INPUT = z.object({
  scope: z.enum(MEMORY_SCOPES).optional().describe('Only this scope'),
  kind: z.enum(MEMORY_KINDS).optional().describe('Only this kind'),
  status: z.enum(MEMORY_STATUSES).optional().describe('Only this status (default: active and stale)'),
  tag: z.string().max(64).optional().describe('Only memories with this tag'),
  limit: limitField(50),
});

/** Parsed input. */
export type MemoryListInput = z.infer<typeof MEMORY_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `memory_list` operation.
 */
export function memoryListOperation(): OperationDefinition {
  return {
    name: 'memory_list',
    group: 'memory',
    action: 'list',
    kind: 'query',
    input: MEMORY_LIST_INPUT,
    description: 'List memories (repository scope first, newest change first) with an excerpt of their content. Default: active and stale; memory_get returns the whole memory.',
    examples: [{ kind: 'guardrail' }],
    defaultFormat: 'table',
    load: 'full',
    handler: new MemoryListHandler(),
  };
}
