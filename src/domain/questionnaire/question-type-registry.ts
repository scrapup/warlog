/**
 * The ten question types (WL-29) and the schema of a question definition, discriminated by
 * `type`. Each type brings its definition schema, answer check and rendering.
 */
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { BOOLEAN_QUESTION, booleanType } from './types/boolean.question-type.ts';
import { CHECKLIST_QUESTION, checklistType } from './types/checklist.question-type.ts';
import { DATE_QUESTION, dateType } from './types/date.question-type.ts';
import { LIST_QUESTION, listType } from './types/list.question-type.ts';
import { LONG_TEXT_QUESTION, long_textType } from './types/long-text.question-type.ts';
import { MULTI_CHOICE_QUESTION, multiChoiceType } from './types/multi-choice.question-type.ts';
import { NUMBER_QUESTION, numberType } from './types/number.question-type.ts';
import type { QuestionBase, QuestionType } from './types/question-type.ts';
import { SCALE_QUESTION, scaleType } from './types/scale.question-type.ts';
import { SINGLE_CHOICE_QUESTION, singleChoiceType } from './types/single-choice.question-type.ts';
import { TEXT_QUESTION, textType } from './types/text.question-type.ts';

/** The schema of one question of any type. */
export const QUESTION = z.discriminatedUnion('type', [
  TEXT_QUESTION,
  LONG_TEXT_QUESTION,
  SINGLE_CHOICE_QUESTION,
  MULTI_CHOICE_QUESTION,
  CHECKLIST_QUESTION,
  LIST_QUESTION,
  BOOLEAN_QUESTION,
  NUMBER_QUESTION,
  SCALE_QUESTION,
  DATE_QUESTION,
]);

/** A question definition. */
export type Question = z.infer<typeof QUESTION> & QuestionBase;

/** Registered types by name. The cast is the single place where a type's own question shape is widened. */
const REGISTRY: ReadonlyMap<string, QuestionType> = new Map(
  [textType, long_textType, singleChoiceType, multiChoiceType, checklistType, listType, booleanType, numberType, scaleType, dateType].map((t) => [t.name, t as unknown as QuestionType] as const),
);

/** Names of the registered types. */
export const QUESTION_TYPE_NAMES: readonly string[] = [...REGISTRY.keys()];

/**
 * Looks up a question type.
 * @param name - Type name.
 * @returns The type.
 * @throws {WarlogError} `INVALID_FILE` for a type that is not registered (a hand-edited questionnaire).
 */
export function typeFor(name: string): QuestionType {
  const found = REGISTRY.get(name);
  if (found === undefined) {
    throw new WarlogError('INVALID_FILE', `unknown question type ${name}`, { reason: 'question_type' });
  }
  return found;
}

/**
 * Checks an answer against its question.
 * @param question - The question.
 * @param answer - The answer.
 * @returns A message when invalid.
 * @throws {WarlogError} `INVALID_FILE` for an unknown question type.
 */
export function checkAnswer(question: QuestionBase, answer: unknown): string | undefined {
  return typeFor(question.type).check(question, answer);
}

/**
 * Renders an answer as Markdown.
 * @param question - The question.
 * @param answer - A valid answer.
 * @returns Markdown text.
 * @throws {WarlogError} `INVALID_FILE` for an unknown question type.
 */
export function renderAnswer(question: QuestionBase, answer: unknown): string {
  return typeFor(question.type).render(question, answer);
}
