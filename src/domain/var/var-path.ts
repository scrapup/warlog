/**
 * Reads a field inside an object or array value by a dotted path (WL-27): segments are own
 * property names or, for arrays, indexes; nothing is evaluated.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';

/** Longest path accepted. */
export const MAX_PATH_CHARS = 256;

/**
 * Looks a path up in a value.
 * @param value - Variable value.
 * @param path - Dotted path (`a.b.0`).
 * @returns The value at the path.
 * @throws {WarlogError} `VALIDATION` for an empty segment; `NOT_FOUND` when the path does not exist.
 */
export function valueAtPath(value: unknown, path: string): unknown {
  if (path.length > MAX_PATH_CHARS) {
    throw new WarlogError('VALIDATION', `path is longer than ${MAX_PATH_CHARS} characters`, { field: 'path' });
  }
  const segments = path.split('.');
  if (segments.some((s) => s === '')) {
    throw new WarlogError('VALIDATION', 'path has an empty segment', { field: 'path' });
  }
  let current: unknown = value;
  for (const segment of segments) {
    current = child(current, segment);
    if (current === undefined) {
      throw new WarlogError('NOT_FOUND', `path ${path} does not exist in the value`, { type: 'path', path });
    }
  }
  return current;
}

/**
 * One step of a path.
 * @param parent - Current value.
 * @param segment - Property name or array index.
 * @returns The child, or `undefined` when there is none.
 */
function child(parent: unknown, segment: string): unknown {
  if (Array.isArray(parent)) {
    return [...segment].every((c) => c >= '0' && c <= '9') ? parent[Number(segment)] : undefined;
  }
  return isPlainRecord(parent) && Object.hasOwn(parent, segment) ? parent[segment] : undefined;
}
