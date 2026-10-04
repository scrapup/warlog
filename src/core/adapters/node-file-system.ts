/**
 * Node implementation of the {@link FileSystem} port.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { WarlogError } from '../errors/warlog-error.ts';
import type { FileStat, FileSystem, ReadDirOptions, ReleaseLock } from '../ports/file-system.port.ts';

/** Tunables of {@link NodeFileSystem} (defaults suit production; tests shorten them). */
export interface NodeFileSystemOptions {
  /** Rename implementation (injected to simulate Windows file locks in tests). */
  readonly rename?: (from: string, to: string) => Promise<void>;
  /** Attempts of a failing rename before giving up (default 3). */
  readonly renameAttempts?: number;
  /** Delay between rename attempts in milliseconds (default 20). */
  readonly renameBackoffMs?: number;
  /** Maximum wait for a lock in milliseconds (default 5 000). */
  readonly lockTimeoutMs?: number;
  /** Age after which a lock file is considered stale and broken (default 10 000). */
  readonly lockStaleMs?: number;
}

/** Error codes of transient rename failures (Windows file locks). */
const TRANSIENT_RENAME = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Returns the `code` of a Node system error.
 * @param error - Thrown value.
 * @returns The code, or `undefined`.
 */
function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

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

  /**
   * Creates the adapter.
   * @param options - Optional tunables.
   */
  constructor(options: NodeFileSystemOptions = {}) {
    this.renameFn = options.rename ?? fs.rename;
    this.renameAttempts = options.renameAttempts ?? 3;
    this.renameBackoffMs = options.renameBackoffMs ?? 20;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    this.lockStaleMs = options.lockStaleMs ?? 10_000;
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
   * Writes a file atomically (temporary file + fsync + rename, WL-41).
   * @param path - File path.
   * @param data - Content.
   * @returns A promise resolved once written.
   * @throws {WarlogError} `INTERNAL` when the rename keeps failing; the target is untouched.
   */
  async writeFileAtomic(path: string, data: string): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    const temp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
    const handle = await fs.open(temp, 'wx');
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await this.renameWithRetry(temp, path);
    } catch (error: unknown) {
      await fs.rm(temp, { force: true });
      throw new WarlogError('INTERNAL', `cannot replace ${path}`, { path }, { cause: error });
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
   * Reads entry metadata.
   * @param path - Entry path.
   * @returns Metadata or `undefined` when missing.
   */
  async stat(path: string): Promise<FileStat | undefined> {
    try {
      const s = await fs.stat(path);
      return { isDirectory: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs };
    } catch (error: unknown) {
      if (codeOf(error) === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
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
   * Acquires `<path>.lock` exclusively.
   * @param path - Guarded file path.
   * @returns The release function.
   * @throws {WarlogError} `CONFLICT` when the lock stays busy beyond the timeout.
   */
  async lock(path: string): Promise<ReleaseLock> {
    const lockPath = `${path}.lock`;
    await fs.mkdir(dirname(lockPath), { recursive: true });
    const deadline = Date.now() + this.lockTimeoutMs;
    while (!(await this.tryCreateLock(lockPath))) {
      if (Date.now() > deadline) {
        throw new WarlogError('CONFLICT', `${path} is locked by another writer`, { path });
      }
      await sleep(5 + Math.floor(Math.random() * 10));
    }
    return () => fs.rm(lockPath, { force: true });
  }

  /**
   * Tries to create the lock file once, breaking it when stale.
   * @param lockPath - Lock file path.
   * @returns `true` when this process now owns the lock.
   */
  private async tryCreateLock(lockPath: string): Promise<boolean> {
    try {
      await fs.writeFile(lockPath, String(process.pid), { flag: 'wx' });
      return true;
    } catch (error: unknown) {
      if (codeOf(error) !== 'EEXIST') {
        throw error;
      }
      const info = await this.stat(lockPath);
      if (info !== undefined && Date.now() - info.mtimeMs > this.lockStaleMs) {
        await fs.rm(lockPath, { force: true });
      }
      return false;
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
    return codeOf(error) === 'ENOENT' ? new WarlogError('NOT_FOUND', `${path} not found`, { path }) : error;
  }
}
