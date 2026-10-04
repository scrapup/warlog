/**
 * Monotonic ULID implementation of the {@link IdGenerator} port (WL-07).
 */
import { monotonicFactory } from 'ulid';
import type { Clock } from '../ports/clock.port.ts';
import type { IdGenerator } from '../ports/id-generator.port.ts';

/** Generates strictly increasing ULIDs, even within the same millisecond. */
export class UlidGenerator implements IdGenerator {
  /** Monotonic ULID factory. */
  private readonly factory: (seedTime?: number) => string;
  /** Time source. */
  private readonly clock: Clock;

  /**
   * Creates the generator.
   * @param clock - Time source (ULIDs embed creation time).
   */
  constructor(clock: Clock) {
    this.factory = monotonicFactory();
    this.clock = clock;
  }

  /**
   * Generates the next identifier.
   * @returns A ULID greater than every previous one of this generator.
   */
  next(): string {
    return this.factory(this.clock.now().getTime());
  }
}
