/**
 * Common parts of a question definition (plan §3.4, WL-29, WL-30): identifier, prompt, required
 * flag, help text and an optional simple condition on an earlier answer.
 */
import { z } from 'zod';

/**
 * Tells whether a text is a question identifier: lower-case letters, digits and `_`, starting
 * with a letter, at most 64 characters.
 * @param text - Candidate.
 * @returns `true` for a valid identifier.
 */
export function isQuestionId(text: string): boolean {
  const first = text.charAt(0);
  return text.length >= 1 && text.length <= 64 && first >= 'a' && first <= 'z' && [...text].every((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '_');
}

/** A JSON-compatible answer value used in conditions. */
const CONDITION_VALUE = z.union([z.string().max(500), z.number(), z.boolean()]);

/** A condition on an earlier answer: exactly one of `equals`, `not_equals`, `in` (no expressions). */
export const WHEN = z
  .object({
    question: z.string().refine(isQuestionId, 'must be a question id'),
    equals: CONDITION_VALUE.optional(),
    not_equals: CONDITION_VALUE.optional(),
    in: z.array(CONDITION_VALUE).min(1).max(50).optional(),
  })
  .strict()
  .refine((w) => [w.equals, w.not_equals, w.in].filter((v) => v !== undefined).length === 1, 'exactly one of equals, not_equals or in');

/** A condition. */
export type When = z.infer<typeof WHEN>;

/** Fields every question has. */
export const BASE_QUESTION = {
  id: z.string().refine(isQuestionId, 'must be lower-case letters, digits and "_", starting with a letter (max 64)').describe('Question identifier'),
  prompt: z.string().trim().min(1).max(1_000).describe('The question'),
  required: z.boolean().default(false).describe('Whether an answer is required (when the question applies)'),
  help: z.string().max(2_000).optional().describe('Help for whoever answers, an Agent included'),
  when: WHEN.optional().describe('Ask only when an earlier answer matches'),
};

/** Options of choice questions. */
export const OPTIONS = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .refine((o) => new Set(o).size === o.length, 'options must be unique');
