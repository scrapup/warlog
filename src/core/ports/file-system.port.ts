/**
 * File-system port: every file side effect of warlog goes through it (plan §7.2).
 */
import type { WarlogError } from '../errors/warlog-error.ts';

/** Metadata of a file-system entry. */
export interface FileStat {
  /** `true` for a directory. */
  readonly isDirectory: boolean;
  /** `true` for a regular file. */
  readonly isFile: boolean;
  /** `true` for a symbolic link (only from {@link FileSystem.lstat}). */
  readonly isSymbolicLink: boolean;
  /** Size in bytes. */
  readonly size: number;
  /** Last modification time in epoch milliseconds. */
  readonly mtimeMs: number;
}

/** Options of {@link FileSystem.readDir}. */
export interface ReadDirOptions {
  /** Whether to list every descendant (relative `/`-separated paths). */
  readonly recursive?: boolean;
}

/** Kind of a listed entry (links are reported, never followed). */
export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';

/** One entry of a recursive listing. */
export interface TreeEntry {
  /** Path relative to the listed directory, `/`-separated. */
  readonly relative: string;
  /** Entry kind. */
  readonly kind: EntryKind;
}

/** Releases an exclusive lock. */
export type ReleaseLock = () => Promise<void>;

/**
 * File-system operations used by warlog. Paths should be absolute. The failures documented
 * with `@throws` are {@link WarlogError}s; any other I/O error propagates unchanged and is
 * mapped to `INTERNAL` by the error-mapping behavior.
 */
export interface FileSystem {
  /**
   * Reads a UTF-8 text file.
   * @param path - File path.
   * @returns The content.
   * @throws {WarlogError} `NOT_FOUND` when the file does not exist.
   */
  readFile(path: string): Promise<string>;
  /**
   * Reads a file as bytes (images and diagram sources).
   * @param path - File path.
   * @param maxBytes - Size limit.
   * @returns The content, or `undefined` when the file is larger than the limit.
   * @throws {WarlogError} `NOT_FOUND` when the file does not exist.
   */
  readBinary(path: string, maxBytes: number): Promise<Uint8Array | undefined>;
  /**
   * Writes a file atomically: temporary file in the same directory, `fsync`, `rename`
   * (WL-41). Parent directories are created when missing. Text is written as UTF-8.
   * @param path - File path.
   * @param data - Content (text or bytes).
   * @returns A promise resolved once the file is in place.
   * @throws {WarlogError} `INTERNAL` when the write cannot complete; the previous content stays intact.
   */
  writeFileAtomic(path: string, data: string | Uint8Array): Promise<void>;
  /**
   * Appends UTF-8 text to a file, creating it (and its parents) when missing.
   * @param path - File path.
   * @param data - Text to append.
   * @returns A promise resolved once appended.
   */
  appendFile(path: string, data: string): Promise<void>;
  /**
   * Lists the entries of a directory.
   * @param path - Directory path.
   * @param options - Listing options.
   * @returns Entry names or relative paths; `[]` when the directory does not exist.
   */
  readDir(path: string, options?: ReadDirOptions): Promise<string[]>;
  /**
   * Lists every descendant of a directory with its kind (one call, no per-entry stat).
   * @param path - Directory path.
   * @returns Entries; `[]` when the directory does not exist.
   */
  listTree(path: string): Promise<TreeEntry[]>;
  /**
   * Reads a UTF-8 file of at most `maxBytes` without following a final link where the platform
   * allows it.
   * @param path - File path.
   * @param maxBytes - Size limit.
   * @returns The content, or `undefined` when the file is larger than the limit.
   */
  readFileBounded(path: string, maxBytes: number): Promise<string | undefined>;
  /**
   * Reads entry metadata.
   * @param path - Entry path.
   * @returns The metadata, or `undefined` when the entry does not exist.
   */
  stat(path: string): Promise<FileStat | undefined>;
  /**
   * Reads entry metadata without following a final symbolic link.
   * @param path - Entry path.
   * @returns Metadata, or `undefined` when missing.
   */
  lstat(path: string): Promise<FileStat | undefined>;
  /**
   * Creates a directory and its parents (no error when it exists).
   * @param path - Directory path.
   * @returns A promise resolved once created.
   */
  mkdirp(path: string): Promise<void>;
  /**
   * Resolves symbolic links and returns the canonical path.
   * @param path - Existing path.
   * @returns The canonical absolute path.
   * @throws {WarlogError} `NOT_FOUND` when the path does not exist.
   */
  realpath(path: string): Promise<string>;
  /**
   * Removes a file or directory tree (no error when missing).
   * @param path - Entry path.
   * @returns A promise resolved once removed.
   */
  remove(path: string): Promise<void>;
  /**
   * Acquires an exclusive, hidden lock file next to `path` (`.<name>.lock`), waiting while
   * another process holds it; a lock older than the stale threshold is broken atomically. The
   * release only removes the lock when this holder still owns it.
   * @param path - Path of the guarded file.
   * @returns A function releasing the lock.
   * @throws {WarlogError} `CONFLICT` when the lock cannot be acquired in time.
   */
  lock(path: string): Promise<ReleaseLock>;
}
