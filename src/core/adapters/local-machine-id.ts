/**
 * {@link MachineIdProvider} storing the id in the local, never-synced configuration
 * directory (`$XDG_CONFIG_HOME/warlog/machine-id`, default `~/.config/warlog/machine-id`).
 */
import { join } from 'node:path';
import { WarlogError, isWarlogError } from '../errors/warlog-error.ts';
import type { Env } from '../ports/env.port.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { MachineIdProvider } from '../ports/machine-id.port.ts';

/** Crockford base32 alphabet (lower case) used for the random suffix. */
const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * Reduces a host name to `[a-z0-9-]`, at most 40 characters.
 * @param host - Raw host name.
 * @returns The sanitized name (`host` when nothing remains).
 */
export function sanitizeHostName(host: string): string {
  let out = '';
  for (const ch of host.toLowerCase()) {
    const ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-';
    out += ok ? ch : '-';
  }
  const trimmed = out.slice(0, 40);
  return trimmed === '' ? 'host' : trimmed;
}

/** Machine id persisted in the user's local configuration directory. */
export class LocalMachineId implements MachineIdProvider {
  /** File system. */
  private readonly fs: FileSystem;
  /** Environment. */
  private readonly env: Env;
  /** Random byte source (injected for tests). */
  private readonly random: (count: number) => Uint8Array;
  /** Cached id. */
  private cached: string | undefined;

  /**
   * Creates the provider.
   * @param fs - File system.
   * @param env - Environment (home, `XDG_CONFIG_HOME`, host name).
   * @param random - Random byte source.
   */
  constructor(fs: FileSystem, env: Env, random: (count: number) => Uint8Array) {
    this.fs = fs;
    this.env = env;
    this.random = random;
  }

  /**
   * Returns the machine id, creating it on first use.
   * @returns The machine id.
   * @throws {WarlogError} `INTERNAL` when the file cannot be read or written.
   */
  async get(): Promise<string> {
    if (this.cached !== undefined) {
      return this.cached;
    }
    const path = join(this.env.get('XDG_CONFIG_HOME') ?? join(this.env.homeDir(), '.config'), 'warlog', 'machine-id');
    this.cached = (await this.read(path)) ?? (await this.create(path));
    return this.cached;
  }

  /**
   * Reads an existing id.
   * @param path - Id file path.
   * @returns The id, or `undefined` when the file is missing or empty.
   */
  private async read(path: string): Promise<string | undefined> {
    try {
      const value = (await this.fs.readFile(path)).trim();
      return value === '' ? undefined : value;
    } catch (error: unknown) {
      if (isWarlogError(error, 'NOT_FOUND')) {
        return undefined;
      }
      throw new WarlogError('INTERNAL', `cannot read machine id at ${path}`, { path }, { cause: error });
    }
  }

  /**
   * Creates and stores a new id.
   * @param path - Id file path.
   * @returns The new id.
   * @throws {WarlogError} `INTERNAL` when the file cannot be written.
   */
  private async create(path: string): Promise<string> {
    const suffix = [...this.random(6)].map((b) => BASE32[b % 32]).join('');
    const id = `${sanitizeHostName(this.env.hostName())}-${suffix}`;
    try {
      await this.fs.writeFileAtomic(path, `${id}\n`);
    } catch (error: unknown) {
      throw new WarlogError('INTERNAL', `cannot create machine id at ${path}`, { path }, { cause: error });
    }
    return id;
  }
}
