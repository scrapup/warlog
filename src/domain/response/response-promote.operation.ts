/**
 * `response_promote` (WL-32): turns an answer (or a list item) into a memory linked back.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { TITLE, idField } from '../shared/fields.ts';
import { MEMORY_SCOPES } from '../memory/memory.schema.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { ResponsePromoteHandler } from './response-promote.handler.ts';
import { isQuestionId } from '../questionnaire/question.schema.ts';

/** Memory kinds a promotion can create (they need no extra fields). */
export const PROMOTE_KINDS = ['fact', 'decision', 'guardrail'] as const;

/** Input schema. */
export const RESPONSE_PROMOTE_INPUT = z.object({
  response_id: idField('Response ID'),
  question_id: z.string().refine(isQuestionId, 'must be a question id').describe('Question whose answer is promoted'),
  item_index: z.number().int().min(0).max(99).optional().describe('Zero-based item of a list, multi-choice or checklist answer'),
  kind: z.enum(PROMOTE_KINDS).default('guardrail').describe('Memory kind: fact, decision or guardrail (default)'),
  scope: z.enum(MEMORY_SCOPES).optional().describe('Memory scope (default: repository inside one, else global)'),
  title: TITLE.optional().describe('Memory title (default: the first 80 characters of the text)'),
});

/** Parsed input. */
export type ResponsePromoteInput = z.infer<typeof RESPONSE_PROMOTE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `response_promote` operation.
 */
export function responsePromoteOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'response_promote',
    group: 'response',
    action: 'promote',
    kind: 'command',
    input: RESPONSE_PROMOTE_INPUT,
    description:
      'Promote an answer, or one item of a list answer, to a memory (guardrail by default) that links back to the response (derived_from). Use it to keep the lessons of an After-Action Review where memory_recall and the playbook can find them.',
    examples: [{ response_id: '01J9Z8Q4N6V2M3K5H7G8F9D0E1', question_id: 'improve', item_index: 0, kind: 'guardrail' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new ResponsePromoteHandler(writers),
  };
}
