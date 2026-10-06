/**
 * `checklist` question: every item ticked or not, all of them when `require_all` is set.
 */
import { z } from 'zod';
import { isPlainRecord } from '../../../core/security/plain-record.ts';
import { BASE_QUESTION, OPTIONS } from '../question.schema.ts';
import type { QuestionBase, QuestionType } from './question-type.ts';

/** Definition schema. */
export const CHECKLIST_QUESTION = z.object({ ...BASE_QUESTION, type: z.literal('checklist'), items: OPTIONS, require_all: z.boolean().optional().describe('Every item must be ticked') }).strict();

/** A checklist question. */
interface ChecklistQuestion extends QuestionBase {
  /** The items. */
  readonly items: readonly string[];
  /** Whether every item must be ticked. */
  readonly require_all?: boolean | undefined;
}

/** The `checklist` type. */
export const checklistType: QuestionType<ChecklistQuestion> = {
  name: 'checklist',
  definition: CHECKLIST_QUESTION,
  check: (question, answer) => {
    if (!isPlainRecord(answer) || !Object.values(answer).every((v) => typeof v === 'boolean')) {
      return 'must be an object of item: true/false';
    }
    const keys = Object.keys(answer);
    const missing = question.items.filter((i) => !keys.includes(i));
    const extra = keys.filter((k) => !question.items.includes(k));
    if (missing.length > 0 || extra.length > 0) {
      return `must have exactly the items ${question.items.join(', ')}`;
    }
    return question.require_all === true && Object.values(answer).some((v) => v !== true) ? 'every item must be ticked' : undefined;
  },
  render: (question, answer) => question.items.map((i) => `- [${(answer as Record<string, boolean>)[i] === true ? 'x' : ' '}] ${i}`).join('\n'),
};
