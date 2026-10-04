/**
 * Results returned by operation handlers, shaped for the presenter (WL-38).
 */
import type { EntityRecord } from '../storage/entity-ref.ts';

/** A list of rows (rendered as a table by default). */
export interface ListResult {
  /** Result kind. */
  readonly kind: 'list';
  /** Rows; bodies omitted by default. */
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  /** Opaque cursor of the next page, when more rows exist. */
  readonly nextCursor?: string;
}

/** One entity (rendered as front matter + body by default). */
export interface EntityResult {
  /** Result kind. */
  readonly kind: 'entity';
  /** The entity. */
  readonly record: EntityRecord;
}

/** A structured value (rendered as YAML by default). */
export interface ObjectResult {
  /** Result kind. */
  readonly kind: 'object';
  /** The value. */
  readonly value: Readonly<Record<string, unknown>>;
}

/** A scalar value (printed raw by the CLI, WL-39). */
export interface ScalarResult {
  /** Result kind. */
  readonly kind: 'scalar';
  /** The value. */
  readonly value: string | number | boolean | null;
}

/** Any operation result. */
export type OperationResult = ListResult | EntityResult | ObjectResult | ScalarResult;
