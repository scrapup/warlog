/** Read-only git port (WL-72: warlog never stages, commits, pushes or edits ignore files). */
export interface GitClient {
  /**
   * Returns the absolute common git directory (`git rev-parse --path-format=absolute --git-common-dir`).
   * @param cwd - Working directory.
   * @returns The common dir, or `undefined` outside a repository or without git.
   */
  commonDir(cwd: string): Promise<string | undefined>;
  /**
   * Returns the working tree root of `cwd` (`git rev-parse --show-toplevel`).
   * @param cwd - Working directory.
   * @returns The top-level path, or `undefined` outside a repository.
   */
  topLevel(cwd: string): Promise<string | undefined>;
  /**
   * Lists the remote names (`git remote`).
   * @param cwd - Working directory.
   * @returns Remote names (empty when none).
   */
  remotes(cwd: string): Promise<string[]>;
  /**
   * Returns a remote's URL (`git remote get-url <name>`).
   * @param cwd - Working directory.
   * @param name - Remote name.
   * @returns The URL, or `undefined` when the remote does not exist.
   */
  remoteUrl(cwd: string, name: string): Promise<string | undefined>;
  /**
   * Returns the current branch (`git rev-parse --abbrev-ref HEAD`).
   * @param cwd - Working directory.
   * @returns The branch name, or `undefined` outside a repository.
   */
  currentBranch(cwd: string): Promise<string | undefined>;
  /**
   * Tells whether the git binary can be executed (`git --version`).
   * @param cwd - Working directory.
   * @returns `true` when git is available.
   */
  isAvailable(cwd: string): Promise<boolean>;
}
