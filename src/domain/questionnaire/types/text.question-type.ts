/**
 * `text` question: free text up to `max_length` characters (default 2_000).
 */
import { z } from 'zod';
import { BASE_QUESTION } from '../question.schema.ts';
import { checkText } from './answer-checks.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const TEXT_QUESTION = z.object({ ...BASE_QUESTION, type: z.literal('text'), max_length: z.number().int().min(1).max(100_000).optional().describe('Longest answer (default 2_000)') }).strict();

/** A text question. */
interface TextQuestion extends QuestionBase {
  /** Longest answer. */
  readonly max_length?: number | undefined;
}

/** The `text` type. */
export const textType: QuestionType<TextQuestion> = {
  name: 'text',
  definition: TEXT_QUESTION,
  check: (question, answer) => checkText(answer, question.max_length ?? 2_000),
  render: (_question, answer) => String(answer),
};
