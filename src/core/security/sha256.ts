/**
 * SHA-256 fingerprints (document content, assets, references): pure functions over bytes or text.
 */
import { createHash } from 'node:crypto';

/**
 * Hex SHA-256 of bytes or UTF-8 text.
 * @param data - Content.
 * @returns 64 lower-case hex digits.
 */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
