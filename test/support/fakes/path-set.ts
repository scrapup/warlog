/**
 * Test helper: a set of paths normalized to `/` (so tests may use native paths).
 */
import { norm } from './path-map.ts';

/** Set of normalized paths. */
export class PathSet extends Set<string> {
  /**
   * Adds a path.
   * @param value - Path.
   * @returns The set.
   */
  override add(value: string): this {
    return super.add(norm(value));
  }

  /**
   * Tells whether a path is present.
   * @param value - Path.
   * @returns `true` when present.
   */
  override has(value: string): boolean {
    return super.has(norm(value));
  }

  /**
   * Removes a path.
   * @param value - Path.
   * @returns `true` when removed.
   */
  override delete(value: string): boolean {
    return super.delete(norm(value));
  }
}
