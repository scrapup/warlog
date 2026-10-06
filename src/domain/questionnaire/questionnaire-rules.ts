/**
 * Rules of a questionnaire definition (WL-29, WL-30) checked when it is defined: unique question
 * ids and conditions that refer only to earlier questions.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { Question } from './question-type-registry.ts';

/** A problem with the questions. */
interface QuestionProblem {
  /** Location. */
  readonly path: string;
  /** What is wrong. */
  readonly message: string;
}

/** Most questions a questionnaire holds. */
export const MAX_QUESTIONS = 100;

/**
 * Checks a list of questions.
 * @param questions - Questions in order.
 * @throws {WarlogError} `VALIDATION` listing every problem by question.
 */
export function assertQuestions(questions: readonly Question[]): void {
  const problems: QuestionProblem[] = [];
  const earlier = new Set<string>();
  questions.forEach((q, i) => {
    if (earlier.has(q.id)) {
      problems.push({ path: `questions.${i}.id`, message: `duplicate question id ${q.id}` });
    }
    const target = q.when?.question;
    if (target !== undefined && !earlier.has(target)) {
      problems.push({ path: `questions.${i}.when.question`, message: `${target} is not an earlier question` });
    }
    earlier.add(q.id);
  });
  if (problems.length > 0) {
    throw new WarlogError('VALIDATION', 'invalid questions', { issues: problems });
  }
}
