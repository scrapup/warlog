/**
 * Node process implementation of the {@link Env} port.
 */
import { homedir } from 'node:os';
import type { Env } from '../ports/env.port.ts';

/** Environment backed by `process.env` and `node:os`. */
export class ProcessEnv implements Env {
  /**
   * Reads an environment variable.
   * @param name - Variable name.
   * @returns The value, or `undefined` when unset or empty.
   */
  get(name: string): string | undefined {
    const value = process.env[name];
    return value === undefined || value === '' ? undefined : value;
  }

  /**
   * Returns the home directory.
   * @returns Absolute path.
   */
  homeDir(): string {
    return homedir();
  }

  /**
   * Returns the working directory.
   * @returns Absolute path.
   */
  cwd(): string {
    return process.cwd();
  }
}
