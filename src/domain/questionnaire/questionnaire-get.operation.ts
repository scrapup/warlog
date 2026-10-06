/**
 * `questionnaire_get` (WL-29, WL-33): one questionnaire with its questions.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { isSlug } from '../../core/security/identifiers.ts';
import { QuestionnaireGetHandler } from './questionnaire-get.handler.ts';
import type { QuestionnaireStoreFactory } from './questionnaire.store.ts';

/** Input schema. */
export const QUESTIONNAIRE_GET_INPUT = z.object({
  slug: z.string().refine(isSlug, 'must be lower-case letters, digits and "-" (max 80)').describe('Questionnaire identifier'),
  scope: z.enum(['repo', 'global']).optional().describe('Read only this scope (default: repository, then global)'),
});

/** Parsed input. */
export type QuestionnaireGetInput = z.infer<typeof QUESTIONNAIRE_GET_INPUT>;

/**
 * Builds the definition.
 * @param stores - Questionnaire store factory.
 * @returns The `questionnaire_get` operation.
 */
export function questionnaireGetOperation(stores: QuestionnaireStoreFactory): OperationDefinition {
  return {
    name: 'questionnaire_get',
    group: 'questionnaire',
    action: 'get',
    kind: 'query',
    input: QUESTIONNAIRE_GET_INPUT,
    description: 'Get a questionnaire with its version and questions (repository first, then global). The built-in aar is available even before any file exists.',
    examples: [{ slug: 'aar' }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'slug',
    handler: new QuestionnaireGetHandler(stores),
  };
}
