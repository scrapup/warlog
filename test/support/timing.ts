/**
 * Test helper: measures synchronous execution time robustly (warm-up, median of runs).
 */

/** Time budget of adversarial inputs (SEC-22). */
export const ADVERSARIAL_BUDGET_MS = 200;

/** Minimum length of adversarial inputs (SEC-22). */
export const ADVERSARIAL_LENGTH = 20_000;

/**
 * Runs a function once and returns its duration.
 * @param fn - Function to time.
 * @returns Elapsed milliseconds.
 */
export function elapsedMs(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/**
 * Runs a function once to warm up, then returns the median of `runs` timings.
 * @param fn - Function to time.
 * @param runs - Number of timed runs (odd).
 * @returns Median elapsed milliseconds.
 */
export function medianElapsedMs(fn: () => unknown, runs = 3): number {
  fn();
  const samples = Array.from({ length: runs }, () => elapsedMs(fn)).sort((a, b) => a - b);
  return samples[Math.floor(runs / 2)] ?? Number.POSITIVE_INFINITY;
}

/**
 * Ratio between the time on an input twice as large and on the base input; ≈ 2 for a linear
 * algorithm, ≈ 4 for a quadratic one.
 * @param make - Builds an input of the given size.
 * @param run - Function under test.
 * @param size - Base size.
 * @returns `time(2·size) / time(size)` (medians).
 */
export function scalingRatio<T>(make: (size: number) => T, run: (input: T) => unknown, size: number): number {
  const small = make(size);
  const large = make(size * 2);
  const base = Math.max(medianElapsedMs(() => run(small), 5), 0.05);
  return medianElapsedMs(() => run(large), 5) / base;
}
