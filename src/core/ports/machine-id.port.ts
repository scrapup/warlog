import type { WarlogError } from '../errors/warlog-error.ts';

/** Machine identity port (errors are {@link WarlogError}s) — identifies the writer of activity and entities. */
export interface MachineIdProvider {
  /**
   * Returns this machine's identifier, creating it on first use. Never derived from host
   * identifiers: it is written to versioned `.warlog/` files.
   * @returns The machine id (`[a-z0-9-]{1,64}`; generated as `m-<8 base32 chars>`, or the explicit `WARLOG_MACHINE_ID` override).
   * @throws {WarlogError} `INTERNAL` when it cannot be read or created; `VALIDATION` on a malformed override.
   */
  get(): Promise<string>;
}
