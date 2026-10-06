/**
 * `memory_review` (WL-17): lists memories that may need a decision; writes nothing.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { MEMORY_SCOPES } from './memory.schema.ts';
import { MemoryReviewHandler } from './memory-review.handler.ts';
import { MAX_UNUSED_DAYS } from './review-candidates.ts';

/** Input schema. */
export const MEMORY_REVIEW_INPUT = z.object({
  unused_days: z.number().int().min(1).max(MAX_UNUSED_DAYS).default(MAX_UNUSED_DAYS).describe('Report memories created before this many days ago and not recalled since (recall history keeps 90 days)'),
  scope: z.enum(MEMORY_SCOPES).optional().describe('Only this scope'),
});

/** Parsed input. */
export type MemoryReviewInput = z.infer<typeof MEMORY_REVIEW_INPUT>;

/**
 * Builds the definition.
 * @param fs - File system (activity files).
 * @returns The `memory_review` operation.
 */
export function memoryReviewOperation(fs: FileSystem): OperationDefinition {
  return {
    name: 'memory_review',
    group: 'memory',
    action: 'review',
    kind: 'query',
    input: MEMORY_REVIEW_INPUT,
    description:
      'List review candidates: memories not recalled for a period, stale memories awaiting a decision and likely duplicates (same kind, at least 80 % of the title words in common). Nothing is changed: use memory_supersede, memory_mark_stale or memory_archive to decide.',
    examples: [{ unused_days: 60 }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new MemoryReviewHandler(fs),
  };
}
