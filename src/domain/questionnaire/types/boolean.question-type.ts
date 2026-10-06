/**
 * `boolean` question: yes or no.
 */
import { z } from 'zod';
import { BASE_QUESTION } from '../question.schema.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const BOOLEAN_QUESTION = z.object({ ...BASE_QUESTION, type: z.literal('boolean') }).strict();

/** The `boolean` type. */
export const booleanType: QuestionType<QuestionBase> = {
  name: 'boolean',
  definition: BOOLEAN_QUESTION,
  check: (_question, answer) => (typeof answer === 'boolean' ? undefined : 'must be true or false'),
  render: (_question, answer) => (answer === true ? 'Yes' : 'No'),
};
