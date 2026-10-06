/**
 * Test helper: absolute path of the `git` executable found on `PATH`, so tests never run a bare
 * command name (the lookup order of the platform is not left to chance).
 */
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * Finds git on `PATH`.
 * @returns The absolute path of `git` (`git.exe` on Windows).
 * @throws {Error} When git is not installed.
 */
export function gitExecutable(): string {
  const name = process.platform === 'win32' ? 'git.exe' : 'git';
  const found = (process.env['PATH'] ?? '')
    .split(delimiter)
    .filter((dir) => dir !== '')
    .map((dir) => join(dir, name))
    .find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error('git not found on PATH');
  }
  return found;
}
