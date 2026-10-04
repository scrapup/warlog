/**
 * {@link GitClient} running the `git` binary. Only read sub-commands can be executed
 * (WL-72): warlog never stages, commits, pushes or edits ignore files.
 */
import { execFile } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';
import { existsSync } from 'node:fs';
import { WarlogError } from '../errors/warlog-error.ts';
import type { GitClient } from '../ports/git-client.port.ts';
import type { Logger } from '../ports/logger.port.ts';
import { resolveGitBinary } from './git-binary.ts';

/** Maximum duration of one git command. */
const GIT_TIMEOUT_MS = 10_000;

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

/**
 * Tells whether a git failure is an expected answer (non-zero exit: not a repository, unknown
 * remote) or a missing binary, as opposed to an operational failure (timeout, signal).
 * @param error - execFile error.
 * @returns `true` for expected outcomes.
 */
export function isExpectedGitFailure(error: ExecFileException): boolean {
  return (typeof error.code === 'number' && error.killed !== true) || error.code === 'ENOENT';
}

/** Options of {@link GitCliClient}. */
export interface GitCliClientOptions {
  /** Optional logger (subcommand and codes only). */
  readonly logger?: Logger;
  /** Executable (defaults to the PATH-resolved git). */
  readonly binary?: string;
}

/** Git client backed by the `git` executable (no shell). */
export class GitCliClient implements GitClient {
  /** Optional logger. */
  private readonly logger: Logger | undefined;
  /** Executable. */
  private readonly binary: string;

  /**
   * Creates the client.
   * @param options - Logger and executable.
   */
  constructor(options: GitCliClientOptions = {}) {
    this.logger = options.logger;
    this.binary = options.binary ?? resolveGitBinary(process.platform, process.env['PATH'], existsSync);
  }

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
    return (await this.run(cwd, ['--version']).catch(() => undefined)) !== undefined;
  }

  /**
   * Runs a read-only git command.
   * @param cwd - Working directory.
   * @param args - Arguments (checked by {@link assertReadOnlyGit}).
   * @returns Trimmed standard output, or `undefined` for expected failures (not a repository, unknown remote, git missing).
   * @throws {WarlogError} `INTERNAL` on operational failures (timeout, signal) instead of guessing "no repository".
   */
  private run(cwd: string, args: readonly string[]): Promise<string | undefined> {
    assertReadOnlyGit(args);
    return new Promise((resolve, reject) => {
      execFile(this.binary, [...args], { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
        if (error === null) {
          resolve(stdout.trim());
          return;
        }
        const fields = { subcommand: args[0], exit_code: error.code, signal: error.signal ?? undefined, timed_out: error.killed === true };
        this.logger?.log('debug', 'git.command_failed', fields);
        if (isExpectedGitFailure(error)) {
          resolve(undefined);
        } else {
          reject(new WarlogError('INTERNAL', `git ${args[0] ?? ''} failed`, { subcommand: args[0], timed_out: fields.timed_out }, { cause: error }));
        }
      });
    });
  }
}
