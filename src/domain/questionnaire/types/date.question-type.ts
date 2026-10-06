/**
 * `date` question: a calendar date `YYYY-MM-DD`.
 */
import { z } from 'zod';
import { BASE_QUESTION } from '../question.schema.ts';
import { isIsoDate } from './answer-checks.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const DATE_QUESTION = z.object({ ...BASE_QUESTION, type: z.literal('date') }).strict();

/** The `date` type. */
export const dateType: QuestionType<QuestionBase> = {
  name: 'date',
  definition: DATE_QUESTION,
  check: (_question, answer) => (typeof answer === 'string' && isIsoDate(answer) ? undefined : 'must be a date as YYYY-MM-DD'),
  render: (_question, answer) => String(answer),
};
