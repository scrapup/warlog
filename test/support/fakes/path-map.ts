/**
 * Test helper: a map whose path keys are normalized to `/` (so tests may use native paths).
 */

/**
 * Normalizes a path to forward slashes without a trailing slash.
 * @param path - Raw path.
 * @returns Normalized path.
 */
export function norm(path: string): string {
  const p = path.split('\\').join('/');
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Map keyed by normalized paths. */
export class PathMap<V> extends Map<string, V> {
  /**
   * Sets a value.
   * @param key - Path.
   * @param value - Value.
   * @returns The map.
   */
  override set(key: string, value: V): this {
    return super.set(norm(key), value);
  }

  /**
   * Reads a value.
   * @param key - Path.
   * @returns The value.
   */
  override get(key: string): V | undefined {
    return super.get(norm(key));
  }

  /**
   * Tells whether a path is present.
   * @param key - Path.
   * @returns `true` when present.
   */
  override has(key: string): boolean {
    return super.has(norm(key));
  }

  /**
   * Removes a path.
   * @param key - Path.
   * @returns `true` when removed.
   */
  override delete(key: string): boolean {
    return super.delete(norm(key));
  }
}
