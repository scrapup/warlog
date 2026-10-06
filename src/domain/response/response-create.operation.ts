/**
 * `response_create` (WL-31): answers a questionnaire about a task, story, epic or project.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { isSlug } from '../../core/security/identifiers.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { QuestionnaireStoreFactory } from '../questionnaire/questionnaire.store.ts';
import { ResponseCreateHandler } from './response-create.handler.ts';

/** Input schema. */
export const RESPONSE_CREATE_INPUT = z.object({
  questionnaire: z.string().refine(isSlug, 'must be a questionnaire slug').describe('Questionnaire identifier (e.g. aar)'),
  subject_id: idField('What the response is about: a task, story, epic or project ID'),
  answers: z.record(z.string(), z.unknown()).describe('Answers by question id: text, a choice, a list of texts, {item: true/false} for a checklist, true/false, a number, or YYYY-MM-DD'),
  scope: z.enum(['repo', 'global']).optional().describe('Read the questionnaire only at this scope (default: repository, then global)'),
});

/** Parsed input. */
export type ResponseCreateInput = z.infer<typeof RESPONSE_CREATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @param stores - Questionnaire store factory.
 * @returns The `response_create` operation.
 */
export function responseCreateOperation(writers: WriterFactory, stores: QuestionnaireStoreFactory): OperationDefinition {
  return {
    name: 'response_create',
    group: 'response',
    action: 'create',
    kind: 'command',
    input: RESPONSE_CREATE_INPUT,
    description:
      'Record the answers to a questionnaire about a task, story, epic or project. The response keeps a copy of the questions and their version (auditable after the questionnaire changes). Rejected, with every invalid question listed, when a required answer is missing or an answer does not match its type. warlog never decides when a review is due.',
    examples: [{ questionnaire: 'aar', subject_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', answers: { outcome: 'partial', trigger: 'US-97 merged', expected: 'one PR', happened: 'three PRs', why_difference: 'stacked reviews', improve: ['smaller stories'] } }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new ResponseCreateHandler(writers, stores),
  };
}
