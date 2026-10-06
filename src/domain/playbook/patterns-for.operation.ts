/**
 * `patterns_for` (WL-20): the patterns that apply to a file.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { PatternsForHandler } from './patterns-for.handler.ts';

/** Input schema. */
export const PATTERNS_FOR_INPUT = z.object({
  path: z.string().trim().min(1).max(1_024).describe('File path (repository-relative, or absolute inside the repository)'),
});

/** Parsed input. */
export type PatternsForInput = z.infer<typeof PATTERNS_FOR_INPUT>;

/**
 * Builds the definition.
 * @returns The `patterns_for` operation.
 */
export function patternsForOperation(): OperationDefinition {
  return {
    name: 'patterns_for',
    group: 'patterns-for',
    action: '',
    positional: 'path',
    kind: 'query',
    input: PATTERNS_FOR_INPUT,
    description: 'Return the pattern memories whose applies_to globs match a file, repository scope first. Call it before editing a file.',
    examples: [{ path: 'src/domain/task/task-create.handler.ts' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new PatternsForHandler(),
  };
}
