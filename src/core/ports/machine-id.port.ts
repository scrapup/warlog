import type { WarlogError } from '../errors/warlog-error.ts';

/** Machine identity port (errors are {@link WarlogError}s) — identifies the writer of activity and entities. */
export interface MachineIdProvider {
  /**
   * Returns this machine's identifier, creating it on first use.
   * @returns The machine id (`<hostname>-<6 base32 chars>`).
   * @throws {WarlogError} `INTERNAL` when it cannot be read or created.
   */
  get(): Promise<string>;
}
