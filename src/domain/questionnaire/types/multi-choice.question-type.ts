/**
 * `multi_choice` question: several of the options (and others when `allow_other` is set), within
 * `min` and `max`.
 */
import { z } from 'zod';
import { BASE_QUESTION, OPTIONS } from '../question.schema.ts';
import { checkCount, checkText } from './answer-checks.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const MULTI_CHOICE_QUESTION = z
  .object({
    ...BASE_QUESTION,
    type: z.literal('multi_choice'),
    options: OPTIONS,
    allow_other: z.boolean().optional().describe('Accept answers outside the options'),
    min: z.number().int().min(0).max(50).optional().describe('Fewest choices'),
    max: z.number().int().min(1).max(50).optional().describe('Most choices'),
  })
  .strict()
  .refine((q) => q.min === undefined || q.max === undefined || q.min <= q.max, 'min must not exceed max');

/** A multi-choice question. */
interface MultiChoiceQuestion extends QuestionBase {
  /** The options. */
  readonly options: readonly string[];
  /** Whether other answers are accepted. */
  readonly allow_other?: boolean | undefined;
  /** Fewest choices. */
  readonly min?: number | undefined;
  /** Most choices. */
  readonly max?: number | undefined;
}

/**
 * Checks the elements of a multi-choice answer.
 * @param question - The question.
 * @param items - The chosen texts.
 * @returns A message when an element is not acceptable.
 */
function checkItems(question: MultiChoiceQuestion, items: readonly unknown[]): string | undefined {
  if (new Set(items).size !== items.length) {
    return 'must not repeat a choice';
  }
  const problem = items.map((i) => checkText(i, 500)).find((p) => p !== undefined);
  const outside = items.filter((i) => !question.options.includes(String(i)));
  if (problem !== undefined) {
    return `each choice ${problem}`;
  }
  return outside.length > 0 && question.allow_other !== true ? `must be among ${question.options.join(', ')}` : undefined;
}

/** The `multi_choice` type. */
export const multiChoiceType: QuestionType<MultiChoiceQuestion> = {
  name: 'multi_choice',
  definition: MULTI_CHOICE_QUESTION,
  check: (question, answer) => (Array.isArray(answer) ? (checkCount(answer.length, question.min, question.max) ?? checkItems(question, answer)) : 'must be a list of choices'),
  render: (question, answer) => (answer as string[]).map((a) => `- ${question.options.includes(a) ? a : `Other: ${a}`}`).join('\n'),
};
