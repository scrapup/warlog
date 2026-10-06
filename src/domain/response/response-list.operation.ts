/**
 * `response_list` (WL-31): responses with filters, newest first.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { isSlug } from '../../core/security/identifiers.ts';
import { PROJECT_SCOPE, idField, limitField } from '../shared/fields.ts';
import { ResponseListHandler } from './response-list.handler.ts';

/** Input schema. */
export const RESPONSE_LIST_INPUT = z.object({
  subject_id: idField('Only responses about this task, story, epic or project').optional(),
  questionnaire: z.string().refine(isSlug, 'must be a questionnaire slug').optional().describe('Only responses to this questionnaire'),
  project_id: PROJECT_SCOPE,
  limit: limitField(30),
});

/** Parsed input. */
export type ResponseListInput = z.infer<typeof RESPONSE_LIST_INPUT>;

/**
 * Builds the definition.
 * @returns The `response_list` operation.
 */
export function responseListOperation(): OperationDefinition {
  return {
    name: 'response_list',
    group: 'response',
    action: 'list',
    kind: 'query',
    input: RESPONSE_LIST_INPUT,
    description: 'List responses (newest first) with the questionnaire, its version and the subject; response_get returns the answers.',
    examples: [{ questionnaire: 'aar' }],
    defaultFormat: 'table',
    load: 'full',
    handler: new ResponseListHandler(),
  };
}
