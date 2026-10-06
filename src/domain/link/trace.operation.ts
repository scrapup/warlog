/**
 * `trace` (WL-22, WL-44): the traceability matrix around a node.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { TraceHandler } from './trace.handler.ts';
import { DEFAULT_TRACE_DEPTH, MAX_TRACE_DEPTH } from './trace-walker.ts';
import { LINK_TARGET } from './link.schema.ts';

/** Input schema. */
export const TRACE_INPUT = z.object({
  id: LINK_TARGET.describe('Node to start from: an entity ID, or an external reference (git:<sha>, spec:…, test:…) to see what points at it'),
  depth: z.number().int().min(1).max(MAX_TRACE_DEPTH).default(DEFAULT_TRACE_DEPTH).describe(`How many hops to follow (1-${MAX_TRACE_DEPTH})`),
});

/** Parsed input. */
export type TraceInput = z.infer<typeof TRACE_INPUT>;

/**
 * Builds the definition.
 * @returns The `trace` operation.
 */
export function traceOperation(): OperationDefinition {
  return {
    name: 'trace',
    group: 'trace',
    action: '',
    kind: 'query',
    input: TRACE_INPUT,
    description:
      'Trace a node through links in both directions, the hierarchy (project, epic, story, task) and external tracker keys, and group what is reached as the matrix use case/spec ↔ story ↔ task ↔ test ↔ commit ↔ external key. Pending links appear as pending nodes; cycles are followed once; very large graphs are cut at 2 000 nodes (warning trace.truncated).',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C3', depth: 3 }],
    defaultFormat: 'yaml',
    load: 'full',
    positional: 'id',
    handler: new TraceHandler(),
  };
}
