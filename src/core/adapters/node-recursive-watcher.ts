/**
 * {@link Watcher} over `fs.watch` with `recursive: true` (Linux, macOS, Windows on Node ≥ 22).
 * A failure to start (missing root, `EMFILE`, unsupported) is reported through `onError`, so the
 * caller falls back to periodic rescans. The root is checked first: on Linux the recursive watch
 * of a missing directory would otherwise stay silent.
 */
import { statSync, watch } from 'node:fs';
import { sep } from 'node:path';
import type { StopWatching, Watcher } from '../ports/watcher.port.ts';

/**
 * Keeps a thrown error (and its `code`), wrapping anything else.
 * @param error - Thrown value.
 * @returns An error.
 */
function toError(error: unknown): Error {
  return typeof error === 'object' && error !== null && 'message' in error ? (error as Error) : new Error(String(error));
}

/** Recursive watcher over the Node file system. */
export class NodeRecursiveWatcher implements Watcher {
  /**
   * Watches a directory tree.
   * @param root - Directory.
   * @param onChange - Receives the changed path relative to `root` (`/`-separated; `''` when unknown).
   * @param onError - Receives watcher failures.
   * @returns A function stopping the watch.
   */
  watch(root: string, onChange: (relativePath: string) => void, onError: (error: Error) => void): StopWatching {
    try {
      if (!statSync(root).isDirectory()) {
        throw Object.assign(new Error(`not a directory: ${root}`), { code: 'ENOTDIR' });
      }
      const watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
        onChange(filename === null ? '' : String(filename).split(sep).join('/'));
      });
      watcher.on('error', onError);
      return () => watcher.close();
    } catch (error: unknown) {
      queueMicrotask(() => onError(toError(error)));
      return () => undefined;
    }
  }
}
