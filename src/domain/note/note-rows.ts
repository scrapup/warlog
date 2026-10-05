/**
 * Note shapes: the full note carries `content`; list and search rows carry an `excerpt` (WL-38).
 */
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { byCreation, listRow } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { excerpt } from '../shared/text-search.ts';

/**
 * List row of a note.
 * @param note - Note.
 * @returns Fields plus `excerpt`.
 */
export function noteRow(note: IndexedEntity): Row {
  return listRow(note, note.record.body === '' ? {} : { excerpt: excerpt(note.record.body) });
}

/**
 * Orders notes newest first.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
export function newestFirst(a: IndexedEntity, b: IndexedEntity): number {
  return byCreation(b, a);
}
