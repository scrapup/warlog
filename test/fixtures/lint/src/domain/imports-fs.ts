import { readFileSync } from 'node:fs';

/**
 * Reads a file directly from the domain.
 * @param path - File path.
 * @returns The content.
 */
export function read(path: string): string {
  return readFileSync(path, 'utf8');
}
