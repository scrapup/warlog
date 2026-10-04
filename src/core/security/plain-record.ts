/**
 * Type guard for plain JSON-like objects (not `null`, not an array).
 */

/**
 * Tells whether a value is a plain record.
 * @param value - Any value.
 * @returns `true` for a non-null, non-array object.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
