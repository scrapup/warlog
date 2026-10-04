/**
 * Timers port (watcher debounce and rescans), injected so tests control time.
 */

/** Timer functions; `H` is the handle type of the implementation. */
export interface Timers<H = unknown> {
  /**
   * Schedules a call.
   * @param fn - Callback.
   * @param ms - Delay.
   * @returns A handle.
   */
  setTimeout(fn: () => void, ms: number): H;
  /**
   * Cancels a scheduled call.
   * @param handle - Handle.
   */
  clearTimeout(handle: H): void;
}
