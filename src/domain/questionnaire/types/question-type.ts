/**
 * What a question type provides (plan §3.4): its definition schema, the check of an answer and
 * the Markdown rendering of an answer. Types are registered in `question-type-registry.ts`.
 */
import type { z } from 'zod';

/** A question as stored (the fields every type shares plus its own). */
export interface QuestionBase {
  /** Identifier. */
  readonly id: string;
  /** Prompt. */
  readonly prompt: string;
  /** Whether an answer is required. */
  readonly required: boolean;
  /** Help text. */
  readonly help?: string | undefined;
  /** Type name. */
  readonly type: string;
}

/** A question type. */
export interface QuestionType<Q extends QuestionBase = QuestionBase> {
  /** Type name (`text`, `long_text`, …). */
  readonly name: string;
  /** Definition schema (strict object including `type`). */
  readonly definition: z.ZodObject;
  /**
   * Checks an answer.
   * @param question - The question (with its parameters).
   * @param answer - The answer given.
   * @returns A message when the answer does not match the type, otherwise `undefined`.
   */
  check(question: Q, answer: unknown): string | undefined;
  /**
   * Renders an answer as Markdown (inside the section of its question).
   * @param question - The question.
   * @param answer - A valid answer.
   * @returns Markdown text.
   */
  render(question: Q, answer: unknown): string;
}
