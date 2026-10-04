/**
 * Minimal file-system port used by the rules-coverage check.
 *
 * Local to the script until the core `FileSystem` port exists (US-94); then the script
 * depends on that port instead.
 */
export interface RulesFileSystem {
  /**
   * Reads a UTF-8 text file.
   * @param path - File path.
   * @returns The file content.
   */
  readText(path: string): Promise<string>;
  /**
   * Writes a UTF-8 text file, creating parent directories when missing.
   * @param path - File path.
   * @param content - Text to write.
   * @returns A promise resolved once written.
   */
  writeText(path: string, content: string): Promise<void>;
  /**
   * Lists the entry names of a directory (non-recursive).
   * @param path - Directory path.
   * @returns Entry names.
   */
  listDir(path: string): Promise<string[]>;
}
