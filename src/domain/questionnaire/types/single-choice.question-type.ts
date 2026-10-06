/**
 * `single_choice` question: one of the options, or any short text when `allow_other` is set.
 */
import { z } from 'zod';
import { BASE_QUESTION, OPTIONS } from '../question.schema.ts';
import { checkText } from './answer-checks.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const SINGLE_CHOICE_QUESTION = z.object({ ...BASE_QUESTION, type: z.literal('single_choice'), options: OPTIONS, allow_other: z.boolean().optional().describe('Accept an answer outside the options') }).strict();

/** A single-choice question. */
interface SingleChoiceQuestion extends QuestionBase {
  /** The options. */
  readonly options: readonly string[];
  /** Whether other answers are accepted. */
  readonly allow_other?: boolean | undefined;
}

/** The `single_choice` type. */
export const singleChoiceType: QuestionType<SingleChoiceQuestion> = {
  name: 'single_choice',
  definition: SINGLE_CHOICE_QUESTION,
  check: (question, answer) => {
    const problem = checkText(answer, 500);
    if (problem !== undefined || question.options.includes(String(answer))) {
      return problem;
    }
    return question.allow_other === true && String(answer).trim() !== '' ? undefined : `must be one of ${question.options.join(', ')}`;
  },
  render: (question, answer) => (question.options.includes(String(answer)) ? String(answer) : `Other: ${String(answer)}`),
};
