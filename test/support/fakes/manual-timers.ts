/**
 * Test helper: timers advanced by hand.
 */
import type { Timers } from '../../../src/core/ports/timers.port.ts';

/** A scheduled callback. */
interface Scheduled {
  /** When it runs (virtual ms). */
  readonly at: number;
  /** Callback. */
  readonly fn: () => void;
}

/** Virtual-time timers. */
export class ManualTimers implements Timers<number> {
  /** Current virtual time. */
  now = 0;
  /** Scheduled callbacks by handle. */
  private readonly scheduled = new Map<number, Scheduled>();
  /** Next handle. */
  private next = 1;

  /**
   * Schedules a call.
   * @param fn - Callback.
   * @param ms - Delay.
   * @returns Handle.
   */
  setTimeout(fn: () => void, ms: number): number {
    const handle = this.next;
    this.next += 1;
    this.scheduled.set(handle, { at: this.now + ms, fn });
    return handle;
  }

  /**
   * Cancels a call.
   * @param handle - Handle.
   */
  clearTimeout(handle: number): void {
    this.scheduled.delete(handle);
  }

  /**
   * Number of scheduled callbacks.
   * @returns The count.
   */
  get size(): number {
    return this.scheduled.size;
  }

  /**
   * Advances virtual time, running due callbacks in order.
   * @param ms - Milliseconds.
   */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.scheduled.entries()].filter(([, s]) => s.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) {
        break;
      }
      const [handle, item] = due;
      this.now = item.at;
      this.scheduled.delete(handle);
      item.fn();
    }
    this.now = end;
  }
}
