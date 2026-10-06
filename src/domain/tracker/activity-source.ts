/**
 * Activity of a call's roots (repository and global), for the activity queries.
 */
import { readActivity } from '../../core/index/activity-reader.ts';
import type { ActivityRead } from '../../core/index/activity-reader.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';

/**
 * Reads the activity of the call's roots.
 * @param fs - File system.
 * @param context - Call context.
 * @param since - Keep records at or after this instant.
 * @returns The records, oldest first.
 */
export function activityOf(fs: FileSystem, context: OperationContext, since?: string): Promise<ActivityRead> {
  const roots = [context.roots.global, ...(context.roots.repository === undefined ? [] : [context.roots.repository.root])];
  return readActivity(fs, roots, since);
}

/**
 * Normalizes an ISO 8601 instant given by a caller (date-only values mean midnight UTC).
 * @param value - Caller value.
 * @returns The instant in `toISOString` form.
 * @throws {RangeError} When the value is not a date.
 */
export function isoInstant(value: string): string {
  return new Date(value).toISOString();
}
