/**
 * Bounded concurrency for file scans (plan §3.7: at most 64 open files).
 */

/** Maximum number of files read at the same time by a scan. */
export const MAX_OPEN_FILES = 64;

/**
 * Maps items with at most `limit` calls in flight, keeping the input order.
 * @param items - Items.
 * @param limit - Maximum concurrent calls (≥ 1).
 * @param fn - Mapper.
 * @returns The results, in input order.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  /**
   * Processes items until none are left.
   * @returns When the queue is empty.
   */
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
