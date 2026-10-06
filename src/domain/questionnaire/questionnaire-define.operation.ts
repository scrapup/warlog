/**
 * `questionnaire_define` (WL-29, WL-30): defines a questionnaire; redefining bumps its version.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { isSlug } from '../../core/security/identifiers.ts';
import { DESCRIPTION, TITLE } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { QUESTION } from './question-type-registry.ts';
import { MAX_QUESTIONS } from './questionnaire-rules.ts';
import { QuestionnaireDefineHandler } from './questionnaire-define.handler.ts';
import type { QuestionnaireStoreFactory } from './questionnaire.store.ts';

/** Input schema. */
export const QUESTIONNAIRE_DEFINE_INPUT = z.object({
  slug: z.string().refine(isSlug, 'must be lower-case letters, digits and "-" (max 80)').describe('Questionnaire identifier (e.g. aar)'),
  title: TITLE.describe('Title'),
  description: DESCRIPTION.describe('What the questionnaire is for (Markdown)'),
  scope: z.enum(['repo', 'global']).optional().describe('repo (default inside a repository; overrides a global questionnaire of the same slug) or global'),
  questions: z.array(QUESTION).min(1).max(MAX_QUESTIONS).describe('Questions in order; types: text, long_text, single_choice, multi_choice, checklist, list, boolean, number, scale, date'),
});

/** Parsed input. */
export type QuestionnaireDefineInput = z.infer<typeof QUESTIONNAIRE_DEFINE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @param stores - Questionnaire store factory.
 * @returns The `questionnaire_define` operation.
 */
export function questionnaireDefineOperation(writers: WriterFactory, stores: QuestionnaireStoreFactory): OperationDefinition {
  return {
    name: 'questionnaire_define',
    group: 'questionnaire',
    action: 'define',
    kind: 'command',
    input: QUESTIONNAIRE_DEFINE_INPUT,
    description:
      'Define a questionnaire at repository or global scope: ordered questions of ten types (text, long_text, single_choice, multi_choice, checklist, list, boolean, number, scale, date), each with a prompt, required flag, help and an optional when condition on an earlier answer. Redefining the same slug bumps its version; a repository questionnaire overrides a global one.',
    examples: [
      {
        slug: 'release-check',
        title: 'Release check',
        questions: [
          { id: 'ready', type: 'boolean', prompt: 'Is the release ready?', required: true },
          { id: 'blockers', type: 'list', prompt: 'What blocks it?', when: { question: 'ready', equals: false } },
        ],
      },
    ],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new QuestionnaireDefineHandler(writers, stores),
  };
}
