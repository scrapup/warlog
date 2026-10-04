import type { FileSystem } from '../ports/file-system.ts';

/**
 * Reads a file through the port.
 * @param fs - File-system port.
 * @param path - File path.
 * @returns The content.
 */
export function read(fs: FileSystem, path: string): Promise<string> {
  return fs.readText(path);
}
