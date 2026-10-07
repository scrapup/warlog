/**
 * Validation of the answers of a response (WL-29, WL-30, WL-31): every problem is collected so
 * the caller fixes them in one go. A question whose condition is not met is not asked: answering
 * it is a problem, leaving it out is fine.
 */
import { isPlainRecord } from '../../core/security/plain-record.ts';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { Question } from './question-type-registry.ts';
import { checkAnswer } from './question-type-registry.ts';
import { answerOf } from './own-answer.ts';
import { applies } from './when-evaluator.ts';

/** One problem with the answers. */
export interface AnswerProblem {
  /** Location (`answers.<question id>`). */
  readonly path: string;
  /** What is wrong. */
  readonly message: string;
}

/**
 * Tells whether an answer counts as missing for a required question.
 * @param answer - The answer.
 * @returns `true` for absent, `null`, blank text and empty lists.
 */
function isBlank(answer: unknown): boolean {
  return answer === undefined || answer === null || (typeof answer === 'string' && answer.trim() === '') || (Array.isArray(answer) && answer.length === 0);
}

/**
 * Problems of one question.
 * @param question - The question.
 * @param answers - All answers.
 * @returns The problems (empty when fine).
 */
function questionProblems(question: Question, answers: Readonly<Record<string, unknown>>): AnswerProblem[] {
  const path = `answers.${question.id}`;
  const answer = answerOf(answers, question.id);
  if (!applies(question.when, answers)) {
    return answer === undefined ? [] : [{ path, message: `not applicable: ${question.id} is asked only when its condition on ${question.when?.question ?? ''} holds` }];
  }
  if (isBlank(answer)) {
    return question.required ? [{ path, message: 'is required' }] : [];
  }
  const message = checkAnswer(question, answer);
  return message === undefined ? [] : [{ path, message }];
}

/**
 * Finds every problem of a set of answers.
 * @param questions - The questions answered, in order.
 * @param answers - Answers by question id.
 * @returns The problems, in question order (unknown ids last).
 */
export function answerProblems(questions: readonly Question[], answers: Readonly<Record<string, unknown>>): AnswerProblem[] {
  const known = new Set(questions.map((q) => q.id));
  const unknown = Object.keys(answers).filter((k) => !known.has(k)).map((k) => ({ path: `answers.${k}`, message: 'is not a question of this questionnaire' }));
  return [...questions.flatMap((q) => questionProblems(q, answers)), ...unknown];
}

/**
 * Fails when answers are invalid.
 * @param questions - The questions answered.
 * @param answers - Answers by question id.
 * @throws {WarlogError} `VALIDATION` listing every invalid question.
 */
export function assertAnswers(questions: readonly Question[], answers: unknown): asserts answers is Record<string, unknown> {
  if (!isPlainRecord(answers)) {
    throw new WarlogError('VALIDATION', 'answers must be an object of question id: answer', { issues: [{ path: 'answers', message: 'must be an object' }] });
  }
  const problems = answerProblems(questions, answers);
  if (problems.length > 0) {
    throw new WarlogError('VALIDATION', `${problems.length} answer problem(s): ${problems.map((p) => p.path.slice('answers.'.length)).join(', ')}`, { issues: problems });
  }
}
