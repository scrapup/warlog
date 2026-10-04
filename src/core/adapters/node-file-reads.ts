/**
 * Read-side helpers of the Node file system adapter: metadata, recursive listing with entry kinds and
 * bounded reads.
 */
import { constants } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { EntryKind, FileStat, TreeEntry } from '../ports/file-system.port.ts';
import { codeOf } from './node-file-lock.ts';

/** Chunk size of bounded reads (a small file is read in one call). */
const READ_CHUNK_BYTES = 64 * 1024;

/** Open flags of bounded reads: read-only, refusing a final link where supported. */
const OPEN_NO_FOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

/**
 * Kind of a directory entry.
 * @param entry - Entry.
 * @returns Its kind.
 */
function kindOf(entry: Dirent): EntryKind {
  if (entry.isSymbolicLink()) {
    return 'symlink';
  }
  if (entry.isFile()) {
    return 'file';
  }
  return entry.isDirectory() ? 'directory' : 'other';
}

/**
 * Runs a stat call; a missing entry (including below a file: ENOTDIR) is `undefined`.
 * @param call - `fs.stat` or `fs.lstat` of the path.
 * @returns Metadata or `undefined`.
 */
export async function statWith(call: () => Promise<Stats>): Promise<FileStat | undefined> {
  try {
    const s = await call();
    return { isDirectory: s.isDirectory(), isFile: s.isFile(), isSymbolicLink: s.isSymbolicLink(), size: s.size, mtimeMs: s.mtimeMs };
  } catch (error: unknown) {
    if (codeOf(error) === 'ENOENT' || codeOf(error) === 'ENOTDIR') {
      return undefined;
    }
    throw error;
  }
}

/**
 * Lists every descendant of a directory with its kind.
 * @param path - Directory.
 * @returns Entries; `[]` when the directory does not exist.
 */
export async function listTreeAt(path: string): Promise<TreeEntry[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(path, { recursive: true, withFileTypes: true });
  } catch (error: unknown) {
    if (codeOf(error) === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return entries.map((e) => ({ relative: relative(path, join(e.parentPath, e.name)).split(sep).join('/'), kind: kindOf(e) }));
}

/**
 * Reads a file of at most `maxBytes` in 64 KiB chunks (one read for a small file); a final link is
 * refused where `O_NOFOLLOW` exists.
 * @param path - File path.
 * @param maxBytes - Size limit.
 * @returns The content, or `undefined` above the limit.
 */
export async function readBounded(path: string, maxBytes: number): Promise<string | undefined> {
  const handle = await fs.open(path, OPEN_NO_FOLLOW);
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, READ_CHUNK_BYTES, null);
      total += bytesRead;
      if (total > maxBytes) {
        return undefined;
      }
      chunks.push(buffer.subarray(0, bytesRead));
      if (bytesRead < READ_CHUNK_BYTES) {
        return Buffer.concat(chunks, total).toString('utf8');
      }
    }
  } finally {
    await handle.close();
  }
}
