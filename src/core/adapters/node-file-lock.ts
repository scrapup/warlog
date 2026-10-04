/**
 * Exclusive lock files for the Node file system: a hidden `.<name>.lock` holding a random
 * ownership token. Stale locks are broken atomically (rename to a unique name, then unlink) and
 * a release only removes a lock this holder still owns.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { WarlogError } from '../errors/warlog-error.ts';
import type { ReleaseLock } from '../ports/file-system.port.ts';
import type { Logger } from '../ports/logger.port.ts';

/** Tunables of the lock. */
export interface FileLockOptions {
  /** Maximum wait in milliseconds. */
  readonly timeoutMs: number;
  /** Age (absolute, clock-skew tolerant) after which a lock is broken. */
  readonly staleMs: number;
  /** Optional logger for stale-lock events. */
  readonly logger?: Logger;
}

/** Minimum delay between attempts. */
const POLL_MIN_MS = 5;
/** Random extra delay between attempts (avoids lock-step retries). */
const POLL_JITTER_MS = 10;
/** Lock creation errors meaning "busy" (Windows reports a pending delete as EPERM/EACCES). */
const BUSY_CODES = new Set(['EEXIST', 'EPERM', 'EACCES']);

/**
 * Returns the `code` of a Node system error.
 * @param error - Thrown value.
 * @returns The code, or `undefined`.
 */
export function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

/**
 * Path of the hidden lock file guarding `path`.
 * @param path - Guarded file.
 * @returns `<dir>/.<name>.lock`.
 */
export function lockPathOf(path: string): string {
  return join(dirname(path), `.${basename(path)}.lock`);
}

/**
 * Breaks a lock older than the stale threshold by renaming it away (only one waiter wins).
 * @param lockPath - Lock file.
 * @param options - Lock options.
 * @returns A promise resolved once handled.
 */
async function breakIfStale(lockPath: string, options: FileLockOptions): Promise<void> {
  const info = await fs.stat(lockPath).catch(() => undefined);
  if (info === undefined || Math.abs(Date.now() - info.mtimeMs) <= options.staleMs) {
    return;
  }
  const graveyard = `${lockPath}.stale-${randomBytes(4).toString('hex')}`;
  try {
    await fs.rename(lockPath, graveyard);
  } catch {
    return;
  }
  await fs.rm(graveyard, { force: true });
  options.logger?.log('warn', 'fs.lock_stale_broken', { age_ms: Math.round(Math.abs(Date.now() - info.mtimeMs)) });
}

/**
 * Tries to create the lock once.
 * @param lockPath - Lock file.
 * @param token - Ownership token.
 * @param options - Lock options.
 * @returns `true` when this holder now owns the lock.
 */
async function tryCreate(lockPath: string, token: string, options: FileLockOptions): Promise<boolean> {
  try {
    await fs.writeFile(lockPath, token, { flag: 'wx' });
    return true;
  } catch (error: unknown) {
    if (!BUSY_CODES.has(codeOf(error) ?? '')) {
      throw error;
    }
    await breakIfStale(lockPath, options);
    return false;
  }
}

/**
 * Acquires the lock guarding `path`.
 * @param path - Guarded file.
 * @param options - Lock options.
 * @returns The release function (removes the lock only while still owned).
 * @throws {WarlogError} `CONFLICT` (`reason: locked`) when the lock stays busy beyond the timeout.
 */
export async function acquireFileLock(path: string, options: FileLockOptions): Promise<ReleaseLock> {
  const lockPath = lockPathOf(path);
  await fs.mkdir(dirname(lockPath), { recursive: true });
  const token = `${process.pid}-${randomBytes(8).toString('hex')}`;
  const deadline = Date.now() + options.timeoutMs;
  while (!(await tryCreate(lockPath, token, options))) {
    if (Date.now() > deadline) {
      throw new WarlogError('CONFLICT', `${basename(path)} is locked by another writer`, { reason: 'locked' });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MIN_MS + Math.floor(Math.random() * POLL_JITTER_MS)));
  }
  return async () => {
    const owner = await fs.readFile(lockPath, 'utf8').catch(() => undefined);
    if (owner === token) {
      await fs.rm(lockPath, { force: true });
    }
  };
}
