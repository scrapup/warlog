/**
 * Test helper: in-memory streams and files for the command line.
 */
import type { CliIo } from '../../../src/adapters/cli/cli-builder.ts';

/** Captured streams over an in-memory file map. */
export class MemoryCliIo implements CliIo {
  /** Standard output so far. */
  out = '';
  /** Standard error so far. */
  err = '';
  /** Files by path. */
  readonly files = new Map<string, string>();
  /** Standard input content. */
  stdin = '';

  /**
   * Captures standard output.
   * @param text - Text.
   */
  stdout(text: string): void {
    this.out += text;
  }

  /**
   * Captures standard error.
   * @param text - Text.
   */
  stderr(text: string): void {
    this.err += text;
  }

  /**
   * Reads a file from the map.
   * @param path - Path.
   * @returns Content.
   * @throws {Error} ENOENT when absent.
   */
  async readFile(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return text;
  }

  /**
   * Returns the configured standard input.
   * @returns Content.
   */
  async readStdin(): Promise<string> {
    return this.stdin;
  }
}
