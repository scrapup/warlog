/**
 * Test helper: timers advanced by hand.
 */
import type { Timers } from '../../../src/core/index/watcher-service.ts';

/** A scheduled callback. */
interface Scheduled {
  /** When it runs (virtual ms). */
  at: number;
  /** Callback. */
  readonly fn: () => void;
  /** Period, for intervals. */
  readonly every: number | undefined;
}

/** Virtual-time timers. */
export class ManualTimers implements Timers {
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
    return this.add({ at: this.now + ms, fn, every: undefined });
  }

  /**
   * Cancels a call.
   * @param handle - Handle.
   */
  clearTimeout(handle: unknown): void {
    this.scheduled.delete(Number(handle));
  }

  /**
   * Schedules a repeated call.
   * @param fn - Callback.
   * @param ms - Period.
   * @returns Handle.
   */
  setInterval(fn: () => void, ms: number): number {
    return this.add({ at: this.now + ms, fn, every: ms });
  }

  /**
   * Cancels a repeated call.
   * @param handle - Handle.
   */
  clearInterval(handle: unknown): void {
    this.scheduled.delete(Number(handle));
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
      if (item.every === undefined) {
        this.scheduled.delete(handle);
      } else {
        item.at += item.every;
      }
      item.fn();
    }
    this.now = end;
  }

  /**
   * Registers a callback.
   * @param item - Scheduled callback.
   * @returns Handle.
   */
  private add(item: Scheduled): number {
    const handle = this.next;
    this.next += 1;
    this.scheduled.set(handle, item);
    return handle;
  }
}
