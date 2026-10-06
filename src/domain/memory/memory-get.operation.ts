/**
 * `memory_get` (WL-15): one memory with its content.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import { MemoryGetHandler } from './memory-get.handler.ts';

/** Input schema. */
export const MEMORY_GET_INPUT = z.object({ id: idField('Memory ID') });

/** Parsed input. */
export type MemoryGetInput = z.infer<typeof MEMORY_GET_INPUT>;

/**
 * Builds the definition.
 * @returns The `memory_get` operation.
 */
export function memoryGetOperation(): OperationDefinition {
  return {
    name: 'memory_get',
    group: 'memory',
    action: 'get',
    kind: 'query',
    input: MEMORY_GET_INPUT,
    description: 'Get one memory with its content and kind fields (repository scope first, then global).',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0D1' }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'id',
    handler: new MemoryGetHandler(),
  };
}
