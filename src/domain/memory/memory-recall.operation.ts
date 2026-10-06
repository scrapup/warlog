/**
 * `memory_recall` (WL-16, WL-18, WL-47): finds memories by literal words, tags, kind and scope.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { limitField } from '../shared/fields.ts';
import { MEMORY_KINDS, MEMORY_SCOPES } from './memory.schema.ts';
import { MemoryRecallHandler } from './memory-recall.handler.ts';
import { MAX_QUERY_CHARS } from './token-matcher.ts';

/** Input schema. */
export const MEMORY_RECALL_INPUT = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_CHARS).describe('Words to look for (literal: a memory matches when it contains the same words; never a pattern)'),
  kind: z.enum(MEMORY_KINDS).optional().describe('Only this kind'),
  scope: z.enum(MEMORY_SCOPES).optional().describe('Only this scope'),
  tags: z.array(z.string().min(1).max(64)).max(16).optional().describe('Only memories having every one of these tags'),
  limit: limitField(10),
});

/** Parsed input. */
export type MemoryRecallInput = z.infer<typeof MEMORY_RECALL_INPUT>;

/**
 * Builds the definition.
 * @returns The `memory_recall` operation.
 */
export function memoryRecallOperation(): OperationDefinition {
  return {
    name: 'memory_recall',
    group: 'memory',
    action: 'recall',
    kind: 'command',
    input: MEMORY_RECALL_INPUT,
    description:
      'Recall memories relevant to some words, best first: repository scope before global, then more matched words, then most recent. Only active and stale memories. Each recall is recorded as usage in the activity log (the memory files are not touched).',
    examples: [{ query: 'windows path separator', kind: 'known_issue', limit: 5 }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new MemoryRecallHandler(),
  };
}
