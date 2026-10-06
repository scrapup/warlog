/**
 * `list` question: a list of short texts within `min_items` and `max_items`.
 */
import { z } from 'zod';
import { BASE_QUESTION } from '../question.schema.ts';
import { checkCount, checkText } from './answer-checks.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Most items any list accepts. */
const MAX_LIST_ITEMS = 100;

/** Definition schema. */
export const LIST_QUESTION = z
  .object({
    ...BASE_QUESTION,
    type: z.literal('list'),
    min_items: z.number().int().min(0).max(MAX_LIST_ITEMS).optional().describe('Fewest items'),
    max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).optional().describe('Most items'),
  })
  .strict()
  .refine((q) => q.min_items === undefined || q.max_items === undefined || q.min_items <= q.max_items, 'min_items must not exceed max_items');

/** A list question. */
interface ListQuestion extends QuestionBase {
  /** Fewest items. */
  readonly min_items?: number | undefined;
  /** Most items. */
  readonly max_items?: number | undefined;
}

/** The `list` type. */
export const listType: QuestionType<ListQuestion> = {
  name: 'list',
  definition: LIST_QUESTION,
  check: (question, answer) => {
    if (!Array.isArray(answer)) {
      return 'must be a list of texts';
    }
    const problem = answer.map((a) => (typeof a === 'string' && a.trim() === '' ? 'must not be empty' : checkText(a, 2_000))).find((p) => p !== undefined);
    return checkCount(answer.length, question.min_items, Math.min(question.max_items ?? MAX_LIST_ITEMS, MAX_LIST_ITEMS)) ?? (problem === undefined ? undefined : `each item ${problem}`);
  },
  render: (_question, answer) => (answer as string[]).map((a) => `- ${a}`).join('\n'),
};
