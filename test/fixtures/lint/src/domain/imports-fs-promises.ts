import { readFile } from 'fs/promises';

/**
 * Reads a file directly from the domain.
 * @param path - File path.
 * @returns The content.
 */
export function read(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
