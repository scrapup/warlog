/** File-system port used by the compliant domain fixture. */
export interface FileSystem {
  /**
   * Reads a file.
   * @param path - File path.
   * @returns The content.
   */
  readText(path: string): Promise<string>;
}
