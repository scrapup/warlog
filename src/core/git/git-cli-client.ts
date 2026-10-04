/**
 * {@link GitClient} running the `git` binary. Only read sub-commands can be executed
 * (WL-72): warlog never stages, commits, pushes or edits ignore files.
 */
import { execFile } from 'node:child_process';
import { WarlogError } from '../errors/warlog-error.ts';
import type { GitClient } from '../ports/git-client.port.ts';

/**
 * Asserts that a git invocation is read-only: `rev-parse …`, `remote`, `remote get-url <name>`
 * or `--version`.
 * @param args - git arguments.
 * @returns Nothing.
 * @throws {WarlogError} `INTERNAL` for any other invocation.
 */
export function assertReadOnlyGit(args: readonly string[]): void {
  const [first, second] = args;
  const ok =
    first === 'rev-parse' ||
    first === '--version' ||
    (first === 'remote' && args.length === 1) ||
    (first === 'remote' && second === 'get-url' && args.length === 3);
  if (!ok) {
    throw new WarlogError('INTERNAL', `git ${first ?? ''} is not a read-only invocation`, { args: [...args] });
  }
}

/** Git client backed by the `git` executable (no shell). */
export class GitCliClient implements GitClient {
  /**
   * Returns the absolute common git directory.
   * @param cwd - Working directory.
   * @returns The common dir or `undefined`.
   */
  async commonDir(cwd: string): Promise<string | undefined> {
    return this.run(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  }

  /**
   * Returns the working tree root.
   * @param cwd - Working directory.
   * @returns The top level or `undefined`.
   */
  async topLevel(cwd: string): Promise<string | undefined> {
    return this.run(cwd, ['rev-parse', '--show-toplevel']);
  }

  /**
   * Lists remote names.
   * @param cwd - Working directory.
   * @returns Remote names.
   */
  async remotes(cwd: string): Promise<string[]> {
    const out = await this.run(cwd, ['remote']);
    return out === undefined || out === '' ? [] : out.split('\n').map((r) => r.trim());
  }

  /**
   * Returns a remote URL.
   * @param cwd - Working directory.
   * @param name - Remote name.
   * @returns The URL or `undefined`.
   */
  async remoteUrl(cwd: string, name: string): Promise<string | undefined> {
    return this.run(cwd, ['remote', 'get-url', name]);
  }

  /**
   * Returns the current branch.
   * @param cwd - Working directory.
   * @returns The branch or `undefined`.
   */
  async currentBranch(cwd: string): Promise<string | undefined> {
    return this.run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  /**
   * Tells whether the git binary can be executed.
   * @param cwd - Working directory.
   * @returns `true` when `git --version` succeeds.
   */
  async isAvailable(cwd: string): Promise<boolean> {
    return (await this.run(cwd, ['--version'])) !== undefined;
  }

  /**
   * Runs a read-only git command.
   * @param cwd - Working directory.
   * @param args - Arguments (checked by {@link assertReadOnlyGit}).
   * @returns Trimmed standard output, or `undefined` on failure (not a repository, git missing).
   */
  private run(cwd: string, args: readonly string[]): Promise<string | undefined> {
    assertReadOnlyGit(args);
    return new Promise((resolve) => {
      execFile('git', [...args], { cwd, encoding: 'utf8', timeout: 10_000, windowsHide: true }, (error, stdout) => {
        resolve(error === null ? stdout.trim() : undefined);
      });
    });
  }
}
