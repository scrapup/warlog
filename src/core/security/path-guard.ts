/**
 * Path confinement (WL-49): every path built from identifiers, names or scopes resolves
 * inside its root, symbolic links included.
 */
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { WarlogError, isWarlogError } from '../errors/warlog-error.ts';
import type { FileSystem } from '../ports/file-system.port.ts';

/** Characters never allowed inside one path segment. */
const FORBIDDEN_SEGMENT_CHARS = ['/', '\\', ':', '%', '\0'];

/** Windows device names, reserved with or without extension. */
const RESERVED_WINDOWS_NAMES = new Set(['con', 'prn', 'aux', 'nul', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`com${n}`, `lpt${n}`])]);

/**
 * Tells whether a segment is a plain file or directory name, portable to Windows.
 * @param segment - One path segment.
 * @returns `false` for empty, `.`, `..`, separators, drive letters, percent-encoding, NUL,
 *   Windows device names (`con`, `nul.yaml`, …) or a trailing dot or space.
 */
export function isSafeSegment(segment: string): boolean {
  const base = segment.split('.')[0]?.toLowerCase() ?? '';
  return (
    segment !== '' &&
    segment !== '.' &&
    segment !== '..' &&
    !FORBIDDEN_SEGMENT_CHARS.some((ch) => segment.includes(ch)) &&
    !RESERVED_WINDOWS_NAMES.has(base) &&
    !segment.endsWith('.') &&
    !segment.endsWith(' ')
  );
}

/**
 * Tells whether `child` is `root` itself or below it.
 * @param root - Root path (absolute).
 * @param child - Candidate path (absolute).
 * @returns `true` when contained.
 */
export function isInside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Resolves paths confined to a root. */
export class PathGuard {
  /** File system (for `realpath`). */
  private readonly fs: FileSystem;

  /**
   * Creates the guard.
   * @param fs - File system.
   */
  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  /**
   * Joins segments under a root, rejecting any escape (syntactic or through symbolic links of
   * the deepest existing ancestor).
   * @param root - Absolute root directory.
   * @param segments - Plain path segments.
   * @returns The absolute path.
   * @throws {WarlogError} `VALIDATION` when a segment is unsafe or the path leaves the root.
   */
  async resolveInside(root: string, ...segments: string[]): Promise<string> {
    const bad = segments.find((s) => !isSafeSegment(s));
    if (bad !== undefined) {
      throw new WarlogError('VALIDATION', 'path segment is not a plain name', { segment: bad });
    }
    const target = resolve(join(root, ...segments));
    if (!isInside(resolve(root), target)) {
      throw new WarlogError('VALIDATION', 'path escapes its root', { root });
    }
    const realRoot = await this.realOrSelf(root);
    const realAncestor = await this.deepestRealAncestor(target, root);
    if (!isInside(realRoot, realAncestor)) {
      throw new WarlogError('VALIDATION', 'path escapes its root through a symbolic link', { root });
    }
    return target;
  }

  /**
   * Returns the canonical path of the deepest existing ancestor of `target` (stops at `root`).
   * @param target - Absolute target.
   * @param root - Root path.
   * @returns Canonical path.
   */
  private async deepestRealAncestor(target: string, root: string): Promise<string> {
    let current = target;
    while (isInside(resolve(root), current)) {
      const real = await this.realOrUndefined(current);
      if (real !== undefined) {
        return real;
      }
      current = resolve(current, '..');
    }
    return this.realOrSelf(root);
  }

  /**
   * Canonical path, or the path itself when it does not exist.
   * @param path - Path.
   * @returns Canonical or original path.
   */
  private async realOrSelf(path: string): Promise<string> {
    return (await this.realOrUndefined(path)) ?? resolve(path);
  }

  /**
   * Canonical path, or `undefined` when missing.
   * @param path - Path.
   * @returns Canonical path or `undefined`.
   */
  private async realOrUndefined(path: string): Promise<string | undefined> {
    try {
      return await this.fs.realpath(path);
    } catch (error: unknown) {
      if (isWarlogError(error, 'NOT_FOUND')) {
        return undefined;
      }
      throw error;
    }
  }
}
