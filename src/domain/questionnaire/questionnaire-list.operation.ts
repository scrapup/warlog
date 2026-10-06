/**
 * `questionnaire_list` (WL-29, WL-33): the questionnaires in effect.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { QuestionnaireListHandler } from './questionnaire-list.handler.ts';
import type { QuestionnaireStoreFactory } from './questionnaire.store.ts';

/** Input schema. */
export const QUESTIONNAIRE_LIST_INPUT = z.object({
  scope: z.enum(['repo', 'global']).optional().describe('Only this scope'),
});

/** Parsed input. */
export type QuestionnaireListInput = z.infer<typeof QUESTIONNAIRE_LIST_INPUT>;

/**
 * Builds the definition.
 * @param stores - Questionnaire store factory.
 * @returns The `questionnaire_list` operation.
 */
export function questionnaireListOperation(stores: QuestionnaireStoreFactory): OperationDefinition {
  return {
    name: 'questionnaire_list',
    group: 'questionnaire',
    action: 'list',
    kind: 'query',
    input: QUESTIONNAIRE_LIST_INPUT,
    description: 'List the questionnaires in effect: repository ones, global ones they do not override, and the built-in aar.',
    examples: [{}],
    defaultFormat: 'table',
    load: 'point',
    handler: new QuestionnaireListHandler(stores),
  };
}
