/**
 * System implementation of the {@link Clock} port.
 */
import type { Clock } from '../ports/clock.port.ts';

/** Clock reading the operating-system time. */
export class SystemClock implements Clock {
  /**
   * Returns the current instant.
   * @returns The current date.
   */
  now(): Date {
    return new Date();
  }
}
