/**
 * `memory_supersede` (WL-17): replaces a memory with a newer one, linking both.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { MemorySupersedeHandler } from './memory-supersede.handler.ts';

/** Input schema. */
export const MEMORY_SUPERSEDE_INPUT = z.object({
  id: idField('Memory being replaced'),
  superseded_by: idField('The memory that replaces it'),
  reason: z.string().max(2_000).optional().describe('Why (kept in the replaced memory)'),
});

/** Parsed input. */
export type MemorySupersedeInput = z.infer<typeof MEMORY_SUPERSEDE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `memory_supersede` operation.
 */
export function memorySupersedeOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'memory_supersede',
    group: 'memory',
    action: 'supersede',
    kind: 'command',
    input: MEMORY_SUPERSEDE_INPUT,
    description:
      'Mark a memory superseded by another: the old one leaves recall and records superseded_by; the new one gets a supersedes link back. Both must be active or stale. Only an explicit call changes a memory.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0D1', superseded_by: '01J9Z8Q4N6V2M3K5H7G8F9D0D2' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new MemorySupersedeHandler(writers),
  };
}
