/**
 * Resolution of the git executable. On Windows, a bare `git` would be searched in the working
 * directory before `PATH`, so an untrusted repository could ship its own `git.exe`; the absolute
 * path is resolved from `PATH` instead (absolute entries only).
 */
import { win32 } from 'node:path';

/** Executable name that cannot exist: spawning it fails with ENOENT ("git unavailable"). */
export const UNRESOLVED_GIT = 'warlog-git-not-found-on-path';

/**
 * Resolves the git executable.
 * @param platform - `process.platform`.
 * @param pathEnv - `PATH` value.
 * @param exists - File existence check.
 * @returns `git` outside Windows; on Windows the absolute `git.exe` from `PATH`, or
 *   {@link UNRESOLVED_GIT} (never a bare name that would be searched in the working directory).
 */
export function resolveGitBinary(platform: string, pathEnv: string | undefined, exists: (path: string) => boolean): string {
  if (platform !== 'win32') {
    return 'git';
  }
  for (const raw of (pathEnv ?? '').split(';')) {
    const dir = raw.startsWith('"') && raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1) : raw;
    const candidate = win32.join(dir, 'git.exe');
    if (dir !== '' && win32.isAbsolute(dir) && exists(candidate)) {
      return candidate;
    }
  }
  return UNRESOLVED_GIT;
}
