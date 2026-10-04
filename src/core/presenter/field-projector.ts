/**
 * Field selection on results (WL-38).
 */
import { WarlogError } from '../errors/warlog-error.ts';

/**
 * Keeps only the requested fields of each record.
 * @param records - Records.
 * @param fields - Requested fields (empty: all).
 * @returns Projected records.
 * @throws {WarlogError} `VALIDATION` when a field exists in none of the records.
 */
export function projectFields(records: readonly Readonly<Record<string, unknown>>[], fields: readonly string[]): Record<string, unknown>[] {
  if (fields.length === 0) {
    return records.map((r) => ({ ...r }));
  }
  if (records.length > 0) {
    const known = new Set(records.flatMap((r) => Object.keys(r)));
    const unknown = fields.filter((f) => !known.has(f));
    if (unknown.length > 0) {
      throw new WarlogError('VALIDATION', `unknown field(s): ${unknown.join(', ')}`, { field: 'fields', unknown });
    }
  }
  return records.map((r) => Object.fromEntries(fields.filter((f) => f in r).map((f) => [f, r[f]])));
}
