/**
 * Node implementation of the {@link FileSystem} port.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { WarlogError } from '../errors/warlog-error.ts';
import type { FileStat, FileSystem, ReadDirOptions, ReleaseLock, TreeEntry } from '../ports/file-system.port.ts';
import type { Logger } from '../ports/logger.port.ts';
import { acquireFileLock, codeOf } from './node-file-lock.ts';
import { listTreeAt, readBounded, statWith } from './node-file-reads.ts';

/** Tunables of {@link NodeFileSystem} (defaults suit production; tests shorten them). */
export interface NodeFileSystemOptions {
  /** Rename implementation (injected to simulate Windows file locks in tests). */
  readonly rename?: (from: string, to: string) => Promise<void>;
  /** Attempts of a failing rename before giving up (default 3). */
  readonly renameAttempts?: number;
  /** Delay between rename attempts in milliseconds (default 20). */
  readonly renameBackoffMs?: number;
  /** Maximum wait for a lock in milliseconds (default 8 000). */
  readonly lockTimeoutMs?: number;
  /** Age after which a lock file is considered stale and broken (default 4 000, below the timeout). */
  readonly lockStaleMs?: number;
  /** Optional logger for retries and stale-lock events (codes only). */
  readonly logger?: Logger;
}

/** Default rename attempts. */
const DEFAULT_RENAME_ATTEMPTS = 3;
/** Default delay between rename attempts (ms). */
const DEFAULT_RENAME_BACKOFF_MS = 20;
/** Default maximum wait for a lock (ms). */
const DEFAULT_LOCK_TIMEOUT_MS = 8_000;
/** Default stale-lock age (ms), below the lock timeout so an orphan is broken while waiting. */
const DEFAULT_LOCK_STALE_MS = 4_000;

/** Error codes of transient rename failures (Windows file locks). */
const TRANSIENT_RENAME = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Waits for a number of milliseconds.
 * @param ms - Delay.
 * @returns A promise resolved after the delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** {@link FileSystem} backed by `node:fs/promises`. */
export class NodeFileSystem implements FileSystem {
  /** Rename implementation. */
  private readonly renameFn: (from: string, to: string) => Promise<void>;
  /** Rename attempts. */
  private readonly renameAttempts: number;
  /** Rename backoff. */
  private readonly renameBackoffMs: number;
  /** Lock wait limit. */
  private readonly lockTimeoutMs: number;
  /** Stale lock age. */
  private readonly lockStaleMs: number;
  /** Optional logger. */
  private readonly logger: Logger | undefined;

  /**
   * Creates the adapter.
   * @param options - Optional tunables.
   */
  constructor(options: NodeFileSystemOptions = {}) {
    this.renameFn = options.rename ?? fs.rename;
    this.renameAttempts = options.renameAttempts ?? DEFAULT_RENAME_ATTEMPTS;
    this.renameBackoffMs = options.renameBackoffMs ?? DEFAULT_RENAME_BACKOFF_MS;
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.lockStaleMs = options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS;
    this.logger = options.logger;
  }

