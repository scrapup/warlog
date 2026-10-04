/**
 * Locates the repository of a working directory (WL-02, WL-03, WL-71): every worktree resolves
 * to the main working tree, and the repository is keyed by its normalized remote.
 */
import { basename, dirname } from 'node:path';
import type { GitClient } from '../ports/git-client.port.ts';
import { normalizeRemote } from './remote-normalizer.ts';

/** A located repository. */
export interface LocatedRepo {
  /** Main working tree (shared by every worktree). */
  readonly mainWorktree: string;
  /** Repository key (normalized remote, or `local__<dir>`). */
  readonly key: string;
  /** Whether the key comes from a remote (portable across machines). */
  readonly hasRemote: boolean;
}

/** Finds the repository of a directory through read-only git commands. */
export class RepoLocator {
  /** Git client. */
  private readonly git: GitClient;

  /**
   * Creates the locator.
   * @param git - Read-only git client.
   */
  constructor(git: GitClient) {
    this.git = git;
  }

  /**
   * Locates the repository of `cwd`.
   * @param cwd - Working directory (any worktree).
   * @returns The repository, or `undefined` when `cwd` is not inside one.
   */
  async locate(cwd: string): Promise<LocatedRepo | undefined> {
    const commonDir = await this.git.commonDir(cwd);
    if (commonDir === undefined) {
      return undefined;
    }
    const mainWorktree = basename(commonDir) === '.git' ? dirname(commonDir) : commonDir;
    const url = await this.remoteUrl(cwd);
    if (url === undefined) {
      return { mainWorktree, key: `local__${basename(mainWorktree)}`, hasRemote: false };
    }
    return { mainWorktree, key: normalizeRemote(url), hasRemote: true };
  }

  /**
   * Returns the URL of `origin`, or of the first remote.
   * @param cwd - Working directory.
   * @returns The URL, or `undefined` without remotes.
   */
  private async remoteUrl(cwd: string): Promise<string | undefined> {
    const remotes = await this.git.remotes(cwd);
    const name = remotes.includes('origin') ? 'origin' : remotes[0];
    return name === undefined ? undefined : this.git.remoteUrl(cwd, name);
  }
}
