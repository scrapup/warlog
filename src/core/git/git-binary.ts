/**
 * Resolution of the git executable. On Windows, a bare `git` would be searched in the working
 * directory before `PATH`, so an untrusted repository could ship its own `git.exe`; the absolute
 * path is resolved from `PATH` instead (absolute entries only).
 */
import { win32 } from 'node:path';

/**
 * Resolves the git executable.
 * @param platform - `process.platform`.
 * @param pathEnv - `PATH` value.
 * @param exists - File existence check.
 * @returns An absolute path on Windows when found in `PATH`, otherwise `git`.
 */
export function resolveGitBinary(platform: string, pathEnv: string | undefined, exists: (path: string) => boolean): string {
  if (platform !== 'win32') {
    return 'git';
  }
  for (const dir of (pathEnv ?? '').split(';')) {
    const candidate = win32.join(dir, 'git.exe');
    if (dir !== '' && win32.isAbsolute(dir) && exists(candidate)) {
      return candidate;
    }
  }
  return 'git';
}
