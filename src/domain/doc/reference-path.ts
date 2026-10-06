/**
 * Where a referenced document lives (WL-69, WL-73). `source_path` is read from the registry, which
 * is versioned with the repository and may come from an untrusted clone, so it is never trusted:
 * it must be a plain relative path whose real location (links resolved) is inside the repository.
 */
import { join } from 'node:path';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { isInside, isSafeSegment } from '../../core/security/path-guard.ts';

/** Where a reference points. */
export type ReferenceTarget =
  | {
      /** The file, inside the repository. */
      readonly path: string;
    }
  | {
      /** Why it cannot be read: not there, or outside the repository. */
      readonly problem: 'missing' | 'outside';
    };

/**
 * Resolves the file a reference points to.
 * @param fs - File system.
 * @param top - Top level of the repository working tree.
 * @param sourcePath - `source_path` of the registered document (`/`-separated, relative).
 * @returns The real path, or why it cannot be used.
 */
export async function resolveReference(fs: FileSystem, top: string, sourcePath: string): Promise<ReferenceTarget> {
  if (sourcePath === '' || sourcePath.split('/').some((segment) => !isSafeSegment(segment))) {
    return { problem: 'outside' };
  }
  const real = await fs.realpath(join(top, ...sourcePath.split('/'))).catch(() => undefined);
  if (real === undefined) {
    return { problem: 'missing' };
  }
  const realTop = await fs.realpath(top).catch(() => top);
  return isInside(realTop, real) ? { path: real } : { problem: 'outside' };
}
