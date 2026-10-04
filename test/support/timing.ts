/**
 * Test helper: measures synchronous execution time robustly (warm-up, fastest of several runs:
 * interference from parallel test workers or coverage instrumentation only ever adds time, so the
 * fastest run is the closest to the intrinsic cost).
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
 * Runs a function once to warm up, then returns the fastest of `runs` timings.
 * @param fn - Function to time.
 * @param runs - Number of timed runs.
 * @returns Fastest elapsed milliseconds.
 */
export function fastestElapsedMs(fn: () => unknown, runs = 5): number {
  fn();
  return Math.min(...Array.from({ length: runs }, () => elapsedMs(fn)));
}

/** Size factor of {@link scalingRatio}: linear code takes ≈ 4× longer, quadratic ≈ 16×. */
export const SCALING_FACTOR = 4;

/** Ratio below which {@link scalingRatio} is considered linear (midway between 4 and 16). */
export const LINEAR_RATIO_LIMIT = 8;

/**
 * Ratio between the time on an input {@link SCALING_FACTOR} times as large and on the base
 * input (fastest runs).
 * @param make - Builds an input of the given size.
 * @param run - Function under test.
 * @param size - Base size.
 * @returns `time(4·size) / time(size)`.
 */
export function scalingRatio<T>(make: (size: number) => T, run: (input: T) => unknown, size: number): number {
  const small = make(size);
  const large = make(size * SCALING_FACTOR);
  const base = Math.max(fastestElapsedMs(() => run(small)), 0.05);
  return fastestElapsedMs(() => run(large)) / base;
}
