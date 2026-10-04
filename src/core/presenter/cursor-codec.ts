/**
 * Opaque pagination cursors (WL-38): base64url of the last row's sort key and ULID.
 */
import { WarlogError } from '../errors/warlog-error.ts';

/** Position after which the next page starts. */
export interface Cursor {
  /** Sort key of the last returned row. */
  readonly key: string;
  /** Identifier of the last returned row (tie-breaker). */
  readonly id: string;
}

/**
 * Encodes a cursor.
 * @param cursor - Position.
 * @returns Opaque text.
 */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.id]), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor, failing closed on anything else (SEC-23).
 * @param text - Opaque text.
 * @returns Position.
 * @throws {WarlogError} `VALIDATION` for a malformed cursor.
 */
export function decodeCursor(text: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    parsed = undefined;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') {
    throw new WarlogError('VALIDATION', 'invalid cursor', { field: 'cursor' });
  }
  return { key: parsed[0], id: parsed[1] };
}
