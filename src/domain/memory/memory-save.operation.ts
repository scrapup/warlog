/**
 * `memory_save` (WL-15, WL-16, WL-19): records a memory, or updates one when `id` is given.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { TAGS, TITLE, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { KIND_INPUT, MEMORY_KINDS, MEMORY_SCOPES } from './memory.schema.ts';
import { MemorySaveHandler } from './memory-save.handler.ts';

/** Input schema. */
export const MEMORY_SAVE_INPUT = z.object({
  id: idField('Memory ID (provide to update, omit to create)').optional(),
  scope: z.enum(MEMORY_SCOPES).optional().describe('repo (this repository, default inside one) or global (every repository); fixed after creation'),
  kind: z.enum(MEMORY_KINDS).optional().describe('fact, decision, guardrail, pattern, command, known_issue or runbook (required on creation; fixed after)'),
  title: TITLE.optional().describe('Short title (required on creation)'),
  content: z.string().max(100_000).optional().describe('Body (Markdown; required on creation). For a runbook: the steps'),
  tags: TAGS,
  ...KIND_INPUT,
});

/** Parsed input. */
export type MemorySaveInput = z.infer<typeof MEMORY_SAVE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `memory_save` operation.
 */
export function memorySaveOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'memory_save',
    group: 'memory',
    action: 'save',
    kind: 'command',
    input: MEMORY_SAVE_INPUT,
    description:
      'Record a memory deliberately (nothing is captured automatically): a fact, decision, guardrail, pattern (applies_to globs), command (cmd, purpose), known_issue (symptom) or runbook (purpose, steps in content). With id, update its fields. Secrets are rejected.',
    examples: [{ kind: 'guardrail', title: 'Never force-push main', content: 'Rulesets reject it; open a PR.', tags: ['git'] }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new MemorySaveHandler(writers),
  };
}
