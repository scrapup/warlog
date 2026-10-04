/**
 * Test helper: measures synchronous execution time.
 */

/**
 * Runs a function and returns its duration.
 * @param fn - Function to time.
 * @returns Elapsed milliseconds.
 */
export function elapsedMs(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/** Time budget of adversarial inputs (SEC-22). */
export const ADVERSARIAL_BUDGET_MS = 200;

/** Minimum length of adversarial inputs (SEC-22). */
export const ADVERSARIAL_LENGTH = 20_000;
