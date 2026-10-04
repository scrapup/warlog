/**
 * {@link MachineIdProvider} storing the id in the local, never-synced configuration
 * directory (`$XDG_CONFIG_HOME/warlog/machine-id`, default `~/.config/warlog/machine-id`).
 */
import { isAbsolute, join } from 'node:path';
import { WarlogError, isWarlogError } from '../errors/warlog-error.ts';
import type { Env } from '../ports/env.port.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { MachineIdProvider } from '../ports/machine-id.port.ts';
import { isLowerAlnum } from '../security/char-classes.ts';

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
    out += isLowerAlnum(ch) || ch === '-' ? ch : '-';
  }
  const trimmed = out.slice(0, 40);
  return trimmed === '' ? 'host' : trimmed;
}

/**
 * Tells whether a stored machine id is well formed: `[a-z0-9-]{1,64}`.
 * @param id - Candidate.
 * @returns `true` when valid.
 */
export function isMachineId(id: string): boolean {
  return id.length >= 1 && id.length <= 64 && [...id].every((ch) => isLowerAlnum(ch) || ch === '-');
}

/** Collaborators of {@link LocalMachineId}. */
export interface LocalMachineIdDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Environment (home, `XDG_CONFIG_HOME`, host name). */
  readonly env: Env;
  /** Random byte source. */
  readonly random: (count: number) => Uint8Array;
}

/** Machine id persisted in the user's local configuration directory. */
export class LocalMachineId implements MachineIdProvider {
  /** Collaborators. */
  private readonly deps: LocalMachineIdDeps;
  /** Cached id. */
  private cached: string | undefined;

  /**
   * Creates the provider.
   * @param deps - Collaborators.
   */
  constructor(deps: LocalMachineIdDeps) {
    this.deps = deps;
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
    const xdg = this.deps.env.get('XDG_CONFIG_HOME');
    const configDir = xdg !== undefined && isAbsolute(xdg) ? xdg : join(this.deps.env.homeDir(), '.config');
    const path = join(configDir, 'warlog', 'machine-id');
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
      const value = (await this.deps.fs.readFile(path)).trim();
      if (value !== '' && !isMachineId(value)) {
        throw new WarlogError('INTERNAL', 'machine id file is malformed', { path });
      }
      return value === '' ? undefined : value;
    } catch (error: unknown) {
      if (isWarlogError(error, 'NOT_FOUND')) {
        return undefined;
      }
      if (isWarlogError(error, 'INTERNAL')) {
        throw error;
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
    const suffix = [...this.deps.random(6)].map((b) => BASE32[b % 32]).join('');
    const id = `${sanitizeHostName(this.deps.env.hostName())}-${suffix}`;
    try {
      await this.deps.fs.writeFileAtomic(path, `${id}\n`);
    } catch (error: unknown) {
      throw new WarlogError('INTERNAL', `cannot create machine id at ${path}`, { path }, { cause: error });
    }
    return id;
  }
}
