/**
 * The simple condition of a question (WL-30): `{ question, equals | not_equals | in }` on an
 * earlier answer. One comparison, no expressions.
 */
import type { When } from './question.schema.ts';

/** Answers by question id. */
export type Answers = Readonly<Record<string, unknown>>;

/**
 * Tells whether two scalar values are equal (type included: `1` is not `"1"`).
 * @param a - First.
 * @param b - Second.
 * @returns `true` when equal.
 */
function same(a: unknown, b: unknown): boolean {
  return a === b;
}

/**
 * Tells whether a question applies, given the answers so far.
 * @param when - The question's condition, when it has one.
 * @param answers - Answers by question id.
 * @returns `true` without a condition; otherwise whether the earlier answer matches. A condition on
 *   a question that was not answered never matches.
 */
export function applies(when: When | undefined, answers: Answers): boolean {
  if (when === undefined) {
    return true;
  }
  const answer = answers[when.question];
  if (answer === undefined) {
    return false;
  }
  if (when.equals !== undefined) {
    return same(answer, when.equals);
  }
  if (when.not_equals !== undefined) {
    return !same(answer, when.not_equals);
  }
  return (when.in ?? []).some((v) => same(answer, v));
}
