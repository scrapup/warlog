/**
 * Result shapes of the tracker operations (WL-38): a stored entity becomes its front-matter
 * fields plus the body under its field name (`description`, `content`); list rows omit bodies.
 */
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import type { EntityRecord } from '../../core/storage/entity-ref.ts';

/** A result row. */
export type Row = Record<string, unknown>;

/** Front-matter fields never shown in results. */
const HIDDEN_FIELDS: ReadonlySet<string> = new Set(['type']);

/**
 * Fields of a record without the hidden ones.
 * @param record - Stored record.
 * @returns The visible fields.
 */
function visible(record: EntityRecord): Row {
  return Object.fromEntries(Object.entries(record.data).filter(([k]) => !HIDDEN_FIELDS.has(k)));
}

/**
 * Full form of an entity: fields plus body.
 * @param record - Stored record.
 * @param bodyField - Field receiving the body.
 * @returns The row.
 */
export function entityRow(record: EntityRecord, bodyField = 'description'): Row {
  return { ...visible(record), ...(record.body === '' ? {} : { [bodyField]: record.body }) };
}

/**
 * List form of an entity: fields without body.
 * @param entity - Entity.
 * @param extra - Computed fields (counts, names).
 * @returns The row.
 */
export function listRow(entity: IndexedEntity, extra: Row = {}): Row {
  return { ...visible(entity.record), ...extra };
}

/**
 * Copy of a row without one field.
 * @param row - Row.
 * @param field - Field to drop.
 * @returns The copy.
 */
export function omit(row: Readonly<Row>, field: string): Row {
  return Object.fromEntries(Object.entries(row).filter(([k]) => k !== field));
}

/** Rank of each priority (critical first). */
const PRIORITY_RANK: Readonly<Record<string, number>> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Rank of each task status (actionable first). */
const STATUS_RANK: Readonly<Record<string, number>> = { blocked: 0, in_progress: 1, review: 2, todo: 3, done: 4 };

/**
 * Looks a value up in a rank table by its own keys only: a hand-edited `constructor` or `toString`
 * is an unknown value, not a function from the prototype.
 * @param table - Rank table.
 * @param value - Value read from a file.
 * @returns The rank, or `undefined` for an unknown value.
 */
function ownRank(table: Readonly<Record<string, number>>, value: unknown): number | undefined {
  return typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : undefined;
}

/**
 * Rank of an entity's priority.
 * @param entity - Entity.
 * @returns 0 (critical) … 3 (low); unknown values last.
 */
export function priorityRank(entity: IndexedEntity): number {
  return ownRank(PRIORITY_RANK, entity.record.data['priority']) ?? 4;
}

/**
 * Rank of a task's status.
 * @param entity - Task.
 * @returns 0 (blocked) … 4 (done); unknown values last.
 */
export function statusRank(entity: IndexedEntity): number {
  return ownRank(STATUS_RANK, entity.record.data['status']) ?? 5;
}

/**
 * Manual position of an entity (`0` = never placed).
 * @param entity - Entity.
 * @returns The position.
 */
export function sortOrder(entity: IndexedEntity): number {
  const value = entity.record.data['sort_order'];
  return typeof value === 'number' ? value : 0;
}

/**
 * Compares entities by creation (ULIDs sort by creation time).
 * @param a - First.
 * @param b - Second.
 * @returns Negative when `a` was created first.
 */
export function byCreation(a: IndexedEntity, b: IndexedEntity): number {
  return compareCodeUnits(a.id, b.id);
}

/**
 * Text field of an entity.
 * @param entity - Entity.
 * @param field - Field name.
 * @returns The value, or `''`.
 */
export function text(entity: IndexedEntity, field: string): string {
  const value = entity.record.data[field];
  return typeof value === 'string' ? value : '';
}

/**
 * Tags of an entity.
 * @param entity - Entity.
 * @returns The tags.
 */
export function tagsOf(entity: IndexedEntity): string[] {
  const tags = entity.record.data['tags'];
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

/**
 * Percentage with one decimal.
 * @param part - Part.
 * @param total - Total.
 * @returns `part / total` in percent, `0` when `total` is `0`.
 */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part * 1000) / total) / 10;
}
