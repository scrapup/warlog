/**
 * Reads an answer by question id. A question id is free text of the questionnaire author, so
 * `constructor` or `toString` are valid ids and must not read members inherited from
 * `Object.prototype` when the question was left unanswered.
 */

/**
 * The answer of a question.
 * @param answers - Answers by question id.
 * @param id - Question id.
 * @returns The answer, or `undefined` when the question was not answered.
 */
export function answerOf(answers: Readonly<Record<string, unknown>>, id: string): unknown {
  return Object.hasOwn(answers, id) ? answers[id] : undefined;
}
