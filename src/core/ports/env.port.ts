/** Process environment port. */
export interface Env {
  /**
   * Reads an environment variable.
   * @param name - Variable name.
   * @returns The value, or `undefined` when unset or empty.
   */
  get(name: string): string | undefined;
  /**
   * Returns the user's home directory.
   * @returns Absolute path.
   */
  homeDir(): string;
  /**
   * Returns the current working directory.
   * @returns Absolute path.
   */
  cwd(): string;
}
