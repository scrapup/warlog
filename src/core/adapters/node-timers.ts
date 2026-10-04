/**
 * {@link Timers} over the Node timers; they never keep the process alive on their own.
 */
import type { Timers } from '../index/watcher-service.ts';

/** Node timers, unreferenced. */
export const NODE_TIMERS: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  setInterval: (fn, ms) => setInterval(fn, ms).unref(),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};
