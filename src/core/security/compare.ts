/**
 * Locale-independent string ordering (by UTF-16 code unit), so files written on any machine
 * sort the same way.
 */

/**
 * Compares two strings by code unit.
 * @param a - First string.
 * @param b - Second string.
 * @returns Negative, zero or positive, like `Array.prototype.sort` expects.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
