/**
 * `number` question: a finite number within `min` and `max`, whole when `integer` is set.
 */
import { z } from 'zod';
import { BASE_QUESTION } from '../question.schema.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const NUMBER_QUESTION = z
  .object({
    ...BASE_QUESTION,
    type: z.literal('number'),
    min: z.number().optional().describe('Smallest value'),
    max: z.number().optional().describe('Largest value'),
    integer: z.boolean().optional().describe('Whole numbers only'),
  })
  .strict()
  .refine((q) => q.min === undefined || q.max === undefined || q.min <= q.max, 'min must not exceed max');

/** A number question. */
interface NumberQuestion extends QuestionBase {
  /** Smallest value. */
  readonly min?: number | undefined;
  /** Largest value. */
  readonly max?: number | undefined;
  /** Whether only whole numbers are accepted. */
  readonly integer?: boolean | undefined;
}

/** The `number` type. */
export const numberType: QuestionType<NumberQuestion> = {
  name: 'number',
  definition: NUMBER_QUESTION,
  check: (question, answer) => {
    if (typeof answer !== 'number' || !Number.isFinite(answer)) {
      return 'must be a number';
    }
    if (question.integer === true && !Number.isInteger(answer)) {
      return 'must be a whole number';
    }
    if (question.min !== undefined && answer < question.min) {
      return `must be at least ${question.min}`;
    }
    return question.max !== undefined && answer > question.max ? `must be at most ${question.max}` : undefined;
  },
  render: (_question, answer) => String(answer),
};
