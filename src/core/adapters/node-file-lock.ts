/**
 * Exclusive lock files for the Node file system: a hidden `.<name>.lock` holding a random
 * ownership token. Stale locks are broken atomically (rename to a unique name, then unlink) and
 * a release only removes a lock this holder still owns.
 */
import { randomBytes, randomInt } from 'node:crypto';
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

/** Identity of a lock file judged stale. */
interface LockIdentity {
  /** Inode observed when judged stale. */
  readonly ino: number;
  /** Token read when judged stale. */
  readonly token: string | undefined;
}

/**
 * Moves a lock away only if it is still the exact file judged stale (same inode and token); a
 * fresh lock created meanwhile by another waiter is put back untouched.
 * @param lockPath - Lock file.
 * @param judged - Identity of the stale lock.
 * @returns `true` when the stale lock was removed.
 */
async function removeIfSame(lockPath: string, judged: LockIdentity): Promise<boolean> {
  const graveyard = `${lockPath}.stale-${randomBytes(4).toString('hex')}`;
  try {
    await fs.rename(lockPath, graveyard);
  } catch {
    return false;
  }
  const moved = await fs.stat(graveyard).catch(() => undefined);
  const token = await fs.readFile(graveyard, 'utf8').catch(() => undefined);
  if (moved?.ino === judged.ino && token === judged.token) {
    await fs.rm(graveyard, { force: true });
    return true;
  }
  await fs.link(graveyard, lockPath).catch(() => undefined);
  await fs.rm(graveyard, { force: true });
  return false;
}

/**
 * Breaks a lock older than the stale threshold (age is absolute, so clock skew counts too).
 * @param lockPath - Lock file.
 * @param options - Lock options.
 * @returns `true` when the lock no longer exists after the attempt.
 */
async function breakIfStale(lockPath: string, options: FileLockOptions): Promise<boolean> {
  const token = await fs.readFile(lockPath, 'utf8').catch(() => undefined);
  const info = await fs.stat(lockPath).catch(() => undefined);
  if (info === undefined) {
    return true;
  }
  const age = Math.abs(Date.now() - info.mtimeMs);
  if (age <= options.staleMs || !(await removeIfSame(lockPath, { ino: info.ino, token }))) {
    return false;
  }
  options.logger?.log('warn', 'fs.lock_stale_broken', { file: basename(lockPath), age_ms: Math.round(age), future_mtime: info.mtimeMs > Date.now() });
  return true;
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
    const gone = await breakIfStale(lockPath, options);
    if (gone && codeOf(error) !== 'EEXIST' && (await fs.stat(lockPath).catch(() => undefined)) === undefined) {
      throw error;
    }
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
    await new Promise((resolve) => setTimeout(resolve, POLL_MIN_MS + randomInt(POLL_JITTER_MS)));
  }
  return async () => {
    const owner = await fs.readFile(lockPath, 'utf8').catch(() => undefined);
    if (owner === token) {
      await fs.rm(lockPath, { force: true });
    }
  };
}
