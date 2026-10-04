/**
 * {@link MachineIdProvider} storing a random id (`m-<8 base32>`, no host name: the id ends up
 * in versioned `.warlog/` files) in the local, never-synced configuration directory
 * (`$XDG_CONFIG_HOME/warlog/machine-id`, default `~/.config/warlog/machine-id`).
 * `WARLOG_MACHINE_ID` overrides it explicitly.
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
  /** Environment (home, `XDG_CONFIG_HOME`, `WARLOG_MACHINE_ID`). */
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
   * @throws {WarlogError} `INTERNAL` when the file cannot be read or written; `VALIDATION` on a malformed override.
   */
  async get(): Promise<string> {
    if (this.cached !== undefined) {
      return this.cached;
    }
    const override = this.deps.env.get('WARLOG_MACHINE_ID');
    if (override !== undefined) {
      if (!isMachineId(override)) {
        throw new WarlogError('VALIDATION', 'WARLOG_MACHINE_ID must match [a-z0-9-]{1,64}', { field: 'WARLOG_MACHINE_ID' });
      }
      this.cached = override;
      return override;
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
    const id = `m-${[...this.deps.random(8)].map((b) => BASE32[b % 32]).join('')}`;
    try {
      await this.deps.fs.writeFileAtomic(path, `${id}\n`);
    } catch (error: unknown) {
      throw new WarlogError('INTERNAL', `cannot create machine id at ${path}`, { path }, { cause: error });
    }
    return id;
  }
}