  /**
   * Reads a UTF-8 text file.
   * @param path - File path.
   * @returns The content.
   * @throws {WarlogError} `NOT_FOUND` when missing.
   */
  async readFile(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf8');
    } catch (error: unknown) {
      throw this.mapMissing(error, path);
    }
  }

  /**
   * Reads a file as bytes.
   * @param path - File path.
   * @param maxBytes - Size limit.
   * @returns The content, or `undefined` above the limit.
   * @throws {WarlogError} `NOT_FOUND` when missing.
   */
  async readBinary(path: string, maxBytes: number): Promise<Uint8Array | undefined> {
    try {
      const stat = await fs.stat(path);
      return stat.size > maxBytes ? undefined : new Uint8Array(await fs.readFile(path));
    } catch (error: unknown) {
      throw this.mapMissing(error, path);
    }
  }

  /**
   * Writes a file atomically (temporary file + fsync + rename, WL-41).
   * @param path - File path.
   * @param data - Content (text or bytes).
   * @returns A promise resolved once written.
   * @throws {WarlogError} `INTERNAL` when the rename keeps failing; the target is untouched.
   */
  async writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    const temp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
    try {
      await this.writeTemp(temp, data);
      await this.renameWithRetry(temp, path);
    } catch (error: unknown) {
      await fs.rm(temp, { force: true }).catch(() => undefined);
      throw new WarlogError('INTERNAL', `cannot replace ${basename(path)}`, { file: basename(path) }, { cause: error });
    }
  }

  /**
   * Appends text to a file, creating it when missing.
   * @param path - File path.
   * @param data - Text.
   * @returns A promise resolved once appended.
   */
  async appendFile(path: string, data: string): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.appendFile(path, data, 'utf8');
  }

  /**
   * Lists a directory.
   * @param path - Directory path.
   * @param options - Listing options.
   * @returns Names or `/`-separated relative paths; `[]` when missing.
   */
  async readDir(path: string, options: ReadDirOptions = {}): Promise<string[]> {
    try {
      const entries = await fs.readdir(path, { recursive: options.recursive === true });
      return entries.map((entry) => entry.split(sep).join('/'));
    } catch (error: unknown) {
      if (codeOf(error) === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Lists every descendant of a directory with its kind.
   * @param path - Directory.
   * @returns Entries; `[]` when the directory does not exist.
   */
  async listTree(path: string): Promise<TreeEntry[]> {
    return listTreeAt(path);
  }

  /**
   * Reads a file of at most `maxBytes` in 64 KiB chunks (one read for a small file); a final
   * link is refused where `O_NOFOLLOW` exists.
   * @param path - File path.
   * @param maxBytes - Size limit.
   * @returns The content, or `undefined` above the limit.
   */
  async readFileBounded(path: string, maxBytes: number): Promise<string | undefined> {
    return readBounded(path, maxBytes);
  }

  /**
   * Reads entry metadata.
   * @param path - Entry path.
   * @returns Metadata or `undefined` when missing (including below a file: ENOTDIR).
   */
  async stat(path: string): Promise<FileStat | undefined> {
    return statWith(() => fs.stat(path));
  }

  /**
   * Reads entry metadata without following a final symbolic link.
   * @param path - Entry path.
   * @returns Metadata or `undefined` when missing.
   */
  async lstat(path: string): Promise<FileStat | undefined> {
    return statWith(() => fs.lstat(path));
  }

  /**
   * Creates a directory tree.
   * @param path - Directory path.
   * @returns A promise resolved once created.
   */
  async mkdirp(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }

  /**
   * Resolves the canonical path.
   * @param path - Existing path.
   * @returns Canonical path.
   * @throws {WarlogError} `NOT_FOUND` when missing.
   */
  async realpath(path: string): Promise<string> {
    try {
      return await fs.realpath(path);
    } catch (error: unknown) {
      throw this.mapMissing(error, path);
    }
  }

  /**
   * Removes an entry recursively.
   * @param path - Entry path.
   * @returns A promise resolved once removed.
   */
  async remove(path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true });
  }

  /**
   * Acquires the hidden lock guarding `path`.
   * @param path - Guarded file path.
   * @returns The release function.
   * @throws {WarlogError} `CONFLICT` (`reason: locked`) when the lock stays busy beyond the timeout.
   */
  async lock(path: string): Promise<ReleaseLock> {
    const options = { timeoutMs: this.lockTimeoutMs, staleMs: this.lockStaleMs };
    return acquireFileLock(path, this.logger === undefined ? options : { ...options, logger: this.logger });
  }

  /**
   * Writes and syncs the temporary file.
   * @param temp - Temporary path (created exclusively).
   * @param data - Content.
   * @returns A promise resolved once durable.
   */
  private async writeTemp(temp: string, data: string | Uint8Array): Promise<void> {
    const handle = await fs.open(temp, 'wx');
    try {
      await (typeof data === 'string' ? handle.writeFile(data, 'utf8') : handle.writeFile(data));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /**
   * Renames, retrying transient failures with a fixed backoff.
   * @param from - Source path.
   * @param to - Destination path.
   * @returns A promise resolved once renamed.
   * @throws {Error} The last rename error.
   */
  private async renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.renameFn(from, to);
        return;
      } catch (error: unknown) {
        if (attempt >= this.renameAttempts || !TRANSIENT_RENAME.has(codeOf(error) ?? '')) {
          throw error;
        }
        this.logger?.log('debug', 'fs.rename_retry', { attempt, sys_code: codeOf(error) });
        await sleep(this.renameBackoffMs);
      }
    }
  }

  /**
   * Maps ENOENT to `NOT_FOUND`, passing other errors through.
   * @param error - Thrown value.
   * @param path - Path involved.
   * @returns The error to throw.
   */
  private mapMissing(error: unknown, path: string): unknown {
    return codeOf(error) === 'ENOENT' ? new WarlogError('NOT_FOUND', `${basename(path)} not found`, { file: basename(path) }) : error;
  }
}
