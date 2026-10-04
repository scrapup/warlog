/**
 * Reads one store file for the view with the confinement rules of WL-48 (plan §3.7): symbolic
 * links are never followed, only regular files are read and files above
 * {@link MAX_STORE_FILE_BYTES} are not loaded. Every refusal becomes an exclusion reason.
 */
import type { FileSystem } from '../ports/file-system.port.ts';
import { readStoreFile } from './entity-reader.ts';
import type { ReadOutcome } from './entity-reader.ts';
import type { ScannedFile } from './indexed-entity.ts';

/** Largest store file loaded into the view (2 MiB, the Markdown limit of WL-65). */
export const MAX_STORE_FILE_BYTES = 2 * 1024 * 1024;

/** Content of a file that was read. */
export interface FileText {
  /** UTF-8 content. */
  readonly text: string;
}

/** Why a file was not read. */
export interface FileRefusal {
  /** `missing`, `symlink`, `not_regular`, `too_large` or `unreadable[:CODE]`. */
  readonly reason: string;
}

/**
 * Error code of a failed read, for the exclusion reason.
 * @param error - Thrown value.
 * @returns `unreadable` or `unreadable:<CODE>`.
 */
function unreadable(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
  return typeof code === 'string' && /^E[A-Z]+$/.test(code) ? `unreadable:${code}` : 'unreadable';
}

/**
 * Reads a text file when it is a regular file within the size limit.
 * @param fs - File system.
 * @param path - Absolute path.
 * @returns The text, or the reason it was not read (`missing` when absent).
 */
export async function readRegularFile(fs: FileSystem, path: string): Promise<FileText | FileRefusal> {
  try {
    const stat = await fs.lstat(path);
    if (stat === undefined) {
      return { reason: 'missing' };
    }
    if (stat.isSymbolicLink) {
      return { reason: 'symlink' };
    }
    if (!stat.isFile) {
      return { reason: 'not_regular' };
    }
    if (stat.size > MAX_STORE_FILE_BYTES) {
      return { reason: 'too_large' };
    }
    return { text: await fs.readFile(path) };
  } catch (error: unknown) {
    return { reason: unreadable(error) };
  }
}

/**
 * Reads and interprets one store file.
 * @param fs - File system.
 * @param file - Scanned file (`.md` or `.yaml`).
 * @returns Entity, variable or exclusion reason.
 */
export async function loadStoreFile(fs: FileSystem, file: ScannedFile): Promise<ReadOutcome> {
  const read = await readRegularFile(fs, file.path);
  return 'text' in read ? readStoreFile(file, read.text) : { kind: 'invalid', reason: read.reason };
}
