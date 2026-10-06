/**
 * The Markdown body of a response (plan §3.3): one section per answered question, in the order
 * of the questionnaire, so a response reads well in any Markdown viewer.
 */
import type { Question } from '../questionnaire/question-type-registry.ts';
import { renderAnswer } from '../questionnaire/question-type-registry.ts';

/**
 * Renders the answered questions.
 * @param questions - Questions in order.
 * @param answers - Valid answers by question id.
 * @returns Markdown (empty when nothing was answered).
 */
export function responseBody(questions: readonly Question[], answers: Readonly<Record<string, unknown>>): string {
  return questions
    .filter((q) => answers[q.id] !== undefined && answers[q.id] !== null)
    .map((q) => `## ${q.prompt}\n\n${renderAnswer(q, answers[q.id])}`)
    .join('\n\n');
}
