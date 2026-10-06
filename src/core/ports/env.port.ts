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
  /**
   * Returns the operating system (`darwin`, `linux`, `win32`, …).
   * @returns The platform name.
   */
  platform(): string;
  /**
   * Returns the Node.js version.
   * @returns Version text (`22.22.2`).
   */
  nodeVersion(): string;
}
