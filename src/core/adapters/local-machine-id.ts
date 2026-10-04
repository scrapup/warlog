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
import { assertValid, isMachineId } from '../security/identifiers.ts';

/** Environment variable overriding the stored machine id. */
const OVERRIDE_VAR = 'WARLOG_MACHINE_ID';

/** Random characters of a generated id. */
const ID_RANDOM_CHARS = 8;

/** Crockford base32 alphabet (lower case) used for the random suffix. */
const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';

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
  /** Cached id (or the in-flight resolution, so concurrent first calls share it). */
  private cached: string | undefined;
  /** In-flight resolution. */
  private pending: Promise<string> | undefined;

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
    const override = this.deps.env.get(OVERRIDE_VAR);
    if (override !== undefined) {
      assertValid(isMachineId(override), OVERRIDE_VAR, 'a machine id ([a-z0-9-]{1,64})');
      this.cached = override;
      return override;
    }
    this.pending ??= this.resolveStored().catch((error: unknown) => {
      this.pending = undefined;
      throw error;
    });
    this.cached = await this.pending;
    return this.cached;
  }

  /**
   * Reads the stored id or creates it.
   * @returns The id.
   * @throws {WarlogError} `INTERNAL` when the file cannot be read or written.
   */
  private async resolveStored(): Promise<string> {
    const xdg = this.deps.env.get('XDG_CONFIG_HOME');
    const configDir = xdg !== undefined && isAbsolute(xdg) ? xdg : join(this.deps.env.homeDir(), '.config');
    const path = join(configDir, 'warlog', 'machine-id');
    return (await this.read(path)) ?? (await this.create(path));
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
        throw new WarlogError('INTERNAL', 'machine id file is malformed', { file: 'machine-id' });
      }
      return value === '' ? undefined : value;
    } catch (error: unknown) {
      if (isWarlogError(error, 'NOT_FOUND')) {
        return undefined;
      }
      if (isWarlogError(error, 'INTERNAL')) {
        throw error;
      }
      throw new WarlogError('INTERNAL', 'cannot read the machine id file', { file: 'machine-id' }, { cause: error });
    }
  }

  /**
   * Creates and stores a new id.
   * @param path - Id file path.
   * @returns The new id.
   * @throws {WarlogError} `INTERNAL` when the file cannot be written.
   */
  private async create(path: string): Promise<string> {
    const id = `m-${[...this.deps.random(ID_RANDOM_CHARS)].map((b) => BASE32[b % BASE32.length]).join('')}`;
    try {
      await this.deps.fs.writeFileAtomic(path, `${id}\n`);
    } catch (error: unknown) {
      throw new WarlogError('INTERNAL', 'cannot create the machine id file', { file: 'machine-id' }, { cause: error });
    }
    return id;
  }
}
