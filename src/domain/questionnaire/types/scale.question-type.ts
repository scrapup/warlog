/**
 * `scale` question: a rating, an integer from `min` to `max` (default 1 to 5), with optional end labels.
 */
import { z } from 'zod';
import { BASE_QUESTION } from '../question.schema.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const SCALE_QUESTION = z
  .object({
    ...BASE_QUESTION,
    type: z.literal('scale'),
    min: z.number().int().min(0).max(100).optional().describe('Lowest rating (default 1)'),
    max: z.number().int().min(1).max(100).optional().describe('Highest rating (default 5)'),
    min_label: z.string().max(100).optional().describe('Meaning of the lowest rating'),
    max_label: z.string().max(100).optional().describe('Meaning of the highest rating'),
  })
  .strict()
  .refine((q) => (q.min ?? 1) < (q.max ?? 5), 'min must be below max');

/** A scale question. */
interface ScaleQuestion extends QuestionBase {
  /** Lowest rating. */
  readonly min?: number | undefined;
  /** Highest rating. */
  readonly max?: number | undefined;
  /** Meaning of the lowest rating. */
  readonly min_label?: string | undefined;
  /** Meaning of the highest rating. */
  readonly max_label?: string | undefined;
}

/** The `scale` type. */
export const scaleType: QuestionType<ScaleQuestion> = {
  name: 'scale',
  definition: SCALE_QUESTION,
  check: (question, answer) => {
    const [min, max] = [question.min ?? 1, question.max ?? 5];
    return typeof answer === 'number' && Number.isInteger(answer) && answer >= min && answer <= max ? undefined : `must be a whole number from ${min} to ${max}`;
  },
  render: (question, answer) => `${String(answer)} / ${question.max ?? 5}`,
};
