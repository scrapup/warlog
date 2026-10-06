/**
 * The text of an answer (or list item) promoted to a memory (WL-32): text answers as they are,
 * numbers and booleans as written, lists and checklists by item.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';

/**
 * Picks the item of a list answer.
 * @param items - Items.
 * @param index - Zero-based index.
 * @returns The item text.
 * @throws {WarlogError} `VALIDATION` when the index is missing or out of range.
 */
function pickItem(items: readonly string[], index: number | undefined): string {
  if (index === undefined || index >= items.length) {
    throw new WarlogError('VALIDATION', `item_index is required for a list answer and must be 0-${Math.max(items.length - 1, 0)}`, { field: 'item_index', items: items.length });
  }
  return items[index] ?? '';
}

/**
 * Text to promote.
 * @param answer - The answer given to the question.
 * @param itemIndex - Zero-based item of a list, multi-choice or checklist answer.
 * @returns The text.
 * @throws {WarlogError} `VALIDATION` for a missing answer, a missing or out-of-range index, or an index on a single value.
 */
export function promotableText(answer: unknown, itemIndex: number | undefined): string {
  if (answer === undefined || answer === null) {
    throw new WarlogError('VALIDATION', 'the response has no answer to that question', { field: 'question_id' });
  }
  if (Array.isArray(answer)) {
    return pickItem(answer.map(String), itemIndex);
  }
  if (isPlainRecord(answer)) {
    return pickItem(Object.keys(answer), itemIndex);
  }
  if (itemIndex !== undefined) {
    throw new WarlogError('VALIDATION', 'item_index applies to list answers only', { field: 'item_index' });
  }
  return String(answer);
}
