/**
 * `long_text` question: free text up to `max_length` characters (default 20_000).
 */
import { z } from 'zod';
import { BASE_QUESTION } from '../question.schema.ts';
import { checkText } from './answer-checks.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const LONG_TEXT_QUESTION = z.object({ ...BASE_QUESTION, type: z.literal('long_text'), max_length: z.number().int().min(1).max(100_000).optional().describe('Longest answer (default 20_000)') }).strict();

/** A long_text question. */
interface LongTextQuestion extends QuestionBase {
  /** Longest answer. */
  readonly max_length?: number | undefined;
}

/** The `long_text` type. */
export const long_textType: QuestionType<LongTextQuestion> = {
  name: 'long_text',
  definition: LONG_TEXT_QUESTION,
  check: (question, answer) => checkText(answer, question.max_length ?? 20_000),
  render: (_question, answer) => String(answer),
};
