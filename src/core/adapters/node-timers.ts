/**
 * {@link Timers} over the Node timers; they never keep the process alive on their own.
 */
import type { Timers } from '../ports/timers.port.ts';

/** Node timers, unreferenced. */
export class NodeTimers implements Timers<NodeJS.Timeout> {
  /**
   * Schedules a call.
   * @param fn - Callback.
   * @param ms - Delay.
   * @returns The timer.
   */
  setTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    return setTimeout(fn, ms).unref();
  }

  /**
   * Cancels a call.
   * @param handle - Timer.
   */
  clearTimeout(handle: NodeJS.Timeout): void {
    clearTimeout(handle);
  }
}
